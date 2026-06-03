import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RNColorPicker, { HueSlider, Panel1, Preview } from 'reanimated-color-picker';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

const HEX6 = /^#[0-9a-fA-F]{6}$/;

// Normalize any hex (possibly lowercase or with an alpha suffix) to "#RRGGBB".
function normalizeHex(hex: string): string {
  return (hex.length >= 7 ? hex.slice(0, 7) : hex).toUpperCase();
}

interface ColorPickerProps {
  value: string; // "#RRGGBB"
  onChange: (hex: string) => void;
  children: React.ReactNode; // the trigger visual
  label?: string; // native modal heading
  accessibilityLabel?: string;
  modalMaxWidth?: number;
  wrapStyle?: StyleProp<ViewStyle>;
}

/**
 * Cross-platform color picker that wraps a caller-supplied trigger.
 *
 * Web: overlays a transparent native <input type="color"> over the trigger so
 * the real OS picker (wheel/gradient) opens, anchored to the trigger element.
 * Browsers anchor the OS popover to the element that received the activating
 * click and won't open it programmatically, so the input must physically sit
 * on top of the visible trigger. The input fires onChange continuously while
 * dragging, so updates are coalesced to one per animation frame to avoid
 * re-render thrash in large screens (e.g. the studio canvas).
 *
 * Native: a Pressable over the trigger opens a modal with a proper visual
 * saturation/brightness panel + hue slider (reanimated-color-picker). The value
 * is committed on gesture release (onCompleteJS) so the host screen isn't
 * re-rendered on every drag frame.
 */
export function ColorPicker({
  value,
  onChange,
  children,
  label = 'Color',
  accessibilityLabel = 'Pick a custom color',
  modalMaxWidth = 360,
  wrapStyle,
}: ColorPickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [modalOpen, setModalOpen] = useState(false);

  const seed = HEX6.test(value) ? value : '#808080';

  // ── Web rAF coalescing (see component doc above) ──────────────────────────
  const rafIdRef = useRef<number | null>(null);
  const pendingRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(
    () => () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    },
    []
  );
  const handleWebColorInput = useCallback((hex: string) => {
    pendingRef.current = hex;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next !== null) onChangeRef.current(next);
    });
  }, []);

  return (
    <>
      <View style={[styles.triggerWrap, wrapStyle]}>
        {children}
        {Platform.OS === 'web' ? (
          // Real native color input stretched over the trigger. The user's click
          // lands on the input, so the browser anchors the OS picker to it.
          React.createElement('input', {
            type: 'color',
            value: seed,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              handleWebColorInput(e.target.value.toUpperCase()),
            'aria-label': accessibilityLabel,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              border: 0,
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              background: 'transparent',
            },
          })
        ) : (
          <Pressable
            onPress={() => setModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>

      {Platform.OS !== 'web' && (
        <Modal
          visible={modalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setModalOpen(false)}
        >
          {/* RN Modal renders outside the app's root GestureHandlerRootView, so
              the picker's pan gestures need their own root here. */}
          <GestureHandlerRootView style={styles.gestureRoot}>
            <Pressable style={styles.overlay} onPress={() => setModalOpen(false)}>
              {/* Mounted only while open => the picker re-seeds from value each open */}
              <Pressable style={[styles.card, { maxWidth: modalMaxWidth }]} onPress={() => {}}>
                <Text style={styles.heading}>{label}</Text>
                <RNColorPicker
                  value={value}
                  sliderThickness={22}
                  thumbSize={26}
                  onCompleteJS={(c) => onChange(normalizeHex(c.hex))}
                  style={styles.picker}
                >
                  <Preview hideInitialColor style={styles.preview} />
                  <Panel1 style={styles.panel} />
                  <HueSlider style={styles.hue} />
                </RNColorPicker>
                <Pressable
                  onPress={() => setModalOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                  style={styles.doneButton}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </GestureHandlerRootView>
        </Modal>
      )}
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    triggerWrap: {
      position: 'relative',
    },
    gestureRoot: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.lg,
    },
    card: {
      width: '100%',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      padding: D.spacing.lg,
    },
    heading: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.md,
    },
    picker: {
      gap: D.spacing.md,
    },
    preview: {
      height: 36,
      borderRadius: D.radius.md,
    },
    panel: {
      borderRadius: D.radius.md,
    },
    hue: {
      borderRadius: D.radius.pill,
    },
    doneButton: {
      marginTop: D.spacing.lg,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
    },
    doneText: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
    },
  });
}
