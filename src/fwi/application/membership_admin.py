"""Site-only membership commands. Caller must hold protected actor+target locks."""
from uuid import UUID
from sqlalchemy import select
from fwi.application import security
from fwi.infrastructure.database.models import (
    AuditEvent, Membership, MembershipAdmin, MembershipChange, MembershipEligibility, Principal,
)


def permit_admin(access, site_id):
    if access is None:
        raise security.Denied(403)
    grant = access.session.scalar(select(MembershipAdmin).where(
        MembershipAdmin.principal_id == access.principal.principal_id,
        MembershipAdmin.site_id == site_id).with_for_update())
    if grant is None:
        raise security.Denied(403)


def list_memberships(access, site_id):
    permit_admin(access, site_id)
    # Include only this site's roster/memberships. Never expose password/session fields.
    eligible = select(MembershipEligibility.principal_id).where(MembershipEligibility.site_id == site_id)
    members = select(Membership.principal_id).where(Membership.site_id == site_id)
    principals = access.session.scalars(select(Principal).where(
        Principal.principal_id.in_(eligible.union(members))).order_by(Principal.username))
    result = []
    for principal in principals:
        member = access.session.scalar(select(Membership).where(
            Membership.principal_id == principal.principal_id, Membership.site_id == site_id))
        result.append(dict(principal_id=str(principal.principal_id), username=principal.username,
            role=member.role if member else None, active=member.active if member else None,
            eligible=access.session.get(MembershipEligibility, (principal.principal_id, site_id)) is not None,
            enabled=principal.enabled))
    return result


def change_membership(access, site_id, principal_id, action, role, reason, expected_role, expected_active):
    permit_admin(access, site_id)
    if principal_id == access.principal.principal_id:
        raise security.Denied(403)
    # Demand the transaction-level target lock as well as the actor lock. Service
    # callers cannot skip the ordering protocol by constructing Access manually.
    if principal_id not in getattr(access, 'locked_principal_ids', ()):
        raise security.Denied(403)
    eligibility = access.session.scalar(select(MembershipEligibility).where(
        MembershipEligibility.principal_id == principal_id,
        MembershipEligibility.site_id == site_id).with_for_update())
    target = access.session.get(Principal, principal_id)
    member = access.session.scalar(select(Membership).where(
        Membership.principal_id == principal_id, Membership.site_id == site_id).with_for_update())
    # Removing an existing site grant needs no new eligibility assertion. Grant,
    # role change and reactivation still require the explicit approved roster.
    if target is None or (action == 'revoke' and member is None) or (action != 'revoke' and eligibility is None):
        raise security.Denied(404)
    old_role, old_active = (member.role, member.active) if member else (None, None)
    if (old_role, old_active) != (expected_role, expected_active):
        raise security.Denied(409)
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 1000:
        raise security.Denied(400)
    reason = reason.strip()
    if action == 'grant':
        if member is not None or role not in ('reader', 'writer') or not target.enabled:
            raise security.Denied(409)
        member = Membership(principal_id=principal_id, site_id=site_id, role=role, active=True)
        access.session.add(member)
    elif action == 'change_role':
        if not member or not member.active or role not in ('reader', 'writer') or role == member.role or not target.enabled:
            raise security.Denied(409)
        member.role = role
    elif action in ('revoke', 'reactivate'):
        if not member or role is not None or member.active == (action == 'reactivate'):
            raise security.Denied(409)
        if action == 'reactivate' and not target.enabled:
            raise security.Denied(409)
        member.active = action == 'reactivate'
    else:
        raise security.Denied(400)
    access.session.flush()
    instant = security.now()
    audit = AuditEvent(actor=str(access.principal.principal_id), actor_principal_id=access.principal.principal_id,
        entity_type='auth_memberships', entity_id=member.membership_id, action=action, reason=reason, recorded_at=instant)
    access.session.add(audit)
    access.session.flush()
    access.session.add(MembershipChange(audit_id=audit.audit_id, principal_id=principal_id, site_id=site_id,
        old_role=old_role, old_active=old_active, new_role=member.role, new_active=member.active,
        reason=reason, recorded_at=instant))
    access.session.flush()
    return dict(principal_id=str(principal_id), site_id=str(site_id), role=member.role, active=member.active,
                audit_id=str(audit.audit_id))
