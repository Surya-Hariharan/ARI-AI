/**
 * Admin Simulation Controls Component for InterceptX
 * 
 * Control panel for running security simulations:
 * - Hijack simulation with fingerprint alterations
 * - Replay attack simulation
 * - Real-time timeline visualization
 * - Glassmorphism design
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import Colors from '@/constants/colors';

// ============================================================================
// TYPES
// ============================================================================

export interface SimulationScenario {
    id: string;
    name: string;
    description: string;
    type: 'hijack' | 'replay' | 'drift';
    risk: 'low' | 'medium' | 'high';
}

export interface TimelineEvent {
    timestamp: string;
    event: string;
    result: 'success' | 'blocked' | 'detected';
}

export interface AdminSimulationControlsProps {
    sessionId?: string;
    scenarios: SimulationScenario[];
    timeline: TimelineEvent[];
    onRunSimulation: (scenario: SimulationScenario) => void;
    isRunning: boolean;
}

// ============================================================================
// RISK COLORS
// ============================================================================

const RISK_COLORS = {
    low: '#00FF88',
    medium: '#FFB800',
    high: '#FF3366',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function AdminSimulationControls({
    sessionId,
    scenarios,
    timeline,
    onRunSimulation,
    isRunning,
}: AdminSimulationControlsProps) {
    const [selectedScenario, setSelectedScenario] = useState<SimulationScenario | null>(null);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>🔬 Simulation Lab</Text>
                <Text style={styles.subtitle}>
                    {sessionId ? `Session: ${sessionId.substring(0, 12)}...` : 'No session selected'}
                </Text>
            </View>

            {/* Scenarios */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scenarioScroll}
            >
                {scenarios.map((scenario) => (
                    <ScenarioCard
                        key={scenario.id}
                        scenario={scenario}
                        selected={selectedScenario?.id === scenario.id}
                        onSelect={() => setSelectedScenario(scenario)}
                        disabled={isRunning}
                    />
                ))}
            </ScrollView>

            {/* Run Button */}
            <RunButton
                onPress={() => selectedScenario && onRunSimulation(selectedScenario)}
                disabled={!selectedScenario || !sessionId || isRunning}
                isRunning={isRunning}
            />

            {/* Timeline */}
            {timeline.length > 0 && (
                <View style={styles.timelineContainer}>
                    <Text style={styles.timelineTitle}>📋 Event Timeline</Text>
                    {timeline.map((event, index) => (
                        <TimelineItem key={index} event={event} index={index} />
                    ))}
                </View>
            )}
        </View>
    );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ScenarioCard({
    scenario,
    selected,
    onSelect,
    disabled,
}: {
    scenario: SimulationScenario;
    selected: boolean;
    onSelect: () => void;
    disabled: boolean;
}) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.95, { damping: 15 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 15 });
    };

    return (
        <Pressable
            onPress={onSelect}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
        >
            <Animated.View style={animatedStyle}>
                <BlurView
                    intensity={selected ? 40 : 20}
                    tint="dark"
                    style={[
                        styles.scenarioCard,
                        selected && styles.scenarioCardSelected,
                        { borderColor: RISK_COLORS[scenario.risk] + (selected ? 'FF' : '40') }
                    ]}
                >
                    <View style={[styles.riskBadge, { backgroundColor: RISK_COLORS[scenario.risk] + '30' }]}>
                        <Text style={[styles.riskText, { color: RISK_COLORS[scenario.risk] }]}>
                            {scenario.risk.toUpperCase()}
                        </Text>
                    </View>

                    <Text style={styles.scenarioName}>{scenario.name}</Text>
                    <Text style={styles.scenarioType}>{scenario.type}</Text>
                    <Text style={styles.scenarioDescription} numberOfLines={2}>
                        {scenario.description}
                    </Text>
                </BlurView>
            </Animated.View>
        </Pressable>
    );
}

function RunButton({
    onPress,
    disabled,
    isRunning,
}: {
    onPress: () => void;
    disabled: boolean;
    isRunning: boolean;
}) {
    const scale = useSharedValue(1);
    const glow = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const glowStyle = useAnimatedStyle(() => ({
        shadowOpacity: glow.value,
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.95, { damping: 12 });
        glow.value = withTiming(1, { duration: 100 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 12 });
        glow.value = withTiming(0.5, { duration: 200 });
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
        >
            <Animated.View
                style={[
                    styles.runButton,
                    disabled && styles.runButtonDisabled,
                    animatedStyle,
                    glowStyle,
                ]}
            >
                <Text style={[styles.runButtonText, disabled && styles.runButtonTextDisabled]}>
                    {isRunning ? '⏳ Running...' : '▶️ Run Simulation'}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

function TimelineItem({
    event,
    index,
}: {
    event: TimelineEvent;
    index: number;
}) {
    const resultColors = {
        success: '#00FF88',
        blocked: '#FF3366',
        detected: '#FFB800',
    };

    const resultIcons = {
        success: '✓',
        blocked: '✗',
        detected: '!',
    };

    return (
        <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: resultColors[event.result] }]}>
                <Text style={styles.timelineDotText}>{resultIcons[event.result]}</Text>
            </View>
            <View style={styles.timelineContent}>
                <Text style={styles.timelineEvent}>{event.event}</Text>
                <Text style={styles.timelineTimestamp}>{event.timestamp}</Text>
            </View>
        </View>
    );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        fontFamily: 'monospace',
    },
    scenarioScroll: {
        paddingHorizontal: 16,
        marginVertical: 12,
    },
    scenarioCard: {
        width: 160,
        padding: 12,
        marginRight: 12,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    scenarioCardSelected: {
        borderWidth: 2,
    },
    riskBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginBottom: 8,
    },
    riskText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    scenarioName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    scenarioType: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    scenarioDescription: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 16,
    },
    runButton: {
        marginHorizontal: 16,
        marginVertical: 12,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: Colors.auroraMagenta,
        alignItems: 'center',
        shadowColor: Colors.auroraMagenta,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 12,
        elevation: 4,
    },
    runButtonDisabled: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        shadowOpacity: 0,
    },
    runButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    runButtonTextDisabled: {
        color: 'rgba(255, 255, 255, 0.3)',
    },
    timelineContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    timelineTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
    },
    timelineItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    timelineDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    timelineDotText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#000000',
    },
    timelineContent: {
        flex: 1,
    },
    timelineEvent: {
        fontSize: 13,
        color: '#FFFFFF',
        marginBottom: 2,
    },
    timelineTimestamp: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        fontFamily: 'monospace',
    },
});

export default AdminSimulationControls;
