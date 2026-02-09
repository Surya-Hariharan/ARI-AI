/**
 * Permissions Screen - ARI Control App (Aurora Themed)
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import Colors from '@/constants/colors';
import { useARI, type Capability } from '@/lib/ari-context';

const CATEGORY_LABELS: Record<string, string> = {
  apps: 'Applications',
  system: 'System',
  communication: 'Communication',
  data: 'Data & Privacy',
};

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const { capabilities, toggleCapability, setAllCapabilities, killSwitchEnabled } = useARI();
  
  const groupedCapabilities = capabilities.reduce((acc, cap) => {
    if (!acc[cap.category]) acc[cap.category] = [];
    acc[cap.category].push(cap);
    return acc;
  }, {} as Record<string, Capability[]>);

  const enabledCount = capabilities.filter(c => c.enabled).length;

  const handleToggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleCapability(id);
  };

  const handleEnableAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAllCapabilities(true);
  };

  const handleDisableAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAllCapabilities(false);
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
        colors={['rgba(124, 77, 255, 0.06)', 'transparent']}
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
          <Text style={styles.title}>Permissions</Text>
          <Text style={styles.subtitle}>Capability Registry</Text>
        </View>
        
        {killSwitchEnabled && (
          <View style={styles.warningCard}>
            <Ionicons name="warning" size={24} color={Colors.warning} />
            <Text style={styles.warningText}>
              Kill switch is enabled. All capabilities are blocked regardless of settings.
            </Text>
          </View>
        )}
        
        <View style={styles.summaryCard}>
          <LinearGradient
            colors={[Colors.backgroundCard, Colors.backgroundDark]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Active Capabilities</Text>
            <Text style={styles.summaryValue}>{enabledCount} / {capabilities.length}</Text>
          </View>
          
          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleEnableAll}
              style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.actionButtonText}>Enable All</Text>
            </Pressable>
            <Pressable
              onPress={handleDisableAll}
              style={({ pressed }) => [styles.actionButton, styles.actionButtonDanger, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>Disable All</Text>
            </Pressable>
          </View>
        </View>
        
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.auroraPink} />
          <Text style={styles.infoText}>
            ARI can only request actions for enabled capabilities. All requests are logged and subject to policy enforcement.
          </Text>
        </View>
        
        {Object.entries(groupedCapabilities).map(([category, caps]) => (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category] || category}</Text>
            
            {caps.map((cap) => (
              <View key={cap.id} style={styles.permissionItem}>
                <View style={[styles.permissionIcon, cap.enabled && styles.permissionIconActive]}>
                  <Ionicons name={cap.icon as any} size={24} color={cap.enabled ? Colors.auroraPink : Colors.textMuted} />
                </View>
                
                <View style={styles.permissionContent}>
                  <Text style={styles.permissionName}>{cap.name}</Text>
                  <Text style={styles.permissionDesc}>{cap.description}</Text>
                </View>
                
                <Switch
                  value={cap.enabled}
                  onValueChange={() => handleToggle(cap.id)}
                  trackColor={{ false: Colors.backgroundCard, true: Colors.auroraMagenta }}
                  thumbColor={cap.enabled ? Colors.auroraPink : Colors.textMuted}
                  ios_backgroundColor={Colors.backgroundCard}
                />
              </View>
            ))}
          </View>
        ))}
        
        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <Text style={styles.securityNoteText}>
            Changes to capabilities are logged. Disabled capabilities cannot be accessed by the Companion Core.
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
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 183, 77, 0.15)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  warningText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.warning,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    gap: 16,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.text,
  },
  summaryValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.auroraPink,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.backgroundCardElevated,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  actionButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
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
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 8,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
  },
  permissionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.backgroundCardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionIconActive: {
    backgroundColor: 'rgba(224, 64, 251, 0.15)',
  },
  permissionContent: {
    flex: 1,
  },
  permissionName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
  },
  permissionDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  securityNoteText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
});
