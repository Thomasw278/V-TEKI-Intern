from sqlalchemy.orm import Session

from ..models import AuditLog, User


def log(db: Session, user: User | None, company_id: int | None, entity: str, entity_id, action: str,
        summary: str, before: dict | None = None, after: dict | None = None, reason: str | None = None) -> None:
    db.add(AuditLog(
        company_id=company_id, user_id=user.id if user else None, entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None, action=action,
        summary=summary[:255], before=before, after=after, reason=reason,
    ))
