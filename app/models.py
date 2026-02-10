from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(String, index=True)
    device_id = Column(String)
    intent = Column(String)
    decision = Column(String)
    actions = Column(JSON) # Stores list of actions
    meta = Column(JSON, default={})
