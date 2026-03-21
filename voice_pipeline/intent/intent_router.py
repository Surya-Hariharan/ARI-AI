class IntentRouter:
    """Intent routing module interface"""
    
    def route_command(self, transcript: str) -> dict:
        # Placeholder for semantic routing (e.g. LLM or regex rule engine)
        if "weather" in transcript.lower():
            return {"domain": "weather", "action": "get_forecast"}
        return {"domain": "agent", "action": "plan_task"}
