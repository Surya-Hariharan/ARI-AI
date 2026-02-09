/**
 * Glow Overlay Component - Aurora Themed
 * 
 * Visual feedback when ARI is activated with pink/purple aurora glow effects
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import Colors from '@/constants/colors';

const { width, height } = Dimensions.get('window');

type OverlayState = 'idle' | 'listening' | 'processing' | 'denied' | 'success';

interface GlowOverlayProps {
  state: OverlayState;
  visible: boolean;
}

const STATE_COLORS: Record<OverlayState, string[]> = {
  idle: ['transparent', 'transparent'],
  listening: [Colors.auroraPink, Colors.auroraMagenta],
  processing: [Colors.auroraPurple, Colors.auroraViolet],
  denied: [Colors.error, '#FF3366'],
  success: [Colors.success, '#00FF88'],
};

export function GlowOverlay({ state, visible }: GlowOverlayProps) {
  const opacity = useSharedValue(0);
  const glowIntensity = useSharedValue(0);

  useEffect(() => {
    if (visible && state !== 'idle') {
      opacity.value = withTiming(1, { duration: 200 });
      glowIntensity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      opacity.value = withTiming(0, { duration: 300 });
      glowIntensity.value = withTiming(0, { duration: 300 });
    }
  }, [visible, state]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowIntensity.value,
  }));

  if (!visible || state === 'idle') {
    return null;
  }

  const colors = STATE_COLORS[state];

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <Animated.View style={[styles.glowContainer, glowStyle]}>
        <LinearGradient
          colors={[colors[0], 'transparent']}
          style={styles.topEdge}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        
        <LinearGradient
          colors={[colors[0], 'transparent']}
          style={styles.bottomEdge}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
        />
        
        <LinearGradient
          colors={[colors[0], 'transparent']}
          style={styles.leftEdge}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
        />
        
        <LinearGradient
          colors={[colors[0], 'transparent']}
          style={styles.rightEdge}
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0, y: 0.5 }}
        />
        
        <View style={[styles.corner, styles.topLeft, { backgroundColor: colors[0] }]} />
        <View style={[styles.corner, styles.topRight, { backgroundColor: colors[0] }]} />
        <View style={[styles.corner, styles.bottomLeft, { backgroundColor: colors[0] }]} />
        <View style={[styles.corner, styles.bottomRight, { backgroundColor: colors[0] }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  glowContainer: {
    flex: 1,
  },
  topEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
  },
  leftEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 50,
  },
  rightEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 50,
  },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  topLeft: {
    top: 8,
    left: 8,
  },
  topRight: {
    top: 8,
    right: 8,
  },
  bottomLeft: {
    bottom: 8,
    left: 8,
  },
  bottomRight: {
    bottom: 8,
    right: 8,
  },
});
