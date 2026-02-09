/**
 * Audit Log Screen - ARI Control App (Aurora Themed)
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import Colors from '@/constants/colors';
import { useARI, type AuditLogEntry } from '@/lib/ari-context';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function AuditItem({ entry }: { entry: AuditLogEntry }) {
  const statusIcon = entry.status === 'allowed' ? 'checkmark-circle' : 'close-circle';
  const statusColor = entry.status === 'allowed' ? Colors.success : Colors.error;
  
  return (
    <View style={styles.auditItem}>
      <View style={[styles.statusIcon, { backgroundColor: `${statusColor}20` }]}>
        <Ionicons name={statusIcon} size={20} color={statusColor} />
      </View>
      
      <View style={styles.auditContent}>
        <Text style={styles.auditAction}>{entry.action}</Text>
        <View style={styles.auditMeta}>
          <Text style={styles.auditCapability}>{entry.capability}</Text>
          <Text style={styles.auditDot}>•</Text>
          <Text style={styles.auditTime}>{formatTime(entry.timestamp)}</Text>
        </View>
        {entry.details && (
          <Text style={styles.auditDetails}>{entry.details}</Text>
        )}
      </View>
      
      <Text style={[styles.auditStatus, { color: statusColor }]}>
        {entry.status.toUpperCase()}
      </Text>
    </View>
  );
}

export default function AuditScreen() {
  const insets = useSafeAreaInsets();
  const { auditLog, clearAuditLog } = useARI();
  
  const handleClearLog = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearAuditLog();
  };

  const groupedEntries = auditLog.reduce((acc, entry) => {
    const dateKey = formatDate(entry.timestamp);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, AuditLogEntry[]>);

  const sections = Object.entries(groupedEntries).map(([date, entries]) => ({
    date,
    data: entries,
  }));

  const allowedCount = auditLog.filter(e => e.status === 'allowed').length;
  const deniedCount = auditLog.filter(e => e.status === 'denied').length;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <LinearGradient
        colors={[Colors.background, Colors.backgroundSecondary, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20) }]}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Activity Log</Text>
          <Text style={styles.subtitle}>Audit Trail</Text>
        </View>
        
        {auditLog.length > 0 && (
          <Pressable
            onPress={handleClearLog}
            style={({ pressed }) => [styles.clearButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </Pressable>
        )}
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{auditLog.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.success }]}>{allowedCount}</Text>
          <Text style={styles.statLabel}>Allowed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.error }]}>{deniedCount}</Text>
          <Text style={styles.statLabel}>Denied</Text>
        </View>
      </View>
      
      {auditLog.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Activity</Text>
          <Text style={styles.emptyText}>
            Actions and requests will appear here when ARI is used.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.date}
          contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.date}</Text>
              {section.data.map((entry) => (
                <AuditItem key={entry.id} entry={entry} />
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerText: {},
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
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
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
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: Colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  auditItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditContent: {
    flex: 1,
  },
  auditAction: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    marginBottom: 4,
  },
  auditMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  auditCapability: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  auditDot: {
    color: Colors.textMuted,
    fontSize: 8,
  },
  auditTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  auditDetails: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  auditStatus: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
});
