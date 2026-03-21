import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import {
  getShopProfile,
  ShopProfileResponse,
  updateShopProfile,
  uploadShopLogo,
} from '@/utils/api';

const DOMAIN_OPTIONS = [
  { value: 'Fashion', label: 'Fashion' },
  { value: 'Tech', label: 'Tech' },
  { value: 'Food', label: 'Food' },
  { value: 'Beauty', label: 'Beauty' },
  { value: 'Other', label: 'Other' },
];

const ATMOSPHERE_OPTIONS = [
  { value: 'Urban', label: 'Urban' },
  { value: 'Nature', label: 'Nature' },
  { value: 'MinimalInterior', label: 'Minimal Interior' },
  { value: 'ProfessionalStudio', label: 'Studio' },
];

const SHOP_TYPE_OPTIONS = [
  { value: 'Luxury', label: 'Luxury' },
  { value: 'DiscountOutlet', label: 'Discount / Outlet' },
  { value: 'ArtisanalHandmade', label: 'Artisanal / Handmade' },
];

function labelFor(options: { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

function hexToRgb(hex: string) {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

type ColorKey = 'primaryColor' | 'secondaryColor' | 'accentColor';
const COLOR_KEYS: { key: ColorKey; label: string }[] = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'secondaryColor', label: 'Secondary' },
  { key: 'accentColor', label: 'Accent' },
];

function ColorEditPanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const init = hexToRgb(value || '#808080');
  const [r, setR] = useState(init.r);
  const [g, setG] = useState(init.g);
  const [b, setB] = useState(init.b);

  const hex = rgbToHex(r, g, b);

  const channels = [
    {
      ch: 'R',
      val: r,
      trackColor: `rgb(${r},0,0)`,
      set: (v: number) => {
        setR(v);
        onChange(rgbToHex(v, g, b));
      },
    },
    {
      ch: 'G',
      val: g,
      trackColor: `rgb(0,${g},0)`,
      set: (v: number) => {
        setG(v);
        onChange(rgbToHex(r, v, b));
      },
    },
    {
      ch: 'B',
      val: b,
      trackColor: `rgb(0,0,${b})`,
      set: (v: number) => {
        setB(v);
        onChange(rgbToHex(r, g, v));
      },
    },
  ];

  return (
    <View style={colorPanelStyles.panel}>
      {channels.map(({ ch, val, trackColor, set }) => (
        <View key={ch} style={colorPanelStyles.row}>
          <Text style={[colorPanelStyles.ch, { color: colors.text.muted }]}>{ch}</Text>
          <Slider
            style={colorPanelStyles.slider}
            minimumValue={0}
            maximumValue={255}
            step={1}
            value={val}
            onValueChange={set}
            minimumTrackTintColor={trackColor}
            maximumTrackTintColor={colors.border.default}
            thumbTintColor={trackColor}
          />
          <Text style={[colorPanelStyles.val, { color: colors.text.secondary }]}>
            {Math.round(val)}
          </Text>
        </View>
      ))}
      <View style={[colorPanelStyles.preview, { backgroundColor: hex }]}>
        <Text style={colorPanelStyles.previewHex}>{hex.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const colorPanelStyles = StyleSheet.create({
  panel: {
    paddingHorizontal: D.spacing.sm,
    paddingBottom: D.spacing.sm,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.spacing.xs,
  },
  ch: {
    width: 14,
    fontSize: D.fontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: 28,
  },
  val: {
    width: 26,
    fontSize: D.fontSize.xs,
    textAlign: 'right',
  },
  preview: {
    height: 22,
    borderRadius: D.radius.sm,
    marginTop: D.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHex: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
});

type DraftState = {
  brandName: string;
  slogan: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  newLogoUri: string | null;
  businessDomain: string;
  targetAudience: string;
  atmosphere: string;
  shopType: string;
  competitors: string;
  phoneNumber: string;
  email: string;
  addresses: string[];
  instagramHandle: string;
  facebookHandle: string;
  tikTokHandle: string;
};

function profileToDraft(p: ShopProfileResponse): DraftState {
  return {
    brandName: p.brandName ?? '',
    slogan: p.slogan ?? '',
    primaryColor: p.primaryColor ?? '#6366F1',
    secondaryColor: p.secondaryColor ?? '#818CF8',
    accentColor: p.accentColor ?? '#A5B4FC',
    newLogoUri: null,
    businessDomain: p.businessDomain ?? '',
    targetAudience: p.targetAudience ?? '',
    atmosphere: p.atmosphere ?? '',
    shopType: p.shopType ?? '',
    competitors: p.competitors ?? '',
    phoneNumber: p.phoneNumber ?? '',
    email: p.email ?? '',
    addresses: p.addresses?.length > 0 ? p.addresses : [''],
    instagramHandle: p.instagramHandle ?? '',
    facebookHandle: p.facebookHandle ?? '',
    tikTokHandle: p.tikTokHandle ?? '',
  };
}

function computeIsDirty(draft: DraftState | null, profile: ShopProfileResponse | null): boolean {
  if (!draft || !profile) return false;
  if (draft.newLogoUri !== null) return true;
  const orig = profileToDraft(profile);
  const scalar: (keyof Omit<DraftState, 'newLogoUri' | 'addresses'>)[] = [
    'brandName',
    'slogan',
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'businessDomain',
    'targetAudience',
    'atmosphere',
    'shopType',
    'competitors',
    'phoneNumber',
    'email',
    'instagramHandle',
    'facebookHandle',
    'tikTokHandle',
  ];
  if (scalar.some((k) => draft[k] !== orig[k])) return true;
  return JSON.stringify(draft.addresses) !== JSON.stringify(orig.addresses);
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { email: accountEmail } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<ShopProfileResponse | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openColorKey, setOpenColorKey] = useState<ColorKey | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [])
  );

  async function loadProfile() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const p = await getShopProfile();
      setProfile(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }

  function startEditing() {
    if (!profile) return;
    setDraft(profileToDraft(profile));
    setIsEditing(true);
    setSaveError(null);
  }

  function cancelEditing() {
    setDraft(null);
    setIsEditing(false);
    setSaveError(null);
    setOpenColorKey(null);
  }

  function updateDraft(patch: Partial<DraftState>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateAddress(index: number, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, addresses: prev.addresses.map((a, i) => (i === index ? value : a)) };
    });
  }

  function addAddress() {
    setDraft((prev) => (prev ? { ...prev, addresses: [...prev.addresses, ''] } : prev));
  }

  function removeAddress(index: number) {
    setDraft((prev) =>
      prev ? { ...prev, addresses: prev.addresses.filter((_, i) => i !== index) } : prev
    );
  }

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      updateDraft({ newLogoUri: result.assets[0].uri });
    }
  }

  async function handleSave() {
    if (!draft || !profile) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      let logoBase64 = profile.logoBase64 ?? null;
      if (draft.newLogoUri) {
        logoBase64 = await uploadShopLogo(draft.newLogoUri);
      }
      const cleanAddresses = draft.addresses.filter((a) => a.trim().length > 0);
      const updated = await updateShopProfile({
        brandName: draft.brandName.trim(),
        logoBase64,
        primaryColor: draft.primaryColor || null,
        secondaryColor: draft.secondaryColor || null,
        accentColor: draft.accentColor || null,
        slogan: draft.slogan || null,
        businessDomain: draft.businessDomain,
        targetAudience: draft.targetAudience,
        atmosphere: draft.atmosphere || null,
        shopType: draft.shopType,
        competitors: draft.competitors || null,
        phoneNumber: draft.phoneNumber.trim(),
        email: draft.email.trim(),
        addresses: cleanAddresses,
        instagramHandle: draft.instagramHandle.trim() || null,
        facebookHandle: draft.facebookHandle.trim() || null,
        tikTokHandle: draft.tikTokHandle.trim() || null,
      });
      setProfile(updated);
      setDraft(null);
      setIsEditing(false);
      setOpenColorKey(null);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }

  const logoSource = (() => {
    if (draft?.newLogoUri) return { uri: draft.newLogoUri };
    if (profile?.logoBase64) return { uri: profile.logoBase64 };
    return null;
  })();

  const isDirty = computeIsDirty(draft, profile);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  if (loadError || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{loadError ?? 'Profile not found'}</Text>
        <Pressable onPress={loadProfile} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Inline chip row — rendered below a row in edit mode
  function ChipRow({
    options,
    selected,
    onSelect,
  }: {
    options: { value: string; label: string }[];
    selected: string;
    onSelect: (v: string) => void;
  }) {
    return (
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(active ? '' : opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // A row that shows a label on the left and either a read-only Text or editable TextInput on the right
  function InfoRow({
    label,
    value,
    draftValue,
    onChangeText,
    keyboardType,
    autoCapitalize,
    last,
    leftIcon,
  }: {
    label: string;
    value: string;
    draftValue?: string;
    onChangeText?: (v: string) => void;
    keyboardType?: 'default' | 'phone-pad' | 'email-address';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    last?: boolean;
    leftIcon?: React.ComponentProps<typeof Ionicons>['name'];
  }) {
    return (
      <View style={[styles.infoRow, last && styles.infoRowLast]}>
        {leftIcon ? (
          <View style={styles.infoLabelWithIcon}>
            <Ionicons name={leftIcon} size={13} color={colors.text.muted} />
            <Text style={styles.infoLabel}>{label}</Text>
          </View>
        ) : (
          <Text style={styles.infoLabel}>{label}</Text>
        )}
        {isEditing && draftValue !== undefined && onChangeText ? (
          <TextInput
            style={[styles.infoValue, styles.infoInput]}
            value={draftValue}
            onChangeText={onChangeText}
            keyboardType={keyboardType ?? 'default'}
            autoCapitalize={autoCapitalize ?? 'sentences'}
            placeholderTextColor={colors.text.muted}
            placeholder="—"
          />
        ) : (
          <Text style={styles.infoValue}>{value || '—'}</Text>
        )}
      </View>
    );
  }

  const addresses =
    isEditing && draft ? draft.addresses : profile.addresses?.length > 0 ? profile.addresses : [''];

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Profile Header ── */}
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={isEditing ? pickLogo : undefined}
              style={[styles.logoThumb, isEditing && styles.logoThumbEditable]}
              accessibilityRole={isEditing ? 'button' : 'image'}
              accessibilityLabel={isEditing ? 'Change logo' : 'Shop logo'}
            >
              {logoSource ? (
                <Image source={logoSource} style={styles.logoImage} />
              ) : (
                <Ionicons
                  name={isEditing ? 'camera-outline' : 'storefront-outline'}
                  size={26}
                  color={colors.text.muted}
                />
              )}
              {isEditing && (
                <View style={styles.logoEditBadge}>
                  <Ionicons name="pencil" size={10} color="#fff" />
                </View>
              )}
            </Pressable>

            <View style={styles.headerText}>
              <Text style={styles.brandName} numberOfLines={1}>
                {profile.brandName}
              </Text>
              {accountEmail ? (
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {accountEmail}
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={isEditing ? cancelEditing : startEditing}
            style={[styles.editButton, isEditing && styles.cancelButton]}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'Cancel editing' : 'Edit profile'}
          >
            <Text style={[styles.editButtonText, isEditing && styles.cancelButtonText]}>
              {isEditing ? 'Cancel' : 'Edit'}
            </Text>
          </Pressable>
        </View>

        {/* ── Visual Identity ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visual Identity</Text>

          <InfoRow
            label="Brand Name"
            value={profile.brandName}
            draftValue={draft?.brandName}
            onChangeText={(v) => updateDraft({ brandName: v })}
            autoCapitalize="words"
          />
          <InfoRow
            label="Slogan"
            value={profile.slogan ?? ''}
            draftValue={draft?.slogan}
            onChangeText={(v) => updateDraft({ slogan: v })}
          />

          {/* Colours — always stacked rows; edit mode adds tappable swatch + inline panel */}
          {COLOR_KEYS.map(({ key, label }, i) => {
            const colorValue = isEditing && draft ? draft[key] : profile[key];
            const isLast = i === COLOR_KEYS.length - 1;
            const isPanelOpen = isEditing && openColorKey === key;
            return (
              <React.Fragment key={key}>
                <View style={[styles.infoRow, isLast && !isPanelOpen && styles.infoRowLast]}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  {isEditing && draft ? (
                    <Pressable
                      onPress={() => setOpenColorKey(isPanelOpen ? null : key)}
                      style={styles.colorValueRow}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${label} colour`}
                    >
                      <View
                        style={[styles.colorSwatch, { backgroundColor: colorValue || '#808080' }]}
                      />
                      <Text style={styles.colorHexText}>{colorValue || '—'}</Text>
                      <Ionicons
                        name={isPanelOpen ? 'chevron-up' : 'chevron-down'}
                        size={12}
                        color={colors.text.muted}
                      />
                    </Pressable>
                  ) : colorValue ? (
                    <View style={styles.colorValueRow}>
                      <View style={[styles.colorSwatch, { backgroundColor: colorValue }]} />
                      <Text style={styles.colorHexText}>{colorValue}</Text>
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>—</Text>
                  )}
                </View>
                {isPanelOpen && draft && (
                  <ColorEditPanel value={draft[key]} onChange={(v) => updateDraft({ [key]: v })} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* ── Business DNA ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business DNA</Text>

          <View style={[styles.infoRow, isEditing && styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Domain</Text>
            {(isEditing ? draft?.businessDomain : profile.businessDomain) ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {labelFor(
                    DOMAIN_OPTIONS,
                    (isEditing ? draft?.businessDomain : profile.businessDomain) ?? ''
                  )}
                </Text>
              </View>
            ) : (
              <Text style={styles.infoValue}>—</Text>
            )}
          </View>
          {isEditing && draft && (
            <ChipRow
              options={DOMAIN_OPTIONS}
              selected={draft.businessDomain}
              onSelect={(v) => updateDraft({ businessDomain: v })}
            />
          )}

          <InfoRow
            label="Target Audience"
            value={profile.targetAudience}
            draftValue={draft?.targetAudience}
            onChangeText={(v) => updateDraft({ targetAudience: v })}
          />

          <View style={[styles.infoRow, isEditing && styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Atmosphere</Text>
            {(isEditing ? draft?.atmosphere : profile.atmosphere) ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {labelFor(
                    ATMOSPHERE_OPTIONS,
                    (isEditing ? draft?.atmosphere : profile.atmosphere) ?? ''
                  )}
                </Text>
              </View>
            ) : (
              <Text style={styles.infoValue}>—</Text>
            )}
          </View>
          {isEditing && draft && (
            <ChipRow
              options={ATMOSPHERE_OPTIONS}
              selected={draft.atmosphere}
              onSelect={(v) => updateDraft({ atmosphere: v })}
            />
          )}

          <View style={[styles.infoRow, isEditing && styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Shop Type</Text>
            {(isEditing ? draft?.shopType : profile.shopType) ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {labelFor(
                    SHOP_TYPE_OPTIONS,
                    (isEditing ? draft?.shopType : profile.shopType) ?? ''
                  )}
                </Text>
              </View>
            ) : (
              <Text style={styles.infoValue}>—</Text>
            )}
          </View>
          {isEditing && draft && (
            <ChipRow
              options={SHOP_TYPE_OPTIONS}
              selected={draft.shopType}
              onSelect={(v) => updateDraft({ shopType: v })}
            />
          )}

          <InfoRow
            label="Competitors"
            value={profile.competitors ?? ''}
            draftValue={draft?.competitors}
            onChangeText={(v) => updateDraft({ competitors: v })}
            autoCapitalize="words"
            last
          />
        </View>

        {/* ── Contact & Social ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact & Social</Text>

          <InfoRow
            label="Phone"
            value={profile.phoneNumber ?? ''}
            draftValue={draft?.phoneNumber}
            onChangeText={(v) => updateDraft({ phoneNumber: v })}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <InfoRow
            label="Email"
            value={profile.email ?? ''}
            draftValue={draft?.email}
            onChangeText={(v) => updateDraft({ email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {/* Addresses */}
          {addresses.map((addr, i) => (
            <View key={i} style={[styles.infoRow, isEditing && styles.infoRowEdit]}>
              <Text style={styles.infoLabel}>
                {addresses.length > 1 ? `Address ${i + 1}` : 'Address'}
              </Text>
              {isEditing && draft ? (
                <View style={styles.addressEditRight}>
                  <TextInput
                    style={[styles.infoValue, styles.infoInput, styles.addressEditInput]}
                    value={addr}
                    onChangeText={(v) => updateAddress(i, v)}
                    autoCapitalize="words"
                    placeholder="—"
                    placeholderTextColor={colors.text.muted}
                  />
                  {draft.addresses.length > 1 && (
                    <Pressable
                      onPress={() => removeAddress(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove address ${i + 1}`}
                      style={styles.removeAddr}
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.text.muted} />
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text style={styles.infoValue}>{addr || '—'}</Text>
              )}
            </View>
          ))}

          {isEditing && (
            <Pressable
              onPress={addAddress}
              style={styles.addAddrButton}
              accessibilityRole="button"
              accessibilityLabel="Add another address"
            >
              <Ionicons name="add-circle-outline" size={14} color={colors.accent.primary} />
              <Text style={styles.addAddrText}>Add address</Text>
            </Pressable>
          )}

          <InfoRow
            label="Instagram"
            value={profile.instagramHandle ?? ''}
            draftValue={draft?.instagramHandle}
            onChangeText={(v) => updateDraft({ instagramHandle: v })}
            autoCapitalize="none"
            leftIcon="logo-instagram"
          />
          <InfoRow
            label="Facebook"
            value={profile.facebookHandle ?? ''}
            draftValue={draft?.facebookHandle}
            onChangeText={(v) => updateDraft({ facebookHandle: v })}
            autoCapitalize="none"
            leftIcon="logo-facebook"
          />
          <InfoRow
            label="TikTok"
            value={profile.tikTokHandle ?? ''}
            draftValue={draft?.tikTokHandle}
            onChangeText={(v) => updateDraft({ tikTokHandle: v })}
            autoCapitalize="none"
            leftIcon="logo-tiktok"
            last
          />
        </View>

        {/* ── Save Changes (edit mode only) ── */}
        {isEditing && (
          <>
            {saveError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{saveError}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={handleSave}
              disabled={!isDirty || isSaving}
              style={[styles.saveButton, (!isDirty || isSaving) && styles.saveButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Save changes"
              accessibilityState={{ disabled: !isDirty || isSaving, busy: isSaving }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    (!isDirty || isSaving) && styles.saveButtonTextDisabled,
                  ]}
                >
                  Save Changes
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    content: {
      padding: D.spacing.md,
      paddingBottom: D.spacing['2xl'],
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.base,
      padding: D.spacing.xl,
    },
    // Header
    headerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      padding: D.spacing.md,
      marginBottom: D.spacing.md,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      flex: 1,
    },
    logoThumb: {
      width: 56,
      height: 56,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoThumbEditable: {
      borderColor: colors.accent.primary,
      borderStyle: 'dashed',
    },
    logoImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
    },
    logoEditBadge: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
    },
    brandName: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    accountEmail: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    editButton: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.xs,
      borderRadius: D.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.focus,
    },
    cancelButton: {
      borderColor: colors.border.default,
    },
    editButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    cancelButtonText: {
      color: colors.text.secondary,
    },
    // Sections
    section: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      padding: D.spacing.md,
      marginBottom: D.spacing.md,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    sectionTitle: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: D.spacing.md,
    },
    // Info rows
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    infoRowEdit: {
      alignItems: 'center',
    },
    infoRowLast: {
      borderBottomWidth: 0,
    },
    infoLabelWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    infoLabel: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      flex: 1,
    },
    infoValue: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      flex: 2,
      textAlign: 'right',
    },
    infoInput: {
      borderWidth: 1,
      borderColor: colors.border.focus,
      borderRadius: D.radius.sm,
      paddingHorizontal: D.spacing.xs,
      paddingVertical: 4,
      textAlign: 'left',
    },
    badge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 3,
    },
    badgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    colorSwatch: {
      width: 20,
      height: 20,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    colorValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    colorHexText: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontFamily: 'monospace',
    },
    // Chip row (edit mode)
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
      paddingBottom: D.spacing.sm,
    },
    chip: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    chipActive: {
      backgroundColor: colors.accent.dim,
      borderColor: colors.accent.primary,
    },
    chipText: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    chipTextActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    // Address edit
    addressEditRight: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
    },
    addressEditInput: {
      flex: 1,
    },
    removeAddr: {
      padding: 4,
    },
    addAddrButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: D.spacing.xs,
    },
    addAddrText: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.medium,
    },
    // Save button
    saveButton: {
      height: 52,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
      ...D.shadow.glow,
    },
    saveButtonDisabled: {
      backgroundColor: colors.bg.elevated,
      shadowOpacity: 0,
      elevation: 0,
    },
    saveButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    saveButtonTextDisabled: {
      color: colors.text.muted,
    },
    // Error
    errorBox: {
      backgroundColor: `${colors.destructive}18`,
      borderRadius: D.radius.sm,
      padding: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.error,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: D.spacing.md,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
    },
    retryButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
  });
}
