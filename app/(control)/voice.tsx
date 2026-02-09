/**
 * Voice Profile Screen - ARI Control App (Aurora Themed)
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import Colors from '@/constants/colors';
import { useARI } from '@/lib/ari-context';

const PHRASES = [
  "Hey ARI, what's the weather today?",
  "ARI, set a reminder for tomorrow",
  "Open my calendar, ARI",
  "ARI, play some music",
  "What time is it, ARI?",
];

export default function VoiceProfileScreen() {
  const insets = useSafeAreaInsets();
  const { voiceProfile, addVoiceSample, resetVoiceProfile, startVoiceEnrollment } = useARI();
  const [isRecording, setIsRecording] = useState(false);
  const [currentPhrase, setCurrentPhrase] = useState(0);
  
  const pulseAnim = useSharedValue(1);

  const handleStartEnrollment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startVoiceEnrollment();
    setCurrentPhrase(0);
  };

  const handleRecordSample = () => {
    if (isRecording) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(true);
    
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      3,
      false
    );
    
    setTimeout(() => {
      setIsRecording(false);
      addVoiceSample();
      setCurrentPhrase(prev => Math.min(prev + 1, PHRASES.length - 1));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 3000);
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetVoiceProfile();
    setCurrentPhrase(0);
  };

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const strengthColors: Record<string, string> = {
    none: Colors.textMuted,
    low: Colors.warning,
    medium: Colors.auroraPink,
    high: Colors.success,
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <LinearGradient
        colors={[Colors.background, Colors.backgroundSecondary, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      <LinearGradient
        colors={['rgba(213, 0, 249, 0.06)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: 250 }]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20), paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Voice Profile</Text>
          <Text style={styles.subtitle}>Speaker Verification</Text>
        </View>
        
        <View style={styles.statusCard}>
          <LinearGradient
            colors={[Colors.backgroundCard, Colors.backgroundDark]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.statusIconContainer, voiceProfile.enrolled && styles.statusIconEnrolled]}>
            <MaterialCommunityIcons
              name={voiceProfile.enrolled ? "account-voice" : "account-voice-off"}
              size={48}
              color={voiceProfile.enrolled ? Colors.success : Colors.textMuted}
            />
          </View>
          
          <Text style={styles.statusTitle}>
            {voiceProfile.enrolled ? 'Voice Enrolled' : 'Not Enrolled'}
          </Text>
          
          <View style={styles.strengthIndicator}>
            <Text style={styles.strengthLabel}>Verification Strength:</Text>
            <View style={styles.strengthBadge}>
              <View style={[styles.strengthDot, { backgroundColor: strengthColors[voiceProfile.verificationStrength] }]} />
              <Text style={[styles.strengthValue, { color: strengthColors[voiceProfile.verificationStrength] }]}>
                {voiceProfile.verificationStrength.toUpperCase()}
              </Text>
            </View>
          </View>
          
          {voiceProfile.enrollmentDate && (
            <Text style={styles.enrollmentDate}>
              Enrolled: {new Date(voiceProfile.enrollmentDate).toLocaleDateString()}
            </Text>
          )}
        </View>
        
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Enrollment Progress</Text>
          
          <View style={styles.progressBar}>
            <LinearGradient
              colors={[Colors.auroraPink, Colors.auroraMagenta, Colors.auroraPurple]}
              style={[
                styles.progressFill,
                { width: `${(voiceProfile.samplesCollected / voiceProfile.requiredSamples) * 100}%` }
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </View>
          
          <Text style={styles.progressText}>
            {voiceProfile.samplesCollected} / {voiceProfile.requiredSamples} samples collected
          </Text>
        </View>
        
        {!voiceProfile.enrolled && (
          <>
            <View style={styles.phraseCard}>
              <Text style={styles.phraseLabel}>
                {voiceProfile.samplesCollected === 0 
                  ? 'Press the button and say the phrase below:'
                  : 'Say the next phrase:'}
              </Text>
              <Text style={styles.phraseText}>"{PHRASES[currentPhrase]}"</Text>
            </View>
            
            <View style={styles.recordContainer}>
              <Pressable
                onPress={handleRecordSample}
                disabled={isRecording || voiceProfile.enrolled}
                style={({ pressed }) => [
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                  pressed && !isRecording && styles.recordButtonPressed,
                ]}
              >
                <Animated.View style={animatedButtonStyle}>
                  <LinearGradient
                    colors={isRecording 
                      ? [Colors.error, '#CC0000'] 
                      : [Colors.auroraPink, Colors.auroraMagenta, Colors.auroraPurple]}
                    style={styles.recordButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons
                      name={isRecording ? 'mic' : 'mic-outline'}
                      size={40}
                      color={Colors.text}
                    />
                  </LinearGradient>
                </Animated.View>
              </Pressable>
              
              <Text style={styles.recordHint}>
                {isRecording ? 'Recording...' : 'Tap to record'}
              </Text>
            </View>
          </>
        )}
        
        <View style={styles.actionsCard}>
          {!voiceProfile.enrolled && voiceProfile.samplesCollected === 0 ? (
            <Pressable
              onPress={handleStartEnrollment}
              style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.auroraPink} />
              <Text style={styles.actionButtonText}>Start Enrollment</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.actionButton, styles.actionButtonDanger, pressed && styles.buttonPressed]}
            >
              <Ionicons name="refresh-outline" size={20} color={Colors.error} />
              <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>Reset Voice Profile</Text>
            </Pressable>
          )}
        </View>
        
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.infoText}>
            Voice verification ensures that only your voice can activate ARI. This is a security feature that prevents unauthorized access.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 16,
    overflow: 'hidden',
  },
  statusIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.backgroundCardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconEnrolled: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
  },
  statusTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: Colors.text,
  },
  strengthIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  strengthLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  strengthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundCardElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  strengthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  strengthValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  enrollmentDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  progressCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  progressTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.backgroundCardElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  phraseCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  phraseLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  phraseText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.auroraPink,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  recordContainer: {
    alignItems: 'center',
    gap: 16,
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
  },
  recordButtonActive: {
    opacity: 1,
  },
  recordButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  recordButtonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
  },
  recordHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textMuted,
  },
  actionsCard: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  actionButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.auroraPink,
  },
  actionButtonTextDanger: {
    color: Colors.error,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
