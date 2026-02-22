// =============================================================================
// MindLog Mobile — Reusable Card component (Phase 11d)
// Provides consistent card styling across screens.
// Optional `gradient` prop adds a top accent band using expo-linear-gradient.
// =============================================================================

import { View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DESIGN_TOKENS } from '@mindlog/shared';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** If provided, renders a LinearGradient accent band at the top of the card. */
  gradient?: [string, string];
  /** Padding override (defaults to 16). */
  padding?: number;
}

export function Card({ children, style, gradient, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {gradient && (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientBand}
        />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: DESIGN_TOKENS.COLOR_SURFACE,
    borderRadius: DESIGN_TOKENS.RADIUS_CARD,
    borderWidth: 1,
    borderColor: DESIGN_TOKENS.COLOR_SURFACE_ELEVATED,
    marginBottom: 12,
    overflow: 'hidden',
    ...DESIGN_TOKENS.SHADOW_SM,
  },
  gradientBand: {
    height: 4,
  },
});
