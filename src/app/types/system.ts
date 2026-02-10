export type SystemState =
    | 'INITIALIZING'
    | 'IDLE'
    | 'LISTENING'
    | 'PROCESSING'
    | 'ACTION_EXECUTED'
    | 'DENIED'
    | 'ERROR'
    | 'OFFLINE';

export type BackgroundState =
    | 'IDLE'
    | 'ACTIVE'
    | 'SUSPENDED';

export interface VoiceEvent {
    id: string;
    timestamp: number;
    transcript: string;
    isFinal: boolean;
}

export interface IntentResult {
    id: string;
    originalTranscript: string;
    intent: string;
    confidence: number; // 0-1
    targetSubsystem: string;
    params?: Record<string, any>;
    status: 'RESOLVED' | 'Unresolved' | 'AMBIGUOUS';
    resolutionTimeMs: number;
}

export interface PermissionGrant {
    id: string;
    scope: string; // e.g., 'system.flashlight', 'data.read'
    granted: boolean;
    policy?: string; // 'USER_CONSENT', 'ALWAYS_ALLOW'
    timestamp: number;
}

export interface AuditEntry {
    id: string;
    timestamp: number;
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    category: 'VOICE' | 'SYSTEM' | 'NETWORK' | 'SECURITY' | 'MANUAL';
    action: string;
    details?: string;
    user?: string; // 'system' or 'user@role'
    stateSnapshot?: {
        systemState: SystemState;
        activePermissions: string[];
    };
}

export interface SystemContextType {
    state: SystemState;
    backgroundState: BackgroundState;
    lastVoiceEvent: VoiceEvent | null;
    lastIntent: IntentResult | null;
    auditLog: AuditEntry[];

    // Actions
    setSystemState: (state: SystemState) => void;
    addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void;
    simulateVoiceCommand: (transcript: string) => void; // For debug
}
