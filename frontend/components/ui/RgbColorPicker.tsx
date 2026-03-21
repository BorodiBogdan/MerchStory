import Slider from '@react-native-community/slider';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

// ── helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// ── component ──────────────────────────────────────────────────────────────

interface RgbColorPickerProps {
  label: string;
  value: string; // hex "#RRGGBB" or empty
  onChange: (hex: string) => void;
}

export function RgbColorPicker({ label, value, onChange }: RgbColorPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [open, setOpen] = useState(false);

  const initialRgb = useMemo(() => hexToRgb(value || '#808080'), [value]);
  const [r, setR] = useState(initialRgb.r);
  const [g, setG] = useState(initialRgb.g);
  const [b, setB] = useState(initialRgb.b);

  const currentHex = rgbToHex(r, g, b);
  const displayColor = value && value.length === 7 ? value : currentHex;

  const handleRChange = useCallback(
    (v: number) => {
      setR(v);
      onChange(rgbToHex(v, g, b));
    },
    [g, b, onChange]
  );
  const handleGChange = useCallback(
    (v: number) => {
      setG(v);
      onChange(rgbToHex(r, v, b));
    },
    [r, b, onChange]
  );
  const handleBChange = useCallback(
    (v: number) => {
      setB(v);
      onChange(rgbToHex(r, g, v));
    },
    [r, g, onChange]
  );

  return (
    <View style={styles.container}>
      {/* Swatch button — tapping toggles the picker panel */}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[styles.swatchButton, open && styles.swatchButtonOpen]}
        accessibilityRole="button"
        accessibilityLabel={`Pick ${label} colour`}
        accessibilityState={{ expanded: open }}
      >
        <View style={[styles.swatch, { backgroundColor: displayColor }]} />
        <View style={styles.swatchInfo}>
          <Text style={styles.swatchLabel}>{label}</Text>
          <Text style={styles.swatchHex}>{displayColor}</Text>
        </View>
        <Text style={[styles.chevron, open && styles.chevronUp]}>›</Text>
      </Pressable>

      {/* Expandable RGB slider panel */}
      {open && (
        <View style={styles.panel}>
          <SliderRow
            channel="R"
            value={r}
            trackColor={`rgb(${r},0,0)`}
            onValueChange={handleRChange}
          />
          <SliderRow
            channel="G"
            value={g}
            trackColor={`rgb(0,${g},0)`}
            onValueChange={handleGChange}
          />
          <SliderRow
            channel="B"
            value={b}
            trackColor={`rgb(0,0,${b})`}
            onValueChange={handleBChange}
          />
          {/* Preview strip */}
          <View style={[styles.previewStrip, { backgroundColor: currentHex }]}>
            <Text style={styles.previewHex}>{currentHex.toUpperCase()}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── internal slider row ─────────────────────────────────────────────────────

function SliderRow({
  channel,
  value,
  trackColor,
  onValueChange,
}: {
  channel: string;
  value: number;
  trackColor: string;
  onValueChange: (v: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.channelLabel}>{channel}</Text>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={255}
        step={1}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={trackColor}
        maximumTrackTintColor={colors.border.default}
        thumbTintColor={trackColor}
        accessibilityLabel={`${channel} channel value ${value}`}
      />
      <Text style={styles.channelValue}>{Math.round(value)}</Text>
    </View>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      borderRadius: D.radius.md,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: colors.border.default,
      marginBottom: D.spacing.sm,
    },
    swatchButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: D.spacing.sm,
      backgroundColor: colors.bg.elevated,
      gap: D.spacing.sm,
    },
    swatchButtonOpen: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: D.radius.sm,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.1)',
    },
    swatchInfo: {
      flex: 1,
    },
    swatchLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    swatchHex: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontFamily: 'monospace',
    },
    chevron: {
      fontSize: 20,
      color: colors.text.muted,
      transform: [{ rotate: '90deg' }],
    },
    chevronUp: {
      transform: [{ rotate: '-90deg' }],
    },
    panel: {
      padding: D.spacing.md,
      backgroundColor: colors.bg.surface,
      gap: D.spacing.xs,
    },
    sliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    channelLabel: {
      width: 16,
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.text.muted,
      textAlign: 'center',
    },
    slider: {
      flex: 1,
      height: 32,
    },
    channelValue: {
      width: 28,
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      textAlign: 'right',
      fontFamily: 'monospace',
    },
    previewStrip: {
      height: 28,
      borderRadius: D.radius.sm,
      marginTop: D.spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewHex: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      fontFamily: 'monospace',
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
  });
}
