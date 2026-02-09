/**
 * Session Status Indicator Component for InterceptX
 * 
 * Visual feedback for session security state with iOS-inspired design:
 * - Edge glow effect based on session status
 * - Physics-based micro-animations
 * - Glassmorphism card design
 * - Smooth state transitions
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withSpring,
    Easing,
    interpolateColor,
} from 'react-native-reanimated';

import Colors from '@/constants/colors';

// ============================================================================
// TYPES
// ============================================================================

export type SessionStatus = 'secure' | 'degraded' | 'intercepted' | 'terminated' | 'unknown';

export interface SessionStatusProps {
    sessionId: string;
    status: SessionStatus;
    driftScore?: number;
    lastActivity?: string;
    onPress?: () => void;
}

// ============================================================================
// STATUS CONFIGURATION
// ============================================================================

const STATUS_CONFIG: Record<SessionStatus, {
    label: string;
    color: string;
    glowColor: string;
    icon: string;
    pulseSpeed: number;
}> = {
    secure: {
        label: 'Secure',
        color: '#00FF88',
        glowColor: 'rgba(0, 255, 136, 0.3)',
        icon: '🔒',
        pulseSpeed: 2000,
    },
    degraded: {
        label: 'Degraded',
        color: '#FFB800',
        glowColor: 'rgba(255, 184, 0, 0.3)',
        icon: '⚠️',
        pulseSpeed: 1000,
    },
    intercepted: {
        label: 'Intercepted',
        color: '#FF3366',
        glowColor: 'rgba(255, 51, 102, 0.4)',
        icon: '🚨',
        pulseSpeed: 500,
    },
    terminated: {
        label: 'Terminated',
        color: '#666666',
        glowColor: 'rgba(102, 102, 102, 0.2)',
        icon: '⏹️',
        pulseSpeed: 0,
    },
    unknown: {
        label: 'Unknown',
        color: '#888888',
        glowColor: 'rgba(136, 136, 136, 0.2)',
        icon: '❓',
        pulseSpeed: 0,
    },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function SessionStatusIndicator({
    sessionId,
    status,
    driftScore = 0,
    lastActivity,
    onPress,
}: SessionStatusProps) {
    const config = STATUS_CONFIG[status];

    // Animation values
    const glowOpacity = useSharedValue(0.3);
    const pulseScale = useSharedValue(1);
    const cardScale = useSharedValue(1);

    // Glow pulsing animation
    useEffect(() => {
        if (config.pulseSpeed > 0) {
            glowOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.8, { duration: config.pulseSpeed / 2, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0.3, { duration: config.pulseSpeed / 2, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );

            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.05, { duration: config.pulseSpeed / 2, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1, { duration: config.pulseSpeed / 2, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        } else {
            glowOpacity.value = withTiming(0.2, { duration: 300 });
            pulseScale.value = withTiming(1, { duration: 300 });
        }
    }, [status, config.pulseSpeed]);

    // Animated styles
    const glowStyle = useAnimatedStyle(() => ({
        opacity: glowOpacity.value,
    }));

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ scale: cardScale.value }],
    }));

    // Press handlers
    const handlePressIn = () => {
        cardScale.value = withSpring(0.98, { damping: 15 });
    };

    const handlePressOut = () => {
        cardScale.value = withSpring(1, { damping: 15 });
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={!onPress}
        >
            <Animated.View style={[styles.card, cardStyle]}>
                {/* Glassmorphism background */}
                <BlurView intensity={20} tint="dark" style={styles.blurBackground}>
                    {/* Edge glow effect */}
                    <Animated.View style={[styles.glowOverlay, glowStyle]}>
                        <LinearGradient
                            colors={[config.glowColor, 'transparent']}
                            style={styles.topGlow}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                        />
                        <LinearGradient
                            colors={[config.glowColor, 'transparent']}
                            style={styles.bottomGlow}
                            start={{ x: 0.5, y: 1 }}
                            end={{ x: 0.5, y: 0 }}
                        />
                    </Animated.View>

                    {/* Content */}
                    <View style={styles.content}>
                        {/* Status indicator dot with pulse */}
                        <View style={styles.indicatorContainer}>
                            <Animated.View
                                style={[
                                    styles.indicator,
                                    { backgroundColor: config.color },
                                    indicatorStyle
                                ]}
                            />
                            <View style={[styles.indicatorGlow, { shadowColor: config.color }]} />
                        </View>

                        {/* Session info */}
                        <View style={styles.info}>
                            <Text style={styles.statusLabel}>{config.icon} {config.label}</Text>
                            <Text style={styles.sessionId}>
                                Session: {sessionId.substring(0, 12)}...
                            </Text>
                            {driftScore > 0 && (
                                <Text style={[styles.driftScore, { color: config.color }]}>
                                    Drift: {driftScore}%
                                </Text>
                            )}
                            {lastActivity && (
                                <Text style={styles.lastActivity}>
                                    Last activity: {lastActivity}
                                </Text>
                            )}
                        </View>

                        {/* Status badge */}
                        <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
                            <Text style={[styles.badgeText, { color: config.color }]}>
                                {status.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </BlurView>
            </Animated.View>
        </Pressable>
    );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        overflow: 'hidden',
        marginVertical: 8,
        marginHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    blurBackground: {
        overflow: 'hidden',
    },
    glowOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    topGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 40,
    },
    bottomGlow: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 40,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        zIndex: 2,
    },
    indicatorContainer: {
        position: 'relative',
        marginRight: 12,
    },
    indicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    indicatorGlow: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
    },
    info: {
        flex: 1,
    },
    statusLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    sessionId: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        fontFamily: 'monospace',
    },
    driftScore: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 4,
    },
    lastActivity: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
        marginTop: 2,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});

export default SessionStatusIndicator;
