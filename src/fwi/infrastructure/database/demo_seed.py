"""Explicit synthetic fixture, invoked by tests/local setup; never on app startup."""

from datetime import datetime, timezone
from uuid import UUID

from fwi.application.demo import audit
from fwi.infrastructure.database.models import Organization, Site

ORGANIZATION_ID = UUID('11111111-1111-4111-8111-111111111111')
SITE_ID = UUID('22222222-2222-4222-8222-222222222222')


def seed_demo(factory):
    with factory() as session, session.begin():
        if session.get(Organization, ORGANIZATION_ID) is None:
            organization = Organization(organization_id=ORGANIZATION_ID, name='Synthetic Demo Organization', recorded_at=datetime.now(timezone.utc))
            session.add(organization)
            audit(session, organization)
        if session.get(Site, SITE_ID) is None:
            site = Site(site_id=SITE_ID, organization_id=ORGANIZATION_ID, name='Synthetic Demo Site', recorded_at=datetime.now(timezone.utc))
            session.add(site)
            audit(session, site)
