import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

interface StepProgressProps {
  currentStep: 1 | 2;
  totalSteps?: 2;
  stepLabels: [string, string];
}

export function StepProgress({ currentStep, stepLabels }: StepProgressProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fillWidth = useSharedValue(currentStep === 1 ? 0 : 100);

  useEffect(() => {
    fillWidth.value = withTiming(currentStep === 1 ? 0 : 100, { duration: D.duration.slow });
  }, [currentStep, fillWidth]);

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {([1, 2] as const).map((step) => {
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;
          return (
            <View key={step} style={styles.stepItem}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isActive && styles.circleActive,
                ]}
              >
                <Text
                  style={[styles.circleText, (isActive || isCompleted) && styles.circleTextActive]}
                >
                  {isCompleted ? '✓' : step}
                </Text>
              </View>
              <Text
                style={[styles.label, (isActive || isCompleted) && styles.labelActive]}
                numberOfLines={1}
              >
                {stepLabels[step - 1]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth.value === 100 ? '100%' : '0%' }]} />
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      marginBottom: D.spacing.xl,
    },
    stepsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: D.spacing.sm,
    },
    stepItem: {
      alignItems: 'center',
      gap: D.spacing.xs,
      flex: 1,
    },
    circle: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      borderWidth: 2,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
      ...D.shadow.glow,
    },
    circleCompleted: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.primary,
    },
    circleText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
    },
    circleTextActive: {
      color: colors.text.primary,
    },
    label: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
    },
    labelActive: {
      color: colors.accent.primary,
    },
    track: {
      height: 3,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.subtle,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.pill,
    },
  });
}
