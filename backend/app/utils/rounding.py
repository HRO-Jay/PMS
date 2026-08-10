"""
Rounding helpers — different companies use different rounding methods.

Rules from CLAUDE.md §6:
  - 上海 standard: ROUND (round half up, 2 decimal places)
  - 北京 点才:     ROUNDUP (always round up, 2 decimal places)
  - 深圳 公积金:    ROUND_1DEC (round to 1 decimal for housing fund only)
  - 南京:          ROUND
  - 天津:          ROUND
"""
from decimal import Decimal, ROUND_HALF_UP, ROUND_UP


def round_half_up(value: Decimal, places: int = 2) -> Decimal:
    """Standard rounding — round half up to `places` decimal places."""
    return value.quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)


def round_always_up(value: Decimal, places: int = 2) -> Decimal:
    """Always round up to `places` decimal places."""
    return value.quantize(Decimal(10) ** -places, rounding=ROUND_UP)


def get_rounding_fn(method: str):
    """
    Return the appropriate rounding function for a given method string.

    Accepted values:
        - "ROUND"      → round_half_up(2)
        - "ROUNDUP"    → round_always_up(2)
        - "ROUND_1DEC" → round_half_up(1)  (Shenzhen housing fund)
    """
    if method == "ROUNDUP":
        return lambda v, p=2: round_always_up(v, p)
    elif method == "ROUND_1DEC":
        return lambda v, p=1: round_half_up(v, p)
    else:  # default to ROUND
        return lambda v, p=2: round_half_up(v, p)
