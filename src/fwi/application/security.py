"""Synthetic access use cases. All locks are held to application commit/rollback.

Global order: principal -> session -> membership -> intent. Revocations take the
same principal lock. There is deliberately no public administration API in Gate A.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from uuid import UUID

from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from fwi.infrastructure.ingress import trusted_peer

from fwi.infrastructure.database.models import (
    AuditEvent, AuthSession, LoginThrottle, Membership, PreAuth, Principal, WriteIntent,
)

ORIGIN = 'https://127.0.0.1:5173'
SESSION_COOKIE = '__Host-fwi-session'
PREAUTH_COOKIE = '__Host-fwi-preauth'
HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4,
                        hash_len=32, salt_len=16, type=Type.ID)
# Equal-cost unknown-account verification; no usable credential is persisted.
DUMMY_HASH = HASHER.hash(secrets.token_urlsafe(32))
P1_READ_ACTIONS = frozenset({
    'receipt.read', 'lot.read', 'movement.read', 'menu.read', 'recipe.read', 'batch.read',
    'delivery.read', 'service.read', 'link.read', 'disposition.read', 'trends.read',
    'kpi.read', 'costref.read', 'alert.read',
})
P1_WRITE_ACTIONS = frozenset({
    'p1.create', 'receipt.create', 'lot.create', 'movement.create', 'menu.create',
    'recipe.create', 'batch.create', 'delivery.create', 'service.create', 'link.create',
    'disposition.create', 'costref.create', 'alert.ack',
})
PERMISSIONS = {
    'writer': frozenset({'event.create', 'event.read', 'measurement.create', 'measurement.read'})
    | P1_READ_ACTIONS | P1_WRITE_ACTIONS,
    'reader': frozenset({'event.read', 'measurement.read'}) | P1_READ_ACTIONS,
}


class Denied(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__('access denied')


def now():
    return datetime.now(timezone.utc)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_for(secret):
    return hmac.new(secret.encode(), b'fwi-csrf-v1', hashlib.sha256).hexdigest()


def valid_csrf(value, expected_hash):
    return bool(value) and hmac.compare_digest(digest(value), expected_hash)


def transport(request, write=False):
    try:
        trusted_peer(request.scope)
    except ValueError:
        raise Denied(403) from None
    # Reject proxy protocol overrides, including when an ASGI server would trust
    # loopback X-Forwarded-Proto by default. TLS must reach this boundary directly.
    if any(name in request.headers for name in ('forwarded', 'x-forwarded-proto', 'x-forwarded-host')):
        raise Denied(403)
    if request.url.scheme != 'https':
        raise Denied(403)
    origin = request.headers.get('origin')
    if origin is not None:
        if origin != ORIGIN:
            raise Denied(403)
    elif write or (request.headers.get('sec-fetch-site') != 'same-origin'
                   or not request.headers.get('referer', '').startswith(ORIGIN + '/')):
        raise Denied(403)


def transaction_settings(session):
    session.execute(text("SET LOCAL lock_timeout = '5s'"))


@dataclass
class Access:
    session: object
    principal: Principal
    login_session: AuthSession
    intent: WriteIntent | None = None


@contextmanager
def protected(factory, secret, csrf=None, write=False, activity=True):
    if not secret or len(secret) > 128:
        raise Denied(401)
    with factory() as session, session.begin():
        transaction_settings(session)
        candidate = session.scalar(select(AuthSession.principal_id).where(AuthSession.secret_hash == digest(secret)))
        if candidate is None:
            raise Denied(401)
        principal = session.scalar(select(Principal).where(Principal.principal_id == candidate).with_for_update())
        login_session = session.scalar(select(AuthSession).where(AuthSession.secret_hash == digest(secret)).with_for_update())
        instant = now()  # after lock acquisition, not before a potentially long wait
        if (not principal or not principal.enabled or not login_session or login_session.revoked
                or instant >= login_session.expires_at
                or instant >= login_session.last_seen_at + timedelta(minutes=30)):
            raise Denied(401)
        if write and not valid_csrf(csrf, login_session.csrf_hash):
            raise Denied(403)
        if activity:
            login_session.last_seen_at = instant
        yield Access(session, principal, login_session)


def permit(access, site_id, action, conceal=False):
    member = access.session.scalar(select(Membership).where(
        Membership.principal_id == access.principal.principal_id,
        Membership.site_id == site_id).with_for_update())
    if not member or not member.active:
        raise Denied(404 if conceal else 403)
    if action not in PERMISSIONS.get(member.role, ()):
        raise Denied(403)
    return member


def consume_intent(access, reference, kind, site_id, event_id=None):
    try:
        identifier = UUID(reference or '')
    except (ValueError, TypeError, AttributeError):
        raise Denied(409) from None
    intent = access.session.scalar(select(WriteIntent).where(
        WriteIntent.intent_id == identifier,
        WriteIntent.principal_id == access.principal.principal_id).with_for_update())
    if (intent is None or intent.state != 'registered' or intent.kind != kind
            or intent.site_id != site_id or intent.event_id != event_id):
        raise Denied(409)
    access.intent = intent


def complete_intent(access, result_id, event_id):
    access.intent.state = 'committed'
    access.intent.result_id = result_id
    access.intent.event_id = event_id


def security_audit(session, actor_id, entity_type, entity_id, action, reason):
    session.add(AuditEvent(actor=str(actor_id) if actor_id else 'synthetic-demo-actor',
        actor_principal_id=actor_id, entity_type=entity_type, entity_id=entity_id,
        action=action, reason=reason, recorded_at=now()))
    session.flush()


def bootstrap(factory):
    secret = secrets.token_urlsafe(32)
    csrf = csrf_for(secret)
    with factory() as session, session.begin():
        session.add(PreAuth(secret_hash=digest(secret), csrf_hash=digest(csrf),
                            expires_at=now() + timedelta(minutes=5)))
    return secret, csrf


def login(factory, username, password, preauth_secret, csrf, source):
    secret = secrets.token_urlsafe(32)
    success = False
    blocked = False
    with factory() as session, session.begin():
        transaction_settings(session)
        preauth = session.scalar(select(PreAuth).where(
            PreAuth.secret_hash == digest(preauth_secret or '')).with_for_update())
        if not preauth or preauth.consumed or now() >= preauth.expires_at or not valid_csrf(csrf, preauth.csrf_hash):
            raise Denied(403)
        buckets = []
        # Source -> account ordering, persistent across processes/restarts.
        # A blocked source cannot grow new per-account rows with random usernames.
        keys = [(digest('source:' + source), 30), (digest('account:' + username), 5)]
        for key, limit in keys:
            session.execute(insert(LoginThrottle).values(key=key, window_start=now(), failures=0).on_conflict_do_nothing())
            bucket = session.scalar(select(LoginThrottle).where(LoginThrottle.key == key).with_for_update())
            if now() >= bucket.window_start + timedelta(minutes=15):
                bucket.window_start, bucket.failures = now(), 0
            blocked |= bucket.failures >= limit
            buckets.append(bucket)
            if blocked:
                break
        if not blocked:
            principal = session.scalar(select(Principal).where(Principal.username == username).with_for_update())
            try:
                valid = HASHER.verify(principal.password_hash if principal else DUMMY_HASH, password)
            except VerificationError:
                valid = False
            success = bool(valid and principal and principal.enabled)
            if success:
                preauth.consumed = True
                instant = now()
                issued_session = AuthSession(principal_id=principal.principal_id,
                    secret_hash=digest(secret), csrf_hash=digest(csrf_for(secret)),
                    issued_at=instant, last_seen_at=instant, expires_at=instant + timedelta(hours=8))
                session.add(issued_session)
                session.flush()
                identity = (str(principal.principal_id), str(issued_session.session_id))
            else:
                for bucket in buckets:
                    bucket.failures += 1
    # Failed-login accounting commits deliberately; never rollback the throttle.
    if blocked:
        raise Denied(429)
    if not success:
        raise Denied(401)
    return secret, csrf_for(secret), identity


def revoke_session(factory, principal_id, session_id):
    """Internal trusted use case, not a public admin endpoint."""
    with factory() as session, session.begin():
        transaction_settings(session)
        principal = session.scalar(select(Principal).where(Principal.principal_id == principal_id).with_for_update())
        if not principal:
            raise Denied(404)
        record = session.scalar(select(AuthSession).where(AuthSession.session_id == session_id,
            AuthSession.principal_id == principal_id).with_for_update())
        if not record:
            raise Denied(404)
        record.revoked = True
        security_audit(session, principal_id, 'auth_sessions', record.session_id,
                       'revoked', 'trusted synthetic session revocation')


def revoke_membership(factory, principal_id, site_id):
    with factory() as session, session.begin():
        transaction_settings(session)
        principal = session.scalar(select(Principal).where(Principal.principal_id == principal_id).with_for_update())
        if not principal:
            raise Denied(404)
        record = session.scalar(select(Membership).where(Membership.principal_id == principal_id,
            Membership.site_id == site_id).with_for_update())
        if not record:
            raise Denied(404)
        record.active = False
        security_audit(session, None, 'auth_memberships', record.membership_id,
                       'revoked', 'trusted synthetic maintenance; no public admin API')


def disable_principal(factory, principal_id):
    with factory() as session, session.begin():
        transaction_settings(session)
        principal = session.scalar(select(Principal).where(Principal.principal_id == principal_id).with_for_update())
        if not principal:
            raise Denied(404)
        principal.enabled = False
        security_audit(session, None, 'auth_principals', principal_id,
                       'disabled', 'trusted synthetic maintenance; no public admin API')
