"""Provisional P1 material-flow lineage invariants (FR-104 candidate).

A flow link records a typed relationship between separately identified
material objects. Creating a link never creates a waste generation event, and
event counts are derived from distinct canonical event identities, not from
the number of links or observations (FWI-02 BR-01..04; P1-AC-07).
"""
from collections import deque

PROVISIONAL_LINK_TYPES = frozenset({'waste_event', 'lot', 'batch', 'delivery', 'meal_service'})
PROVISIONAL_RELATION_CODES = frozenset({
    'derived_from', 'input_to', 'transfer_of', 'disposition_of', 'rework_of', 'leftover_of',
})
# Bounded defensive walk so a pathological link graph cannot loop a request.
_MAX_LINEAGE_WALK = 64


def validate_link(source_type, source_id, target_type, target_id):
    """Reject a link that points an object at itself (P1-AC-08)."""
    if source_type not in PROVISIONAL_LINK_TYPES or target_type not in PROVISIONAL_LINK_TYPES:
        raise ValueError('unsupported provisional lineage object type')
    if (source_type, source_id) == (target_type, target_id):
        raise ValueError('self-referential lineage link rejected')


def creates_cycle(edges, source_key, target_key):
    """True if adding source -> target closes a directed cycle.

    Directed-acyclic material causality is treated conservatively for this
    candidate (a causal loop cannot be a valid material flow); whether the DAG
    rule is mandated stays a recorded decision (P1 draft FR-104).
    """
    adjacency = {}
    for edge in edges:
        adjacency.setdefault((edge.source_type, edge.source_id), []).append(
            (edge.target_type, edge.target_id))
    seen = set()
    queue = deque([target_key])
    while queue:
        node = queue.popleft()
        if node == source_key:
            return True
        if node in seen or len(seen) >= _MAX_LINEAGE_WALK:
            continue
        seen.add(node)
        queue.extend(adjacency.get(node, ()))
    return False


def distinct_source_event_count(links) -> int:
    """Count distinct canonical waste-event identities appearing as link sources.

    Two transfers recorded against one event still count once (P1-AC-07); the
    count is over distinct stable event ids, never over edges or observations.
    """
    return len({link.source_id for link in links if link.source_type == 'waste_event'})
