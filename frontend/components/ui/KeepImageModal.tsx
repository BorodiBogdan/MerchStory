import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

const NAME_MAX = 80;

interface KeepImageModalProps {
  visible: boolean;
  defaultName?: string;
  onCancel: () => void;
  onConfirm: (name: string) => Promise<void> | void;
}

export function KeepImageModal({ visible, defaultName, onCancel, onConfirm }: KeepImageModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(defaultName ?? '');
      setError(null);
      setSaving(false);
    }
  }, [visible, defaultName]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a name.');
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(`Name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={saving ? undefined : onCancel}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <Ionicons name="bookmark-outline" size={26} color={colors.accent.primary} />
          </View>
          <Text style={styles.title}>Name this image</Text>
          <Text style={styles.body}>Give it a descriptive name so you can find it later.</Text>

          <TextInput
            style={styles.input as any}
            placeholder="e.g. Spring sale wallpaper"
            placeholderTextColor={colors.text.muted}
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (error) setError(null);
            }}
            maxLength={NAME_MAX}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            editable={!saving}
          />
          <View style={styles.helperRow}>
            <Text style={styles.helper}>{error ? error : ' '}</Text>
            <Text style={styles.counter}>
              {name.length}/{NAME_MAX}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              onPress={onCancel}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.8 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    dialog: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      padding: D.spacing.lg,
      width: '100%',
      maxWidth: 380,
      ...D.shadow.modal,
    },
    iconWrap: {
      alignSelf: 'center',
      width: 52,
      height: 52,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: D.spacing.xs,
    },
    body: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.md,
    },
    input: {
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 11,
      color: colors.text.primary,
      fontSize: D.fontSize.base,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    helperRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
      marginBottom: D.spacing.md,
      minHeight: 18,
    },
    helper: {
      flex: 1,
      fontSize: D.fontSize.xs,
      color: '#EF4444',
    },
    counter: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    actions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    saveBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      ...D.shadow.glow,
    },
    saveText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
  });
}
