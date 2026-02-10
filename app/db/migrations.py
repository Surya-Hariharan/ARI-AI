from typing import Any, Dict, Optional
import os
import logging
from app.db.supabase import get_supabase

# Configuration for migration phases
# Example: If migrating 'old_col' -> 'new_col'
# PHASE 1: Write both, Read old.
# PHASE 2: Write both, Read new (fallback old).
# PHASE 3: Write new, Read new.
# PHASE 4: Remove old.

logger = logging.getLogger("ari.db.migrations")

class SafeMigration:
    
    @staticmethod
    def read_field(record: Dict[str, Any], old_field: str, new_field: str, prefer_new: bool = True) -> Any:
        """
        Safely reads a field that is being migrated.
        """
        if prefer_new and new_field in record and record[new_field] is not None:
            return record[new_field]
            
        if old_field in record:
            if prefer_new:
                 logger.warning(f"Deprecated field usage: Using '{old_field}' instead of '{new_field}' for record {record.get('id', 'unknown')}")
            return record[old_field]
            
        return None

    @staticmethod
    def prepare_write(data: Dict[str, Any], old_field: str, new_field: str, value: Any, dual_write: bool = True) -> Dict[str, Any]:
        """
        Prepares data for writing during a migration phase.
        """
        data[new_field] = value
        if dual_write:
            data[old_field] = value
        return data

# Usage Example:
# val = SafeMigration.read_field(user_row, "fullname", "full_name")
