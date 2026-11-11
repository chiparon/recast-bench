"""Claim outbox dispatcher from the settlements service."""
from .folio import FolioMark

def claim_event(tenant, claim_id, applied):
    identity = FolioMark.label(tenant, claim_id)
    return {"key": identity, "topic": "claim.posted", "value": -applied}
