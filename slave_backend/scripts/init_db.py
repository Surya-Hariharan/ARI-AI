#!/usr/bin/env python3
"""
Database initialization script
Creates all tables and runs initial setup
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import Base, engine
from app.models.node import Node, Command, Telemetry

def init_db():
    """Initialize database tables"""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Database initialized successfully")
    print(f"✓ Tables created: {', '.join(Base.metadata.tables.keys())}")

if __name__ == "__main__":
    init_db()
