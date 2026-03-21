import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

import { FloatingInput } from './FloatingInput';

interface ColorPickerInputProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  accessibilityLabel: string;
}

function isValidHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function ColorPickerInput({
  label,
  value,
  onChange,
  accessibilityLabel,
}: ColorPickerInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [inputValue, setInputValue] = useState(value);
  const [error, setError] = useState<string | null>(null);

  const displayColor = isValidHex(inputValue)
    ? inputValue
    : isValidHex(value)
      ? value
      : colors.bg.elevated;

  function handleChange(text: string) {
    setInputValue(text);
    if (text === '' || isValidHex(text)) {
      setError(null);
      onChange(text);
    } else {
      setError('Must be a valid hex color like #FF5733');
    }
  }

  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: displayColor }]} />
      <View style={styles.inputWrap}>
        <FloatingInput
          label={label}
          value={inputValue}
          onChangeText={handleChange}
          error={error}
          autoCapitalize="characters"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Enter a hex color code starting with #"
        />
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.sm,
    },
    swatch: {
      width: 44,
      height: 58,
      borderRadius: D.radius.sm,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      marginTop: 0,
    },
    inputWrap: {
      flex: 1,
    },
  });
}
