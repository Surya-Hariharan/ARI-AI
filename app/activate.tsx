/**
 * ARI Activation Screen - Companion Core
 * 
 * Aurora-themed voice activation with concentric rings design
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';

import Colors from '@/constants/colors';
import { GlowOverlay } from '@/components/GlowOverlay';
import { useARI } from '@/lib/ari-context';
import { AudioRecorder, type RecorderState, checkMicrophonePermission, requestMicrophonePermission } from '@/lib/audio-recorder';
import { sendTrigger, checkHealth } from '@/lib/api-client';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = 140;

type AppState = 'idle' | 'connecting' | 'listening' | 'processing' | 'denied' | 'success';

const STATE_CONFIG: Record<AppState, { label: string; color: string; icon: string }> = {
  idle: { label: 'Ready', color: Colors.idle, icon: 'mic-outline' },
  connecting: { label: 'Connecting...', color: Colors.auroraPurple, icon: 'cloud-outline' },
  listening: { label: 'Listening...', color: Colors.auroraPink, icon: 'mic' },
  processing: { label: 'Processing...', color: Colors.auroraPurple, icon: 'pulse' },
  denied: { label: 'Denied', color: Colors.error, icon: 'close-circle-outline' },
  success: { label: 'Complete', color: Colors.success, icon: 'checkmark-circle-outline' },
};

function ConcentricRing({ size, delay, isActive, color }: { size: number; delay: number; isActive: boolean; color: string }) {
  const animation = useSharedValue(0);
  
  useEffect(() => {
    if (isActive) {
      animation.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(animation);
      animation.value = withTiming(0, { duration: 300 });
    }
  }, [isActive]);
  
  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(animation.value, [0, 1], [1, 1.5]);
    const opacity = interpolate(animation.value, [0, 0.3, 1], [0.4, 0.2, 0]);
    return {
      transform: [{ scale }],
      opacity: isActive ? opacity : 0.1,
    };
  });
  
  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function ActivateScreen() {
  const insets = useSafeAreaInsets();
  const { killSwitchEnabled, requestAction, addAuditEntry } = useARI();
  
  const [appState, setAppState] = useState<AppState>('idle');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const recorderRef = useRef<AudioRecorder | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const pulseAnim = useSharedValue(1);
  const glowAnim = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    checkMicrophonePermission().then(setHasPermission);
    checkHealth()
      .then(() => setBackendStatus('online'))
      .catch(() => setBackendStatus('offline'));
  }, []);

  useEffect(() => {
    if (appState === 'listening') {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      glowAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0.5, { duration: 1000 })
        ),
        -1,
        false
      );
    } else if (appState === 'processing' || appState === 'connecting') {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
      glowAnim.value = withTiming(0.6, { duration: 300 });
    } else {
      cancelAnimation(pulseAnim);
      cancelAnimation(glowAnim);
      pulseAnim.value = withSpring(1);
      glowAnim.value = withTiming(0, { duration: 300 });
    }
  }, [appState]);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value * buttonScale.value }],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowAnim.value,
  }));

  const handleRecorderStateChange = useCallback((state: RecorderState) => {
    console.log('[COMPANION] Recorder state changed:', state);
  }, []);

  const startListening = useCallback(async () => {
    if (appState !== 'idle') return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    if (killSwitchEnabled) {
      setAppState('denied');
      addAuditEntry({
        action: 'Voice Trigger Attempt',
        capability: 'system',
        status: 'denied',
        details: 'Kill switch is enabled',
      });
      setTimeout(() => setAppState('idle'), 2000);
      return;
    }
    
    if (!hasPermission) {
      const granted = await requestMicrophonePermission();
      setHasPermission(granted);
      if (!granted) {
        Alert.alert(
          'Microphone Access Required',
          'ARI needs microphone access to listen to your voice commands.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    setAppState('connecting');
    
    try {
      const triggerResult = await sendTrigger();
      
      if (!triggerResult.success || !triggerResult.data?.allowed) {
        const errorMsg = !triggerResult.success 
          ? (triggerResult as any).error?.message 
          : triggerResult.data?.reason;
        setAppState('denied');
        addAuditEntry({
          action: 'Voice Trigger',
          capability: 'system',
          status: 'denied',
          details: `Backend policy: ${errorMsg}`,
        });
        setTimeout(() => setAppState('idle'), 2000);
        return;
      }

      addAuditEntry({
        action: 'Voice Trigger',
        capability: 'system',
        status: 'allowed',
        details: 'Recording started (5s window)',
      });
      
      const recorder = new AudioRecorder(handleRecorderStateChange);
      recorderRef.current = recorder;
      
      setAppState('listening');
      setRecordingDuration(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 100);
      }, 100);
      
      await recorder.startRecording();
      
      setTimeout(async () => {
        if (recorderRef.current) {
          await stopListening();
        }
      }, 5000);
      
    } catch (error) {
      setAppState('denied');
      setTimeout(() => setAppState('idle'), 2000);
    }
  }, [appState, hasPermission, killSwitchEnabled, handleRecorderStateChange, addAuditEntry]);

  const stopListening = useCallback(async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    if (!recorderRef.current) {
      setAppState('idle');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAppState('processing');

    try {
      const result = await recorderRef.current.stopRecording();
      
      if (result.success) {
        addAuditEntry({
          action: 'Voice Command Processed',
          capability: 'system',
          status: 'allowed',
          details: `Duration: ${(result.duration || 0) / 1000}s`,
        });
        setAppState('success');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setAppState('denied');
      }
      
      recorderRef.current = null;
      setTimeout(() => setAppState('idle'), 2000);
      
    } catch (error) {
      setAppState('denied');
      setTimeout(() => setAppState('idle'), 2000);
    }
  }, [addAuditEntry]);

  const handleButtonPress = useCallback(() => {
    if (appState === 'idle') {
      startListening();
    } else if (appState === 'listening') {
      stopListening();
    }
  }, [appState, startListening, stopListening]);

  const handlePressIn = useCallback(() => {
    buttonScale.value = withSpring(0.95);
  }, []);

  const handlePressOut = useCallback(() => {
    buttonScale.value = withSpring(1);
  }, []);

  const stateConfig = STATE_CONFIG[appState];
  const isActive = appState === 'listening' || appState === 'processing' || appState === 'connecting';
  const canInteract = appState === 'idle' || appState === 'listening';
  
  const overlayState = appState === 'idle' ? 'idle' :
    appState === 'listening' ? 'listening' :
    appState === 'processing' || appState === 'connecting' ? 'processing' :
    appState === 'denied' ? 'denied' : 'success';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <GlowOverlay state={overlayState} visible={appState !== 'idle'} />
      
      {/* Aurora background gradient */}
      <LinearGradient
        colors={[Colors.background, Colors.backgroundSecondary, Colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Warm bottom aurora glow */}
      <LinearGradient
        colors={['transparent', 'rgba(255, 109, 0, 0.08)', 'rgba(233, 30, 99, 0.12)']}
        style={[StyleSheet.absoluteFill, { top: '60%' }]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        
        {/* Header badge */}
        <View style={styles.header}>
          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <View style={styles.badgeIcon}>
                <MaterialCommunityIcons name="microphone-outline" size={16} color={Colors.auroraPink} />
              </View>
              <Text style={styles.badgeText}>AI Voice Command</Text>
            </View>
          </View>
          
          <Text style={styles.title}>ARI</Text>
          <Text style={styles.subtitle}>Companion Core</Text>
          
          {killSwitchEnabled && (
            <View style={styles.killSwitchBadge}>
              <Ionicons name="warning" size={14} color={Colors.error} />
              <Text style={styles.killSwitchText}>Kill Switch Active</Text>
            </View>
          )}
        </View>
        
        {/* Main activation area */}
        <View style={styles.mainContent}>
          {/* Concentric rings */}
          <View style={styles.ringsContainer}>
            <ConcentricRing size={BUTTON_SIZE + 180} delay={400} isActive={isActive} color={Colors.auroraPurple} />
            <ConcentricRing size={BUTTON_SIZE + 120} delay={200} isActive={isActive} color={Colors.auroraMagenta} />
            <ConcentricRing size={BUTTON_SIZE + 60} delay={0} isActive={isActive} color={Colors.auroraPink} />
            
            {/* Static rings */}
            <View style={[styles.staticRing, { width: BUTTON_SIZE + 40, height: BUTTON_SIZE + 40, borderRadius: (BUTTON_SIZE + 40) / 2 }]} />
            
            {/* Center glow behind button */}
            <Animated.View style={[styles.centerGlow, animatedGlowStyle]} />
            
            {/* Main button */}
            <Pressable
              onPress={handleButtonPress}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={!canInteract || killSwitchEnabled}
              style={[
                styles.activateButton,
                (!canInteract || killSwitchEnabled) && styles.buttonDisabled,
              ]}
            >
              <Animated.View style={[styles.buttonInner, animatedButtonStyle]}>
                <LinearGradient
                  colors={isActive 
                    ? [Colors.auroraPink, Colors.auroraMagenta, Colors.auroraPurple]
                    : [Colors.surfaceLight, Colors.surface, Colors.backgroundDark]
                  }
                  style={styles.buttonGradient}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                >
                  <MaterialCommunityIcons
                    name={appState === 'listening' ? 'microphone' : 'microphone-outline'}
                    size={48}
                    color={Colors.text}
                  />
                </LinearGradient>
              </Animated.View>
            </Pressable>
          </View>
          
          {/* State label */}
          <View style={styles.stateContainer}>
            <Text style={[styles.stateLabel, { color: stateConfig.color }]}>
              {stateConfig.label}
            </Text>
            {appState === 'listening' && (
              <Text style={styles.durationText}>
                {(recordingDuration / 1000).toFixed(1)}s / 5.0s
              </Text>
            )}
          </View>
        </View>
        
        {/* Footer info */}
        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: backendStatus === 'online' ? Colors.success : backendStatus === 'offline' ? Colors.error : Colors.textMuted }]} />
            <Text style={styles.statusText}>
              {backendStatus === 'online' ? 'Backend Online' : backendStatus === 'offline' ? 'Backend Offline' : 'Checking...'}
            </Text>
          </View>
          
          <View style={styles.securityRow}>
            <Ionicons name="shield-checkmark" size={16} color={Colors.success} />
            <Text style={styles.securityText}>Privacy First - 5s bounded listening</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 20,
  },
  badgeContainer: {
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
  },
  badgeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(224, 64, 251, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 56,
    color: Colors.text,
    letterSpacing: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  killSwitchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 16,
  },
  killSwitchText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.error,
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringsContainer: {
    width: BUTTON_SIZE + 200,
    height: BUTTON_SIZE + 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
  staticRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  centerGlow: {
    position: 'absolute',
    width: BUTTON_SIZE + 60,
    height: BUTTON_SIZE + 60,
    borderRadius: (BUTTON_SIZE + 60) / 2,
    backgroundColor: Colors.auroraPink,
    shadowColor: Colors.auroraPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
  },
  activateButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonInner: {
    width: '100%',
    height: '100%',
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BUTTON_SIZE / 2,
  },
  stateContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  stateLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    letterSpacing: 1,
  },
  durationText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  footer: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  securityText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
});
