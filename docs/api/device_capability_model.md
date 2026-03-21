# Device Capability Abstraction Model

Every connected device must report its capabilities to the Gateway upon initialization. 

## Capability Schema
```json
{
  "device_id": "string",
  "supports_screen": "boolean",
  "supports_voice": "boolean",
  "os_version": "string"
}
```

This model is utilized by the Agent Planner to decide output modes (e.g. text vs voice vs rich UI card).
