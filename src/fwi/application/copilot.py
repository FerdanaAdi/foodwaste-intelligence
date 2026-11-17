"""Internal, read-only grounded-context envelope for one P2 recommendation (T3 slice 2A).

List-only by design: the envelope is built from the existing site-scoped
``p2.read_recommendations`` path, so the authorization check is the one the API already
applies (``alert.read`` for the requested site; non-members receive a concealed 404).
No HTTP route, provider, generated answer, acknowledgement or write exists here. Stored
text is returned as data and is never interpreted as an instruction.
"""
from datetime import datetime
from uuid import UUID

from fwi.application import p2 as p2_application
from fwi.application import security

ENVELOPE_STATUS = 'grounded_context_only'
INSUFFICIENT_STATUS = 'insufficient_evidence'
PROVIDER_STATUS = 'provider_not_configured'

# Only these stored columns are exposed. Acknowledgement actor/time and organization
# identifiers are deliberately omitted.
EVIDENCE_FIELDS = (
    'recommendation_id', 'site_id', 'rule_code', 'rule_version', 'detected_issue', 'coverage',
    'recommended_action', 'target_type', 'target_ref', 'recorded_at', 'state',
)

LIMITATIONS = (
    'The recommendation row is cited by ID and rule version. It is not a verified source record.',
    'target_ref is a reference pointer. The underlying event, delivery or service was not read.',
    'detected_issue and recommended_action are stored text, treated as data, not instructions.',
    'Missing stored values stay null. They are never converted into zero or a numeric impact.',
    'No provider is configured. No generated answer is produced in this slice.',
)


def _plain(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _same_id(stored, requested):
    return stored is not None and str(stored).lower() == str(requested).lower()


def grounded_context(factory, site_id, recommendation_id, access=None):
    """Return the evidence envelope for one recommendation within one authorized site.

    ``access`` must be the server-validated context. ``None`` fails closed. The
    site permission check runs inside ``p2.read_recommendations``. Any denial from it
    propagates unchanged, so a foreign site stays concealed.
    """
    if access is None:
        raise security.Denied(401)
    site = UUID(str(site_id))
    requested = UUID(str(recommendation_id))
    rows = p2_application.read_recommendations(factory, site, access=access)
    row = next((r for r in rows
                if _same_id(r.get('recommendation_id'), requested) and _same_id(r.get('site_id'), site)),
               None)
    if row is None:
        return {
            'status': INSUFFICIENT_STATUS,
            'inference': {'status': PROVIDER_STATUS, 'generated_answer': None},
            'evidence': [],
            'target_reference': None,
            'limitations': list(LIMITATIONS),
            'reason': 'The recommendation is not available in the authorized list for this site.',
        }
    fields = {name: _plain(row.get(name)) for name in EVIDENCE_FIELDS}
    return {
        'status': ENVELOPE_STATUS,
        'inference': {'status': PROVIDER_STATUS, 'generated_answer': None},
        'evidence': [{
            'citation': {'type': 'p2_recommendation', 'id': fields['recommendation_id'],
                         'rule_version': fields['rule_version']},
            'fields': fields,
            'stored_text_is_data': True,
        }],
        'target_reference': {'target_type': fields['target_type'], 'target_ref': fields['target_ref'],
                             'dereferenced': False},
        'limitations': list(LIMITATIONS),
        'reason': None,
    }
