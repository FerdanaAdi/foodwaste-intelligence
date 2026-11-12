"""Provisional P1 receiving, lot and inventory-movement invariants (FR-101 candidate).

Movement types below are PROPOSED engineering candidates from the P1 PRD
extension draft; they are not final FWI-02/FWI-03 decisions. A movement is a
stock observation or mutation of an identified lot. A movement, a lot transfer
or a stock correction is never a new waste generation (FWI-02 BR-01..04; PRD
DR-03). The lot quantity recorded at receipt is the implicit initial intake;
later movements mutate the provisional observed stock from there.
"""
from decimal import Decimal

PROVISIONAL_MOVEMENT_TYPES = frozenset({
    'issue_to_batch', 'return_from_batch', 'transfer', 'stock_correction',
})
PROVISIONAL_MOVEMENT_DIRECTIONS = frozenset({'in', 'out'})
# Direction each movement type must carry; transfer and stock_correction may
# go either way and the receiving side of a transfer is tracked separately
# pending EXT-OD-05 (inventory ownership and reconciliation, OPEN).
REQUIRED_DIRECTIONS = {'issue_to_batch': 'out', 'return_from_batch': 'in'}


class PolicyBlocked(ValueError):
    """An action requires a policy/decision whose status is still OPEN."""


def validate_movement(movement_type, direction):
    if movement_type not in PROVISIONAL_MOVEMENT_TYPES:
        raise ValueError('unsupported provisional movement type')
    if direction not in PROVISIONAL_MOVEMENT_DIRECTIONS:
        raise ValueError('unsupported provisional movement direction')
    expected = REQUIRED_DIRECTIONS.get(movement_type)
    if expected is not None and direction != expected:
        raise ValueError(f'movement type {movement_type} requires direction {expected}')


def signed_stock(movements) -> Decimal:
    """Provisional observed stock as a signed sum of movement quantities.

    EXT-OD-05 is OPEN: this sum is descriptive input for validation, not an
    approved stock-keeping policy, and must never be reported as waste or loss.
    """
    total = Decimal('0')
    for movement in movements:
        if movement.direction == 'in':
            total += movement.quantity
        elif movement.direction == 'out':
            total -= movement.quantity
        else:
            raise ValueError('unsupported provisional movement direction')
    return total


def observed_stock(lot_quantity: Decimal, movements) -> Decimal:
    """Lot receipt quantity plus the signed sum of later movements."""
    return lot_quantity + signed_stock(movements)


def movement_allowed(stock: Decimal, direction: str, quantity: Decimal) -> bool:
    """Draft FR-101: negative stock is not valid without an approved exception policy."""
    if direction not in PROVISIONAL_MOVEMENT_DIRECTIONS:
        return False
    if direction == 'out':
        return stock - quantity >= 0
    return True
