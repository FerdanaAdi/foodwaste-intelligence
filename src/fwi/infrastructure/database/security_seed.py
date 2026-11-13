"""Explicit synthetic principals only; never executed at application startup."""
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select
from fwi.application.demo import audit
from fwi.application.security import HASHER, security_audit
from fwi.infrastructure.database.demo_seed import ORGANIZATION_ID, SITE_ID, seed_demo
from fwi.infrastructure.database.models import Membership, Principal, Site

SITE_B = UUID('22222222-2222-4222-8222-222222222223')
PERSONAS = {'site_a_writer': (SITE_ID, 'writer'), 'site_a_reader': (SITE_ID, 'reader'),
            'site_b_writer': (SITE_B, 'writer')}


def seed_security(factory, passwords):
    if set(passwords) != set(PERSONAS) or any(len(p) < 16 for p in passwords.values()):
        raise ValueError('provide three distinct synthetic persona credentials (minimum 16 characters)')
    if len(set(passwords.values())) != 3:
        raise ValueError('synthetic credentials must be distinct')
    seed_demo(factory)
    with factory() as session, session.begin():
        if session.get(Site, SITE_B) is None:
            site = Site(site_id=SITE_B, organization_id=ORGANIZATION_ID,
                        name='Synthetic Site B', recorded_at=datetime.now(timezone.utc))
            session.add(site)
            audit(session, site)
        for username, (site_id, role) in PERSONAS.items():
            principal = session.scalar(select(Principal).where(Principal.username == username))
            if principal is not None:
                continue  # Never reset an existing password or regrant revoked membership.
            principal = Principal(username=username, password_hash=HASHER.hash(passwords[username]))
            session.add(principal)
            session.flush()
            member = Membership(principal_id=principal.principal_id, site_id=site_id, role=role)
            session.add(member)
            session.flush()
            security_audit(session, None, 'auth_principals', principal.principal_id, 'seeded', 'explicit synthetic seed')
            security_audit(session, None, 'auth_memberships', member.membership_id, 'seeded', 'explicit synthetic seed')


def seed_membership_administration(factory, username, site_id):
    """Trusted explicit bootstrap only; never called by startup or a public API.

    Eligibility is exactly the previously approved PERSONAS site roster. A site
    membership (or organization equality) alone does not prove eligibility.
    No passwords/accounts are created and no revoked membership is reactivated.
    """
    from fwi.infrastructure.database.models import MembershipAdmin, MembershipEligibility
    if username not in PERSONAS or PERSONAS[username][0] != site_id:
        raise ValueError('bootstrap requires an approved synthetic persona at its exact site')
    with factory() as session, session.begin():
        principal = session.scalar(select(Principal).where(Principal.username == username).with_for_update())
        if principal is None or not principal.enabled or session.get(Site, site_id) is None:
            raise ValueError('seed existing enabled synthetic principals and sites first')
        for name, (allowed_site, _) in PERSONAS.items():
            if allowed_site != site_id:
                continue
            target = session.scalar(select(Principal).where(Principal.username == name))
            if target is None:
                raise ValueError('approved synthetic roster incomplete')
            key = (target.principal_id, site_id)
            if session.get(MembershipEligibility, key) is None:
                session.add(MembershipEligibility(principal_id=key[0], site_id=key[1]))
                security_audit(session, None, 'auth_membership_eligibility', target.principal_id,
                    'seeded', 'approved synthetic PERSONAS site roster: ' + str(site_id))
        if session.get(MembershipAdmin, (principal.principal_id, site_id)) is None:
            session.add(MembershipAdmin(principal_id=principal.principal_id, site_id=site_id))
            security_audit(session, None, 'auth_membership_admins', principal.principal_id,
                'seeded', 'explicit trusted synthetic site admin bootstrap: ' + str(site_id))
