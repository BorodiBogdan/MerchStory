import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';

interface DateFieldProps {
  label: string;
  value: string; // ISO YYYY-MM-DD or ''
  onChange: (next: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseIso(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Days since Monday of the week containing the 1st of the month.
function leadingBlanks(first: Date): number {
  const jsDay = first.getDay(); // 0 = Sun
  return (jsDay + 6) % 7; // 0 = Mon
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function inRange(d: Date, min: Date | null, max: Date | null): boolean {
  if (min && d < min) return false;
  if (max && d > max) return false;
  return true;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Any',
  minDate,
  maxDate,
}: DateFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const parsed = parseIso(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(parsed ?? new Date());
  const min = parseIso(minDate ?? '');
  const max = parseIso(maxDate ?? '');

  useEffect(() => {
    if (open) setCursor(parsed ?? new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const first = startOfMonth(cursor);
  const blanks = leadingBlanks(first);
  const days = daysInMonth(cursor);
  const today = new Date();

  const cells: (number | null)[] = [];
  for (let i = 0; i < blanks; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function goPrev() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  }
  function goNext() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }
  function pick(day: number) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    if (!inRange(d, min, max)) return;
    onChange(toIso(d));
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${parsed ? formatDisplay(parsed) : placeholder}`}
      >
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldValue, !parsed && styles.fieldPlaceholder]} numberOfLines={1}>
          {parsed ? formatDisplay(parsed) : placeholder}
        </Text>
        {parsed ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onChange('');
            }}
            hitSlop={8}
            accessibilityLabel={`Clear ${label}`}
          >
            <Ionicons name="close-circle" size={14} color={colors.text.muted} />
          </Pressable>
        ) : (
          <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable
                onPress={goPrev}
                style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
              </Pressable>
              <Text style={styles.headerTitle}>
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Pressable
                onPress={goNext}
                style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={18} color={colors.text.primary} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((c, idx) => {
                if (c === null) {
                  return <View key={`blank-${idx}`} style={styles.cell} />;
                }
                const dayDate = new Date(cursor.getFullYear(), cursor.getMonth(), c);
                const disabled = !inRange(dayDate, min, max);
                const isSelected = parsed !== null && sameDay(dayDate, parsed);
                const isToday = sameDay(dayDate, today);
                return (
                  <Pressable
                    key={c}
                    onPress={() => pick(c)}
                    disabled={disabled}
                    style={({ pressed }) => [
                      styles.cell,
                      isSelected && styles.cellSelected,
                      isToday && !isSelected && styles.cellToday,
                      disabled && styles.cellDisabled,
                      pressed && !disabled && !isSelected && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${MONTHS[cursor.getMonth()]} ${c}, ${cursor.getFullYear()}`}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isSelected && styles.cellTextSelected,
                        disabled && styles.cellTextDisabled,
                      ]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  onChange(toIso(new Date()));
                  setOpen(false);
                }}
                accessibilityLabel="Select today"
              >
                <Text style={styles.footerBtnText}>Today</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setOpen(false)}
              >
                <Text style={[styles.footerBtnText, { color: colors.text.secondary }]}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    field: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 40,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.input,
      paddingHorizontal: D.spacing.sm,
      gap: 6,
      minWidth: 0,
    },
    fieldLabel: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    fieldValue: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
    },
    fieldPlaceholder: {
      color: colors.text.muted,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      padding: D.spacing.md,
      ...D.shadow.modal,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: D.spacing.sm,
    },
    headerTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    navBtn: {
      width: 32,
      height: 32,
      borderRadius: D.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: D.radius.md,
    },
    cellText: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
    },
    cellSelected: {
      backgroundColor: colors.accent.primary,
    },
    cellTextSelected: {
      color: '#fff',
      fontWeight: D.fontWeight.semibold,
    },
    cellToday: {
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    cellDisabled: {
      opacity: 0.3,
    },
    cellTextDisabled: {
      color: colors.text.muted,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: D.spacing.sm,
      marginTop: D.spacing.sm,
    },
    footerBtn: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: 8,
      borderRadius: D.radius.pill,
    },
    footerBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
  });
}
