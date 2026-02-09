/**
 * ARI State Management Context
 * 
 * ARCHITECTURAL DESIGN:
 * ---------------------
 * This context manages the state for the ARI Control App (Master Node).
 * 
 * TRUST BOUNDARIES:
 * - All capability decisions are stored and enforced here
 * - The Companion Core (activation screen) can only REQUEST actions
 * - The Control App (this context) DECIDES whether to allow them
 * 
 * ZERO-TRUST PRINCIPLE:
 * Intelligence (Companion) is untrusted
 * Authority (Control) is centralized
 * Capabilities are explicit
 * Misbehavior is structurally impossible
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Capability Definition
 * 
 * Each capability represents something ARI can REQUEST to do.
 * The Control App decides whether to ALLOW or DENY.
 */
export interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'apps' | 'system' | 'communication' | 'data';
  enabled: boolean;
  icon: string;
}

/**
 * Audit Log Entry
 * 
 * All ARI actions are logged for transparency and accountability.
 * This is a critical security feature.
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  capability: string;
  status: 'allowed' | 'denied' | 'error';
  details?: string;
}

/**
 * Voice Profile Status
 * 
 * Represents the state of voice enrollment and verification.
 * MOCKED for scaffold purposes.
 */
export interface VoiceProfile {
  enrolled: boolean;
  enrollmentDate?: number;
  verificationStrength: 'none' | 'low' | 'medium' | 'high';
  samplesCollected: number;
  requiredSamples: number;
}

/**
 * ARI System State
 */
export interface ARIState {
  killSwitchEnabled: boolean;
  capabilities: Capability[];
  auditLog: AuditLogEntry[];
  voiceProfile: VoiceProfile;
  isAuthenticated: boolean;
  deviceBound: boolean;
}

interface ARIContextValue extends ARIState {
  toggleKillSwitch: () => void;
  toggleCapability: (id: string) => void;
  setAllCapabilities: (enabled: boolean) => void;
  addAuditEntry: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  clearAuditLog: () => void;
  requestAction: (capabilityId: string, action: string) => Promise<{ allowed: boolean; reason: string }>;
  startVoiceEnrollment: () => void;
  addVoiceSample: () => void;
  resetVoiceProfile: () => void;
}

const DEFAULT_CAPABILITIES: Capability[] = [
  { id: 'maps', name: 'Maps', description: 'Open navigation apps', category: 'apps', enabled: true, icon: 'map' },
  { id: 'calendar', name: 'Calendar', description: 'Access calendar events', category: 'apps', enabled: true, icon: 'calendar' },
  { id: 'messages', name: 'Messages', description: 'Read and send messages', category: 'communication', enabled: false, icon: 'chatbubble' },
  { id: 'phone', name: 'Phone', description: 'Make phone calls', category: 'communication', enabled: false, icon: 'call' },
  { id: 'music', name: 'Music', description: 'Control music playback', category: 'apps', enabled: true, icon: 'musical-notes' },
  { id: 'settings', name: 'Settings', description: 'Modify system settings', category: 'system', enabled: false, icon: 'settings' },
  { id: 'camera', name: 'Camera', description: 'Take photos and videos', category: 'data', enabled: false, icon: 'camera' },
  { id: 'contacts', name: 'Contacts', description: 'Access contact list', category: 'data', enabled: false, icon: 'people' },
  { id: 'notes', name: 'Notes', description: 'Create and read notes', category: 'apps', enabled: true, icon: 'document-text' },
  { id: 'reminders', name: 'Reminders', description: 'Set reminders and alarms', category: 'apps', enabled: true, icon: 'alarm' },
];

const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  enrolled: false,
  verificationStrength: 'none',
  samplesCollected: 0,
  requiredSamples: 5,
};

const ARIContext = createContext<ARIContextValue | null>(null);

const STORAGE_KEY = 'ari_state';

export function ARIProvider({ children }: { children: ReactNode }) {
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[]>(DEFAULT_CAPABILITIES);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(DEFAULT_VOICE_PROFILE);
  const [isAuthenticated] = useState(true);
  const [deviceBound] = useState(true);

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    saveState();
  }, [killSwitchEnabled, capabilities, auditLog, voiceProfile]);

  const loadState = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.killSwitchEnabled !== undefined) setKillSwitchEnabled(parsed.killSwitchEnabled);
        if (parsed.capabilities) setCapabilities(parsed.capabilities);
        if (parsed.auditLog) setAuditLog(parsed.auditLog);
        if (parsed.voiceProfile) setVoiceProfile(parsed.voiceProfile);
      }
    } catch (error) {
      console.error('[ARI] Failed to load state:', error);
    }
  };

  const saveState = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        killSwitchEnabled,
        capabilities,
        auditLog,
        voiceProfile,
      }));
    } catch (error) {
      console.error('[ARI] Failed to save state:', error);
    }
  };

  const toggleKillSwitch = useCallback(() => {
    setKillSwitchEnabled(prev => !prev);
    addAuditEntry({
      action: killSwitchEnabled ? 'Kill Switch Disabled' : 'Kill Switch Enabled',
      capability: 'system',
      status: 'allowed',
    });
  }, [killSwitchEnabled]);

  const toggleCapability = useCallback((id: string) => {
    setCapabilities(prev => prev.map(cap => 
      cap.id === id ? { ...cap, enabled: !cap.enabled } : cap
    ));
  }, []);

  const setAllCapabilities = useCallback((enabled: boolean) => {
    setCapabilities(prev => prev.map(cap => ({ ...cap, enabled })));
    addAuditEntry({
      action: enabled ? 'All Capabilities Enabled' : 'All Capabilities Disabled',
      capability: 'system',
      status: 'allowed',
    });
  }, []);

  const addAuditEntry = useCallback((entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    setAuditLog(prev => [newEntry, ...prev].slice(0, 100));
  }, []);

  const clearAuditLog = useCallback(() => {
    setAuditLog([]);
  }, []);

  /**
   * Request Action - Core IPC-style interface
   * 
   * SECURITY DESIGN:
   * This is the ONLY way the Companion Core can request actions.
   * The Control App evaluates the request and returns ALLOW/DENY.
   * 
   * The Companion NEVER executes actions directly.
   */
  const requestAction = useCallback(async (
    capabilityId: string,
    action: string
  ): Promise<{ allowed: boolean; reason: string }> => {
    if (killSwitchEnabled) {
      addAuditEntry({
        action,
        capability: capabilityId,
        status: 'denied',
        details: 'Kill switch is enabled',
      });
      return { allowed: false, reason: 'kill_switch_enabled' };
    }

    const capability = capabilities.find(c => c.id === capabilityId);
    
    if (!capability) {
      addAuditEntry({
        action,
        capability: capabilityId,
        status: 'denied',
        details: 'Unknown capability',
      });
      return { allowed: false, reason: 'unknown_capability' };
    }

    if (!capability.enabled) {
      addAuditEntry({
        action,
        capability: capabilityId,
        status: 'denied',
        details: `Capability "${capability.name}" is disabled`,
      });
      return { allowed: false, reason: 'capability_disabled' };
    }

    addAuditEntry({
      action,
      capability: capabilityId,
      status: 'allowed',
    });
    
    return { allowed: true, reason: 'policy_passed' };
  }, [killSwitchEnabled, capabilities, addAuditEntry]);

  const startVoiceEnrollment = useCallback(() => {
    setVoiceProfile({
      enrolled: false,
      verificationStrength: 'none',
      samplesCollected: 0,
      requiredSamples: 5,
    });
  }, []);

  const addVoiceSample = useCallback(() => {
    setVoiceProfile(prev => {
      const newSamples = prev.samplesCollected + 1;
      const enrolled = newSamples >= prev.requiredSamples;
      let strength: VoiceProfile['verificationStrength'] = 'none';
      if (newSamples >= 5) strength = 'high';
      else if (newSamples >= 3) strength = 'medium';
      else if (newSamples >= 1) strength = 'low';
      
      return {
        ...prev,
        samplesCollected: newSamples,
        enrolled,
        enrollmentDate: enrolled ? Date.now() : prev.enrollmentDate,
        verificationStrength: strength,
      };
    });
  }, []);

  const resetVoiceProfile = useCallback(() => {
    setVoiceProfile(DEFAULT_VOICE_PROFILE);
  }, []);

  const value = useMemo<ARIContextValue>(() => ({
    killSwitchEnabled,
    capabilities,
    auditLog,
    voiceProfile,
    isAuthenticated,
    deviceBound,
    toggleKillSwitch,
    toggleCapability,
    setAllCapabilities,
    addAuditEntry,
    clearAuditLog,
    requestAction,
    startVoiceEnrollment,
    addVoiceSample,
    resetVoiceProfile,
  }), [
    killSwitchEnabled,
    capabilities,
    auditLog,
    voiceProfile,
    isAuthenticated,
    deviceBound,
    toggleKillSwitch,
    toggleCapability,
    setAllCapabilities,
    addAuditEntry,
    clearAuditLog,
    requestAction,
    startVoiceEnrollment,
    addVoiceSample,
    resetVoiceProfile,
  ]);

  return (
    <ARIContext.Provider value={value}>
      {children}
    </ARIContext.Provider>
  );
}

export function useARI() {
  const context = useContext(ARIContext);
  if (!context) {
    throw new Error('useARI must be used within an ARIProvider');
  }
  return context;
}
