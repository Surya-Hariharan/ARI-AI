/**
 * Settings Screen - ARI Control App (Aurora Themed)
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import Colors from '@/constants/colors';
import { useARI } from '@/lib/ari-context';

interface SettingRowProps {
  icon: string;
  iconFamily?: 'ionicons' | 'material';
  title: string;
  subtitle?: string;
  value?: string | React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}

function SettingRow({ icon, iconFamily = 'ionicons', title, subtitle, value, onPress, danger }: SettingRowProps) {
  const IconComponent = iconFamily === 'material' ? MaterialCommunityIcons : Ionicons;
  
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.settingRow,
        pressed && onPress && styles.settingRowPressed,
      ]}
    >
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <IconComponent name={icon as any} size={20} color={danger ? Colors.error : Colors.auroraPink} />
      </View>
      
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && styles.settingTitleDanger]}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      
      {typeof value === 'string' ? (
        <Text style={styles.settingValue}>{value}</Text>
      ) : value ? (
        value
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { killSwitchEnabled, toggleKillSwitch, isAuthenticated, deviceBound } = useARI();

  const handleKillSwitchToggle = () => {
    if (!killSwitchEnabled) {
      Alert.alert(
        'Enable Kill Switch',
        'This will completely disable ARI. No requests will be processed until you disable the kill switch.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              toggleKillSwitch();
            },
          },
        ]
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleKillSwitch();
    }
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Logout', 'This is a mocked feature in the scaffold.');
  };

  const handleUnbind = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Unbind Device', 'This is a mocked feature in the scaffold.');
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
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20), paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Account & Security</Text>
        </View>
        
        <View style={[
          styles.killSwitchCard,
          killSwitchEnabled && styles.killSwitchCardActive,
        ]}>
          <LinearGradient
            colors={killSwitchEnabled 
              ? ['rgba(255, 82, 82, 0.15)', 'rgba(255, 82, 82, 0.05)']
              : [Colors.backgroundCard, Colors.backgroundDark]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.killSwitchHeader}>
            <View style={[styles.killSwitchIcon, killSwitchEnabled && styles.killSwitchIconActive]}>
              <MaterialCommunityIcons
                name="power"
                size={32}
                color={killSwitchEnabled ? Colors.error : Colors.textMuted}
              />
            </View>
            <View style={styles.killSwitchContent}>
              <Text style={styles.killSwitchTitle}>Kill Switch</Text>
              <Text style={styles.killSwitchDesc}>
                {killSwitchEnabled
                  ? 'ARI is completely disabled'
                  : 'Emergency shutdown for ARI'}
              </Text>
            </View>
            <Switch
              value={killSwitchEnabled}
              onValueChange={handleKillSwitchToggle}
              trackColor={{ false: Colors.backgroundCardElevated, true: Colors.error }}
              thumbColor={Colors.text}
              ios_backgroundColor={Colors.backgroundCardElevated}
            />
          </View>
          
          {killSwitchEnabled && (
            <View style={styles.killSwitchWarning}>
              <Ionicons name="warning" size={16} color={Colors.error} />
              <Text style={styles.killSwitchWarningText}>
                All ARI functionality is blocked. No requests will be processed.
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <View style={styles.settingsGroup}>
            <SettingRow
              icon="person-outline"
              title="Profile"
              subtitle={isAuthenticated ? 'Authenticated' : 'Not authenticated'}
              onPress={() => Alert.alert('Profile', 'Mocked feature')}
            />
            
            <SettingRow
              icon="mail-outline"
              title="Email"
              value="user@example.com"
            />
            
            <SettingRow
              icon="log-out-outline"
              title="Sign Out"
              onPress={handleLogout}
              danger
            />
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          <View style={styles.settingsGroup}>
            <SettingRow
              icon="phone-portrait-outline"
              title="Device Binding"
              subtitle={deviceBound ? 'This device is bound' : 'Device not bound'}
              value={
                <View style={[styles.badge, deviceBound && styles.badgeSuccess]}>
                  <Text style={[styles.badgeText, deviceBound && styles.badgeTextSuccess]}>
                    {deviceBound ? 'BOUND' : 'UNBOUND'}
                  </Text>
                </View>
              }
            />
            
            <SettingRow
              icon="key-outline"
              title="Change Password"
              onPress={() => Alert.alert('Change Password', 'Mocked feature')}
            />
            
            <SettingRow
              icon="finger-print-outline"
              title="Biometric Lock"
              value={
                <Switch
                  value={false}
                  trackColor={{ false: Colors.backgroundCardElevated, true: Colors.auroraPink }}
                  thumbColor={Colors.text}
                  ios_backgroundColor={Colors.backgroundCardElevated}
                />
              }
            />
            
            <SettingRow
              icon="unlink"
              iconFamily="material"
              title="Unbind Device"
              onPress={handleUnbind}
              danger
            />
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
          
          <View style={styles.settingsGroup}>
            <SettingRow
              icon="bug-outline"
              title="Debug Mode"
              value={
                <Switch
                  value={false}
                  trackColor={{ false: Colors.backgroundCardElevated, true: Colors.auroraPink }}
                  thumbColor={Colors.text}
                  ios_backgroundColor={Colors.backgroundCardElevated}
                />
              }
            />
            
            <SettingRow
              icon="cloud-outline"
              title="Backend Status"
              value="Online"
            />
            
            <SettingRow
              icon="information-circle-outline"
              title="About ARI"
              onPress={() => Alert.alert('ARI', 'Privacy-First AI Assistant v1.0.0')}
            />
          </View>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>ARI Control App • v1.0.0</Text>
          <Text style={styles.footerSubtext}>Privacy-First AI Architecture</Text>
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
  killSwitchCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  killSwitchCardActive: {
    borderColor: Colors.error,
  },
  killSwitchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  killSwitchIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.backgroundCardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  killSwitchIconActive: {
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
  },
  killSwitchContent: {
    flex: 1,
  },
  killSwitchTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
    marginBottom: 2,
  },
  killSwitchDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  killSwitchWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.error,
  },
  killSwitchWarningText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.error,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
  },
  settingsGroup: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingRowPressed: {
    backgroundColor: Colors.backgroundCardElevated,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(224, 64, 251, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDanger: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.text,
  },
  settingTitleDanger: {
    color: Colors.error,
  },
  settingSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  settingValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  badge: {
    backgroundColor: Colors.backgroundCardElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.textMuted,
  },
  badgeTextSuccess: {
    color: Colors.success,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  footerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textMuted,
  },
  footerSubtext: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
