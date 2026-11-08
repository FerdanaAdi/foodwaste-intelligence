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
