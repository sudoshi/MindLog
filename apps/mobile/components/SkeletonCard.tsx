// =============================================================================
// MindLog Mobile — Skeleton shimmer loading placeholder (Phase 11f)
// Shows animated pulsing grey bars while content is being fetched.
// =============================================================================

import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { DESIGN_TOKENS } from '@mindlog/shared';

interface SkeletonLineProps {
  width?: string | number;
  height?: number;
  style?: ViewStyle;
}

export function SkeletonLine({ width = '100%', height = 14, style }: SkeletonLineProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.line,
        { width: width as number, height, opacity },
        style,
      ]}
    />
  );
}

/** A full card-shaped skeleton placeholder. */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === 0 ? '60%' : i === lines - 1 ? '40%' : '100%'}
          height={i === 0 ? 18 : 14}
          style={{ marginBottom: i < lines - 1 ? 12 : 0 }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    backgroundColor: DESIGN_TOKENS.COLOR_SURFACE_ELEVATED,
    borderRadius: 6,
  },
  card: {
    backgroundColor: DESIGN_TOKENS.COLOR_SURFACE,
    borderRadius: DESIGN_TOKENS.RADIUS_CARD,
    borderWidth: 1,
    borderColor: DESIGN_TOKENS.COLOR_SURFACE_ELEVATED,
    padding: 16,
    marginBottom: 12,
  },
});
