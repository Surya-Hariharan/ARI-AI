import os

class ConfigService:
    _instance = None
    
    def __init__(self):
        # In production, fetch from Redis/DB
        self.flags = {
            "KILL_SWITCH": os.getenv("KILL_SWITCH", "false").lower() == "true",
            "WAKE_WORD_ENABLED": True,
            "MIN_APP_VERSION": "1.0.0"
        }

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = ConfigService()
        return cls._instance

    def get_flag(self, key: str) -> bool:
        return self.flags.get(key, False)

    def set_flag(self, key: str, value: bool):
        self.flags[key] = value

config_service = ConfigService()
