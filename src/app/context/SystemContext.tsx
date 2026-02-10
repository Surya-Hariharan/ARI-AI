import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SystemState, BackgroundState, VoiceEvent, IntentResult, AuditEntry, SystemContextType } from '../types/system';

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export function SystemProvider({ children }: { children: React.ReactNode }) {
    const [state, setSystemState] = useState<SystemState>('INITIALIZING');
    const [backgroundState, setBackgroundState] = useState<BackgroundState>('IDLE');
    const [lastVoiceEvent, setLastVoiceEvent] = useState<VoiceEvent | null>(null);
    const [lastIntent, setLastIntent] = useState<IntentResult | null>(null);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

    // Initialize System
    useEffect(() => {
        const timer = setTimeout(() => {
            setSystemState('IDLE');
            addAuditEntry({
                severity: 'INFO',
                category: 'SYSTEM',
                action: 'System Initialized',
                details: 'Core services started successfully',
                user: 'system'
            });
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    const addAuditEntry = useCallback((entry: Omit<AuditEntry, 'id' | 'timestamp'>) => {
        const newEntry: AuditEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...entry,
            stateSnapshot: {
                systemState: state,
                activePermissions: ['data.read', 'processing'] // Mock active permissions for now
            }
        };
        setAuditLog(prev => [newEntry, ...prev].slice(0, 50)); // Keep last 50
    }, [state]);

    const simulateVoiceCommand = useCallback((transcript: string) => {
        setSystemState('LISTENING');
        setBackgroundState('ACTIVE');

        const voiceEvent: VoiceEvent = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            transcript,
            isFinal: true
        };
        setLastVoiceEvent(voiceEvent);

        // Simulate Processing
        setTimeout(() => {
            setSystemState('PROCESSING');

            // Mock Intent Resolution
            const mockIntent: IntentResult = {
                id: crypto.randomUUID(),
                originalTranscript: transcript,
                intent: transcript.toUpperCase().includes('LIGHT') ? 'FLASHLIGHT_TOGGLE' : 'UNKNOWN_INTENT',
                confidence: 0.95,
                targetSubsystem: 'HARDWARE',
                status: 'RESOLVED',
                resolutionTimeMs: 120
            };
            setLastIntent(mockIntent);

            // Simulate Execution or Denial
            setTimeout(() => {
                if (mockIntent.intent === 'UNKNOWN_INTENT') {
                    setSystemState('ERROR');
                    addAuditEntry({
                        severity: 'WARNING',
                        category: 'VOICE',
                        action: 'Intent Unresolved',
                        details: `Could not map "${transcript}" to action`,
                        user: 'user'
                    });
                } else {
                    setSystemState('ACTION_EXECUTED');
                    addAuditEntry({
                        severity: 'INFO',
                        category: 'VOICE',
                        action: 'Command Executed',
                        details: `Executed ${mockIntent.intent}`,
                        user: 'user'
                    });
                }

                // Reset to Idle
                setTimeout(() => {
                    setSystemState('IDLE');
                    setBackgroundState('IDLE');
                }, 2000);
            }, 800);
        }, 600);
    }, [addAuditEntry]);

    const value: SystemContextType = {
        state,
        backgroundState,
        lastVoiceEvent,
        lastIntent,
        auditLog,
        setSystemState,
        addAuditEntry,
        simulateVoiceCommand
    };

    return (
        <SystemContext.Provider value={value}>
            {children}
        </SystemContext.Provider>
    );
}

export function useSystem() {
    const context = useContext(SystemContext);
    if (context === undefined) {
        throw new Error('useSystem must be used within a SystemProvider');
    }
    return context;
}
