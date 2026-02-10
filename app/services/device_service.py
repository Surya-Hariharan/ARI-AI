from typing import Dict, Optional
import json
import os
import logging
from ..models import DeviceRegistration
from app.db.supabase import get_supabase

logger = logging.getLogger("ari.device_service")

class DeviceService:
    def __init__(self, persistence_file="devices.json"):
        self.persistence_file = persistence_file
        self.devices: Dict[str, DeviceRegistration] = {}
        self._load_local_devices()

    def _load_local_devices(self):
        """Loads devices fro local JSON cache/backup"""
        if os.path.exists(self.persistence_file):
            try:
                with open(self.persistence_file, 'r') as f:
                    data = json.load(f)
                    for device_id, device_data in data.items():
                        self.devices[device_id] = DeviceRegistration(**device_data)
            except Exception as e:
                logger.error(f"Failed to load local devices: {e}")

    def _save_local_devices(self):
        """Saves devices to local JSON cache/backup"""
        try:
            with open(self.persistence_file, 'w') as f:
                json.dump({k: v.dict() for k, v in self.devices.items()}, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save local devices: {e}")

    def register_device(self, device: DeviceRegistration) -> DeviceRegistration:
        """
        Registers a new device. Tries Supabase first, falls back to local.
        """
        # Always update in-memory and local cache
        self.devices[device.device_id] = device
        self._save_local_devices()

        # Try Supabase insert/upsert
        supabase = get_supabase()
        if supabase:
            try:
                data = device.dict()
                # Supabase upsert: if device_id exists, update it
                supabase.table("devices").upsert(data).execute()
                logger.info(f"Device {device.device_id} registered in Supabase.")
            except Exception as e:
                logger.error(f"Supabase registration failed for {device.device_id}: {e}")
                # Continue without failing request, rely on consistency later or local cache

        return device

    def get_device(self, device_id: str) -> Optional[DeviceRegistration]:
        # check memory first (fastest)
        if device_id in self.devices:
            return self.devices[device_id]
        
        # Try fetch from Supabase if not in memory (e.g. cold start)
        supabase = get_supabase()
        if supabase:
            try:
                 response = supabase.table("devices").select("*").eq("device_id", device_id).execute()
                 if response.data:
                     device_data = response.data[0]
                     device = DeviceRegistration(**device_data)
                     # cache it
                     self.devices[device_id] = device
                     self._save_local_devices()
                     return device
            except Exception as e:
                logger.error(f"Supabase fetch failed for {device_id}: {e}")
        
        return None

    def get_public_key(self, device_id: str) -> Optional[str]:
        device = self.get_device(device_id)
        return device.public_key if device else None

# Singleton instance
device_service = DeviceService()
