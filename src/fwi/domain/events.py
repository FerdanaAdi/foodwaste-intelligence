from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class MaterialWasteEvent:
    waste_event_id: str
    organization_id: str
    site_id: str
    occurred_at: datetime
    recorded_at: datetime

    def __post_init__(self) -> None:
        if not self.waste_event_id:
            raise ValueError("waste_event_id is required")
        if not self.organization_id or not self.site_id:
            raise ValueError("organization_id and site_id are required")
