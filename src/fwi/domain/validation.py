from decimal import Decimal, InvalidOperation
from typing import Optional


def _decimal(value: object, field: str) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        value_decimal = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field} must be a decimal") from exc
    if not value_decimal.is_finite():
        raise ValueError(f"{field} must be finite")
    return value_decimal
