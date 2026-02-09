/**
 * Dashboard Screen - ARI Control App
 * 
 * Aurora-themed dashboard with deep dark backgrounds and pink/purple accents
 */

import React, { useState, useEffect } from 'react';
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
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import Colors from '@/constants/colors';
import { useARI } from '@/lib/ari-context';
import { checkHealth } from '@/lib/api-client';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const {
    killSwitchEnabled,
    capabilities,
    auditLog,
    voiceProfile,
    isAuthenticated,
    deviceBound,
  } = useARI();
  
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  
  useEffect(() => {
    checkHealth()
      .then(() => setBackendStatus('online'))
      .catch(() => setBackendStatus('offline'));
  }, []);

  const enabledCapabilities = capabilities.filter(c => c.enabled).length;
  const recentActivity = auditLog.slice(0, 3);

  const handleActivatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/activate');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Aurora background */}
      <LinearGradient
        colors={[Colors.background, Colors.backgroundSecondary, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Subtle aurora glow at top */}
      <LinearGradient
        colors={['rgba(224, 64, 251, 0.08)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: 300 }]}
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
          <Text style={styles.title}>ARI Control</Text>
          <Text style={styles.subtitle}>Master Node Dashboard</Text>
        </View>
        
        {/* System status card */}
        <View style={[
          styles.statusCard,
          { borderColor: killSwitchEnabled ? Colors.error : Colors.success }
        ]}>
          <LinearGradient
            colors={[Colors.backgroundCard, Colors.backgroundDark]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.statusHeader}>
            <View style={[
              styles.statusDot,
              { backgroundColor: killSwitchEnabled ? Colors.error : Colors.success }
            ]} />
            <Text style={styles.statusTitle}>
              {killSwitchEnabled ? 'ARI Disabled' : 'ARI Active'}
            </Text>
          </View>
          <Text style={styles.statusText}>
            {killSwitchEnabled 
              ? 'Kill switch is enabled. ARI cannot process any requests.'
              : 'System is operational. ARI can process approved requests.'}
          </Text>
        </View>
        
        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <LinearGradient
              colors={[Colors.backgroundCard, Colors.backgroundDark]}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="shield-checkmark" size={24} color={Colors.success} />
            <Text style={styles.statValue}>{enabledCapabilities}</Text>
            <Text style={styles.statLabel}>Enabled</Text>
          </View>
          
          <View style={styles.statCard}>
            <LinearGradient
              colors={[Colors.backgroundCard, Colors.backgroundDark]}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="shield-outline" size={24} color={Colors.textMuted} />
            <Text style={styles.statValue}>{capabilities.length - enabledCapabilities}</Text>
            <Text style={styles.statLabel}>Disabled</Text>
          </View>
          
          <View style={styles.statCard}>
            <LinearGradient
              colors={[Colors.backgroundCard, Colors.backgroundDark]}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="time-outline" size={24} color={Colors.auroraPink} />
            <Text style={styles.statValue}>{auditLog.length}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
        </View>
        
        {/* System Status section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Status</Text>
          
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Ionicons
                name={isAuthenticated ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={isAuthenticated ? Colors.success : Colors.error}
              />
              <Text style={styles.statusItemText}>Authentication</Text>
            </View>
            <Text style={styles.statusValue}>
              {isAuthenticated ? 'Verified' : 'Not Verified'}
            </Text>
          </View>
          
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Ionicons
                name={deviceBound ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={deviceBound ? Colors.success : Colors.error}
              />
              <Text style={styles.statusItemText}>Device Binding</Text>
            </View>
            <Text style={styles.statusValue}>
              {deviceBound ? 'Bound' : 'Unbound'}
            </Text>
          </View>
          
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Ionicons
                name={voiceProfile.enrolled ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={voiceProfile.enrolled ? Colors.success : Colors.warning}
              />
              <Text style={styles.statusItemText}>Voice Profile</Text>
            </View>
            <Text style={styles.statusValue}>
              {voiceProfile.enrolled ? `Enrolled (${voiceProfile.verificationStrength})` : 'Not Enrolled'}
            </Text>
          </View>
          
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Ionicons
                name={backendStatus === 'online' ? 'checkmark-circle' : backendStatus === 'offline' ? 'close-circle' : 'time-outline'}
                size={20}
                color={backendStatus === 'online' ? Colors.success : backendStatus === 'offline' ? Colors.error : Colors.textMuted}
              />
              <Text style={styles.statusItemText}>Backend</Text>
            </View>
            <Text style={styles.statusValue}>
              {backendStatus === 'online' ? 'Online' : backendStatus === 'offline' ? 'Offline' : 'Checking...'}
            </Text>
          </View>
        </View>
        
        {/* Activate button */}
        <Pressable
          onPress={handleActivatePress}
          style={({ pressed }) => [
            styles.activateButton,
            pressed && styles.buttonPressed,
            killSwitchEnabled && styles.buttonDisabled,
          ]}
          disabled={killSwitchEnabled}
        >
          <LinearGradient
            colors={killSwitchEnabled 
              ? [Colors.surface, Colors.backgroundDark] 
              : [Colors.auroraPink, Colors.auroraMagenta, Colors.auroraPurple]}
            style={styles.activateGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons
              name="microphone"
              size={28}
              color={killSwitchEnabled ? Colors.textMuted : Colors.text}
            />
            <Text style={[
              styles.activateText,
              killSwitchEnabled && styles.activateTextDisabled
            ]}>
              Activate ARI
            </Text>
          </LinearGradient>
        </Pressable>
        
        {/* Recent activity section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Pressable onPress={() => router.push('/(control)/audit')}>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>
          
          {recentActivity.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No recent activity</Text>
            </View>
          ) : (
            recentActivity.map((entry) => (
              <View key={entry.id} style={styles.activityItem}>
                <View style={[
                  styles.activityDot,
                  { backgroundColor: entry.status === 'allowed' ? Colors.success : Colors.error }
                ]} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityAction}>{entry.action}</Text>
                  <Text style={styles.activityTime}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <Text style={[
                  styles.activityStatus,
                  { color: entry.status === 'allowed' ? Colors.success : Colors.error }
                ]}>
                  {entry.status.toUpperCase()}
                </Text>
              </View>
            ))
          )}
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
    gap: 24,
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
    padding: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
  },
  statusText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
  },
  seeAllText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.auroraPink,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  statusValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  activateButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  activateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  activateText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
  },
  activateTextDisabled: {
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityContent: {
    flex: 1,
  },
  activityAction: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  activityTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  activityStatus: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
