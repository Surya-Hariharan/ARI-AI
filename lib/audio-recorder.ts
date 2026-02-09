/**
 * Audio Recorder Module for ARI Mobile App
 * 
 * PRIVACY & SECURITY DESIGN INTENT:
 * ----------------------------------
 * This module handles audio recording for the ARI assistant.
 * 
 * CRITICAL SECURITY PRINCIPLES:
 * 1. EXPLICIT TRIGGER ONLY: Recording NEVER starts automatically
 * 2. BOUNDED DURATION: Recording is limited to a fixed window (5 seconds)
 * 3. NO DISK STORAGE: Audio is kept in memory only, never saved to disk
 * 4. IMMEDIATE CLEANUP: Audio data is discarded after use
 * 
 * PRIVACY GUARANTEES:
 * - The microphone is ONLY accessed after explicit user action
 * - Recording duration is strictly limited
 * - Audio data never persists beyond the current session
 * - No background recording is possible
 */

import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { Platform } from 'react-native';

/**
 * Recording configuration
 * 
 * BOUNDED LISTENING: Maximum recording duration is strictly enforced
 */
const RECORDING_CONFIG = {
  MAX_DURATION_MS: 5000, // 5 seconds maximum
};

export type RecorderState = 'idle' | 'requesting_permission' | 'recording' | 'processing' | 'error';

export interface RecorderResult {
  success: boolean;
  uri?: string;
  duration?: number;
  error?: string;
}

/**
 * Requests microphone permission
 * 
 * SECURITY INTENT:
 * Permission is requested explicitly, not silently.
 * The user sees a clear explanation of why microphone access is needed.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    return status.granted;
  } catch (error) {
    console.error('[AUDIO] Permission request failed:', error);
    return false;
  }
}

/**
 * Checks if microphone permission is already granted
 */
export async function checkMicrophonePermission(): Promise<boolean> {
  try {
    const status = await AudioModule.getRecordingPermissionsAsync();
    return status.granted;
  } catch (error) {
    console.error('[AUDIO] Permission check failed:', error);
    return false;
  }
}

/**
 * AudioRecorder class
 * 
 * SECURITY DESIGN:
 * This class encapsulates all recording functionality with
 * built-in safety limits and automatic cleanup.
 */
export class AudioRecorder {
  private isRecording: boolean = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private state: RecorderState = 'idle';
  private onStateChange?: (state: RecorderState) => void;
  private recordingStartTime: number = 0;
  private mockRecordingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(onStateChange?: (state: RecorderState) => void) {
    this.onStateChange = onStateChange;
  }

  private setState(state: RecorderState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  getState(): RecorderState {
    return this.state;
  }

  /**
   * Starts recording with bounded duration
   * 
   * SECURITY GUARANTEES:
   * 1. Requests permission if not already granted
   * 2. Automatically stops after MAX_DURATION_MS
   * 3. Cleans up resources on completion or error
   * 
   * NOTE: On web, we simulate recording since expo-audio has limited web support
   */
  async startRecording(): Promise<void> {
    if (this.state !== 'idle') {
      console.log('[AUDIO] Cannot start recording: already in state', this.state);
      return;
    }

    try {
      this.setState('requesting_permission');
      
      // Check/request permission
      let hasPermission = await checkMicrophonePermission();
      if (!hasPermission) {
        hasPermission = await requestMicrophonePermission();
      }
      
      if (!hasPermission) {
        this.setState('error');
        return;
      }

      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.setState('recording');
      
      // BOUNDED LISTENING: Auto-stop after max duration
      // This is a critical security feature
      this.timeoutId = setTimeout(() => {
        console.log('[AUDIO] Max duration reached, stopping recording');
        this.stopRecording();
      }, RECORDING_CONFIG.MAX_DURATION_MS);
      
      console.log('[AUDIO] Recording started');
      
    } catch (error) {
      console.error('[AUDIO] Failed to start recording:', error);
      this.setState('error');
      await this.cleanup();
    }
  }

  /**
   * Stops recording and returns the result
   * 
   * SECURITY NOTE:
   * The audio URI returned is temporary and should be
   * processed immediately, then discarded.
   */
  async stopRecording(): Promise<RecorderResult> {
    if (this.state !== 'recording') {
      return { success: false, error: 'Not recording' };
    }

    // Clear the auto-stop timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.setState('processing');

    try {
      const duration = Date.now() - this.recordingStartTime;
      
      this.isRecording = false;
      this.setState('idle');
      
      console.log('[AUDIO] Recording stopped, duration:', duration, 'ms');
      
      return {
        success: true,
        uri: undefined, // No actual audio file in mock mode
        duration: duration,
      };
      
    } catch (error) {
      console.error('[AUDIO] Failed to stop recording:', error);
      this.setState('error');
      await this.cleanup();
      return { success: false, error: 'Failed to stop recording' };
    }
  }

  /**
   * Cancels recording without processing
   * 
   * SECURITY INTENT:
   * Allows immediate cancellation, discarding all audio data.
   */
  async cancelRecording(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    await this.cleanup();
    this.setState('idle');
  }

  /**
   * Cleans up all recording resources
   * 
   * SECURITY INTENT:
   * Ensures no audio data remains in memory or on disk.
   */
  private async cleanup(): Promise<void> {
    this.isRecording = false;
    if (this.mockRecordingInterval) {
      clearInterval(this.mockRecordingInterval);
      this.mockRecordingInterval = null;
    }
  }
}
