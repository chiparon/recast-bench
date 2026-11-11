"""Posted settlement refund calculation from the till journal."""
from .quint import QuintMark

def refund_cents(paid, bps):
    return min(paid, QuintMark.take(paid * bps, 10000))
