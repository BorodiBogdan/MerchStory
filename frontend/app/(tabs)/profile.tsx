import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { LogoutModal } from '@/components/ui/LogoutModal';
import { RgbColorPicker } from '@/components/ui/RgbColorPicker';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useShop } from '@/context/shop';
import { useTheme } from '@/context/theme';
import { useI18n } from '@/i18n';
import {
  type AppLanguage,
  BrandColor,
  type Currency,
  disconnectSocial,
  getFacebookConnectUrl,
  getSocialStatus,
  ShopProfileResponse,
  updateAppLanguage,
  updateShopProfile,
} from '@/utils/api';

const DOMAIN_OPTIONS = [
  { value: 'Market', label: 'Market' },
  { value: 'Food', label: 'Food' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Fashion', label: 'Fashion' },
  { value: 'Other', label: 'Other' },
];

const SHOP_TYPE_OPTIONS = [
  { value: 'Luxury', label: 'Luxury' },
  { value: 'MidRange', label: 'Mid-range' },
  { value: 'Budget', label: 'Budget' },
];

const KNOWN_COUNTRY_CODES = ['RO', 'MD', 'HU', 'BG'];

function labelFor(options: { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

type DraftState = {
  brandName: string;
  slogan: string;
  brandColors: BrandColor[];
  newLogoUri: string | null;
  businessDomain: string;
  otherDomain: string;
  targetAudience: string;
  shopType: string;
  competitors: string;
  city: string;
  countryChip: string;
  otherCountry: string;
  phoneNumber: string;
  email: string;
  addresses: string[];
  instagramHandle: string;
  facebookHandle: string;
  tikTokHandle: string;
};

function profileToDraft(p: ShopProfileResponse): DraftState {
  const code = (p.countryCode ?? 'RO').toUpperCase();
  const isKnown = KNOWN_COUNTRY_CODES.includes(code);
  return {
    brandName: p.brandName ?? '',
    slogan: p.slogan ?? '',
    brandColors:
      p.brandColors && p.brandColors.length > 0
        ? [...p.brandColors]
        : [{ hex: '#6366F1', percentage: 100 }],
    newLogoUri: null,
    businessDomain: p.businessDomain ?? '',
    otherDomain: p.otherDomain ?? '',
    targetAudience: p.targetAudience ?? '',
    shopType: p.shopType ?? '',
    competitors: p.competitors ?? '',
    city: p.city ?? '',
    countryChip: isKnown ? code : 'Other',
    otherCountry: isKnown ? '' : code,
    phoneNumber: p.phoneNumber ?? '',
    email: p.email ?? '',
    addresses: p.addresses?.length > 0 ? p.addresses : [''],
    instagramHandle: p.instagramHandle ?? '',
    facebookHandle: p.facebookHandle ?? '',
    tikTokHandle: p.tikTokHandle ?? '',
  };
}

function resolveCountryCode(draft: DraftState, fallback: string): string {
  if (draft.countryChip === 'Other') {
    const code = draft.otherCountry.trim().toUpperCase().slice(0, 2);
    return code.length === 2 ? code : fallback;
  }
  return draft.countryChip || fallback;
}

function computeIsDirty(draft: DraftState | null, profile: ShopProfileResponse | null): boolean {
  if (!draft || !profile) return false;
  if (draft.newLogoUri !== null) return true;
  const orig = profileToDraft(profile);
  const scalar: (keyof Omit<DraftState, 'newLogoUri' | 'addresses' | 'brandColors'>)[] = [
    'brandName',
    'slogan',
    'businessDomain',
    'otherDomain',
    'targetAudience',
    'shopType',
    'competitors',
    'city',
    'phoneNumber',
    'email',
    'instagramHandle',
    'facebookHandle',
    'tikTokHandle',
  ];
  if (scalar.some((k) => draft[k] !== orig[k])) return true;
  if (
    resolveCountryCode(draft, profile.countryCode) !== resolveCountryCode(orig, profile.countryCode)
  )
    return true;
  if (JSON.stringify(draft.brandColors) !== JSON.stringify(orig.brandColors)) return true;
  return JSON.stringify(draft.addresses) !== JSON.stringify(orig.addresses);
}

export default function ProfileScreen() {
  const { colors, colorScheme, toggleTheme } = useTheme();
  const { email: accountEmail, signOut } = useAuth();
  const { profile, setProfile, isProfileLoading, refreshProfile } = useShop();
  const { language: appLanguage, setLanguage: setAppLanguage, t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 900;
  const isTablet = screenWidth >= 600;

  async function handleAppLanguageChange(next: AppLanguage) {
    if (next === appLanguage) return;
    await setAppLanguage(next);
    try {
      await updateAppLanguage(next);
    } catch {
      // non-critical: local preference is already saved
    }
  }

  async function handlePreferenceSave(patch: {
    currency?: Currency;
    generationLanguage?: AppLanguage;
  }) {
    if (!profile) return;
    try {
      const updated = await updateShopProfile({
        brandName: profile.brandName,
        logoBase64: profile.logoBase64 ?? null,
        brandColors: profile.brandColors,
        slogan: profile.slogan ?? null,
        businessDomain: profile.businessDomain,
        otherDomain: profile.otherDomain ?? null,
        targetAudience: profile.targetAudience ?? null,
        shopType: profile.shopType ?? null,
        competitors: profile.competitors ?? null,
        city: profile.city ?? null,
        countryCode: profile.countryCode,
        phoneNumber: profile.phoneNumber,
        email: profile.email,
        addresses: profile.addresses ?? [],
        instagramHandle: profile.instagramHandle ?? null,
        facebookHandle: profile.facebookHandle ?? null,
        tikTokHandle: profile.tikTokHandle ?? null,
        currency: patch.currency ?? profile.currency,
        generationLanguage: patch.generationLanguage ?? profile.generationLanguage,
      });
      setProfile(updated);
    } catch {
      // ignore; user can retry
    }
  }
  const styles = useMemo(() => makeStyles(colors, isWide, isTablet), [colors, isWide, isTablet]);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isProfileLoading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [colorPickerModal, setColorPickerModal] = useState<{ index: number; hex: string } | null>(
    null
  );
  const [socialStatus, setSocialStatus] = useState<{ facebook?: string }>({});
  const [isLogoutVisible, setIsLogoutVisible] = useState(false);

  // Entrance animation
  const enterOpacity = useSharedValue(0);
  const enterTranslate = useSharedValue(12);
  useEffect(() => {
    enterOpacity.value = withTiming(1, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
    });
    enterTranslate.value = withTiming(0, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [enterOpacity, enterTranslate]);

  const heroAnimStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterTranslate.value }],
  }));

  const gridOpacity = useSharedValue(0);
  const gridTranslate = useSharedValue(16);
  useEffect(() => {
    gridOpacity.value = withDelay(120, withTiming(1, { duration: 450 }));
    gridTranslate.value = withDelay(120, withTiming(0, { duration: 500 }));
  }, [gridOpacity, gridTranslate]);

  const gridAnimStyle = useAnimatedStyle(() => ({
    opacity: gridOpacity.value,
    transform: [{ translateY: gridTranslate.value }],
  }));

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type?: string; url?: string };
      if (data?.type !== 'social-callback' || !data.url) return;
      if (data.url.includes('status=linked')) {
        if (data.url.includes('provider=facebook'))
          setSocialStatus((s) => ({ ...s, facebook: 'connected' }));
      } else {
        if (data.url.includes('provider=facebook'))
          setSocialStatus((s) => ({ ...s, facebook: 'error' }));
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    setIsLoading(isProfileLoading);
  }, [isProfileLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadSocialStatus();
    }, [])
  );

  async function loadSocialStatus() {
    try {
      const social = await getSocialStatus();
      setSocialStatus({
        facebook: social.facebookConnected ? 'connected' : undefined,
      });
    } catch {
      // non-fatal
    }
  }

  async function retryLoadProfile() {
    setLoadError(null);
    try {
      await refreshProfile();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load profile');
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
  }

  function updateDraft(patch: Partial<DraftState>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function addBrandColor() {
    setDraft((prev) =>
      prev
        ? { ...prev, brandColors: [...prev.brandColors, { hex: '#6366F1', percentage: 0 }] }
        : prev
    );
  }

  function removeBrandColor(index: number) {
    setDraft((prev) =>
      prev ? { ...prev, brandColors: prev.brandColors.filter((_, i) => i !== index) } : prev
    );
  }

  function updateBrandColor(index: number, patch: Partial<BrandColor>) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            brandColors: prev.brandColors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
          }
        : prev
    );
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

  async function connectFacebook() {
    try {
      setSocialStatus((s) => ({ ...s, facebook: 'connecting' }));
      const url = await getFacebookConnectUrl();
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'width=600,height=700');
      } else {
        const callbackBase = process.env.EXPO_PUBLIC_FRONTEND_URL ?? 'http://localhost:8081';
        const result = await WebBrowser.openAuthSessionAsync(
          url,
          `${callbackBase}/social-callback`
        );
        if (result.type === 'success' && result.url.includes('status=linked')) {
          setSocialStatus((s) => ({ ...s, facebook: 'connected' }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (result.type === 'dismiss') {
          setSocialStatus((s) => ({ ...s, facebook: undefined }));
        } else {
          setSocialStatus((s) => ({ ...s, facebook: 'error' }));
        }
      }
    } catch {
      setSocialStatus((s) => ({ ...s, facebook: 'error' }));
    }
  }

  async function handleDisconnect(provider: 'facebook') {
    try {
      await disconnectSocial(provider);
      setSocialStatus((s) => ({ ...s, [provider]: undefined }));
    } catch {
      // silent — status stays as-is
    }
  }

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const dataUri = asset.base64
        ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;
      updateDraft({ newLogoUri: dataUri });
    }
  }

  async function handleSave() {
    if (!draft || !profile) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      let logoBase64 = profile.logoBase64 ?? null;
      if (draft.newLogoUri) {
        logoBase64 = draft.newLogoUri;
      }
      const cleanAddresses = draft.addresses.filter((a) => a.trim().length > 0);
      const updated = await updateShopProfile({
        brandName: draft.brandName.trim(),
        logoBase64,
        brandColors: draft.brandColors,
        slogan: draft.slogan || null,
        businessDomain: draft.businessDomain,
        otherDomain: draft.otherDomain || null,
        targetAudience: draft.targetAudience || null,
        shopType: draft.shopType || null,
        competitors: draft.competitors || null,
        city: draft.city.trim() || null,
        countryCode: resolveCountryCode(draft, profile.countryCode),
        phoneNumber: draft.phoneNumber.trim(),
        email: draft.email.trim(),
        addresses: cleanAddresses,
        instagramHandle: draft.instagramHandle.trim() || null,
        facebookHandle: draft.facebookHandle.trim() || null,
        tikTokHandle: draft.tikTokHandle.trim() || null,
        currency: profile.currency,
        generationLanguage: profile.generationLanguage,
      });
      setProfile(updated);
      setDraft(null);
      setIsEditing(false);
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
  const draftTotalPct = draft?.brandColors.reduce((s, c) => s + c.percentage, 0) ?? 0;

  // ── Inline primitives (memoized so TextInput refs stay stable across renders) ─
  const ui = useMemo(() => {
    const Section = ({
      icon,
      title,
      children,
    }: {
      icon: React.ComponentProps<typeof Ionicons>['name'];
      title: string;
      children: React.ReactNode;
    }) => (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconBadge}>
            <Ionicons name={icon} size={16} color={colors.accent.primary} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionBody}>{children}</View>
      </View>
    );

    function SegmentedImpl<T extends string>({
      options,
      value,
      onChange,
    }: {
      options: { value: T; label: string }[];
      value: T;
      onChange: (v: T) => void;
    }) {
      return (
        <View style={styles.segmented}>
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange(opt.value)}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    const ChipRow = ({
      options,
      selected,
      onSelect,
      deselectable = true,
    }: {
      options: { value: string; label: string }[];
      selected: string;
      onSelect: (v: string) => void;
      deselectable?: boolean;
    }) => (
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(active && deselectable ? '' : opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );

    const InfoRow = ({
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
    }) => (
      <View style={[styles.infoRow, last && styles.infoRowLast]}>
        {leftIcon ? (
          <View style={styles.infoLabelWithIcon}>
            <Ionicons name={leftIcon} size={14} color={colors.text.muted} />
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
          <Text style={styles.infoValue} numberOfLines={2}>
            {value || '—'}
          </Text>
        )}
      </View>
    );

    const BrandColorBar = ({ colors: palette }: { colors: BrandColor[] }) => {
      const safe = palette.filter((c) => c.percentage > 0);
      if (safe.length === 0) return null;
      return (
        <View style={styles.colorBarOuter}>
          <View style={styles.colorBar}>
            {safe.map((c, i) => (
              <View key={`${c.hex}-${i}`} style={{ flex: c.percentage, backgroundColor: c.hex }} />
            ))}
          </View>
        </View>
      );
    };

    return { Section, Segmented: SegmentedImpl, ChipRow, InfoRow, BrandColorBar };
  }, [styles, colors, isEditing]);

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
        <Text style={styles.errorText}>{loadError ?? t('profile.notFound')}</Text>
        <Pressable onPress={retryLoadProfile} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { Section, Segmented, ChipRow, InfoRow, BrandColorBar } = ui;

  const addresses =
    isEditing && draft ? draft.addresses : profile.addresses?.length > 0 ? profile.addresses : [''];

  const displayColors = isEditing && draft ? draft.brandColors : (profile.brandColors ?? []);

  // ── Section renderers ───────────────────────────────────────────────────────

  const preferencesSection = (
    <Section icon="options-outline" title={t('preferences')}>
      <View style={[styles.infoRow]}>
        <Text style={styles.infoLabel}>{t('appLanguage')}</Text>
        <Segmented<AppLanguage>
          options={[
            { value: 'EN', label: t('english') },
            { value: 'RO', label: t('romanian') },
          ]}
          value={appLanguage}
          onChange={(code) => void handleAppLanguageChange(code)}
        />
      </View>

      <View style={[styles.infoRow]}>
        <Text style={styles.infoLabel}>{t('generationLanguage')}</Text>
        <Segmented<AppLanguage>
          options={[
            { value: 'EN', label: t('english') },
            { value: 'RO', label: t('romanian') },
          ]}
          value={profile.generationLanguage}
          onChange={(code) => void handlePreferenceSave({ generationLanguage: code })}
        />
      </View>

      <View style={[styles.infoRow]}>
        <Text style={styles.infoLabel}>{t('defaultCurrency')}</Text>
        <Segmented<Currency>
          options={[
            { value: 'USD', label: 'USD' },
            { value: 'EUR', label: 'EUR' },
            { value: 'RON', label: 'RON' },
          ]}
          value={profile.currency}
          onChange={(code) => void handlePreferenceSave({ currency: code })}
        />
      </View>

      <View style={[styles.infoRow, styles.infoRowLast]}>
        <Text style={styles.infoLabel}>{t('appearance')}</Text>
        <Segmented<'light' | 'dark'>
          options={[
            { value: 'light', label: t('appearanceLight') },
            { value: 'dark', label: t('appearanceDark') },
          ]}
          value={colorScheme}
          onChange={(next) => {
            if (next !== colorScheme) toggleTheme();
          }}
        />
      </View>
    </Section>
  );

  const visualIdentitySection = (
    <Section icon="color-palette-outline" title={t('profile.sectionVisual')}>
      <InfoRow
        label={t('profile.fieldBrandName')}
        value={profile.brandName}
        draftValue={draft?.brandName}
        onChangeText={(v) => updateDraft({ brandName: v })}
        autoCapitalize="words"
      />
      <InfoRow
        label={t('profile.fieldSlogan')}
        value={profile.slogan ?? ''}
        draftValue={draft?.slogan}
        onChangeText={(v) => updateDraft({ slogan: v })}
      />

      {!isEditing && (
        <View style={[styles.brandColorsView, styles.infoRowLast]}>
          <Text style={[styles.infoLabel, styles.brandColorsLabel]}>
            {t('profile.fieldBrandColors')}
          </Text>
          <BrandColorBar colors={displayColors} />
          <View style={styles.colorChipGrid}>
            {displayColors.map((c, i) => (
              <View key={i} style={styles.colorChipPill}>
                <View style={[styles.colorChipDot, { backgroundColor: c.hex }]} />
                <Text style={styles.colorChipHex}>{c.hex.toUpperCase()}</Text>
                <Text style={styles.colorChipPct}>{c.percentage}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {isEditing && draft && (
        <View style={styles.brandColorsEditSection}>
          {draft.brandColors.map((color, index) => (
            <View
              key={index}
              style={[styles.infoRow, index === draft.brandColors.length - 1 && styles.infoRowLast]}
            >
              <Pressable
                onPress={() => setColorPickerModal({ index, hex: color.hex })}
                style={styles.colorSwatchBtn}
                accessibilityRole="button"
                accessibilityLabel={`Pick color ${index + 1}`}
              >
                <View style={[styles.colorSwatchEdit, { backgroundColor: color.hex }]} />
                <Text style={styles.colorHexEdit}>{color.hex.toUpperCase()}</Text>
              </Pressable>
              <View style={styles.colorPctRow}>
                <TextInput
                  style={[styles.infoInput, styles.colorPctInput]}
                  value={String(color.percentage)}
                  onChangeText={(v: string) => {
                    const n = parseInt(v, 10);
                    updateBrandColor(index, {
                      percentage: isNaN(n) ? 0 : Math.min(100, Math.max(0, n)),
                    });
                  }}
                  keyboardType="numeric"
                  accessibilityLabel={`Percentage for color ${index + 1}`}
                />
                <Text style={styles.pctSymbol}>%</Text>
              </View>
              {draft.brandColors.length > 1 && (
                <Pressable
                  onPress={() => removeBrandColor(index)}
                  style={styles.removeColorButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove color ${index + 1}`}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.text.muted} />
                </Pressable>
              )}
            </View>
          ))}

          <View style={styles.colorFooterRow}>
            <Text
              style={[styles.totalIndicator, draftTotalPct !== 100 && styles.totalIndicatorError]}
            >
              Total: {draftTotalPct}% / 100%
            </Text>
            {draft.brandColors.length < 5 && (
              <Pressable
                onPress={addBrandColor}
                style={styles.addColorButton}
                accessibilityRole="button"
                accessibilityLabel="Add a brand color"
              >
                <Ionicons name="add-circle-outline" size={14} color={colors.accent.primary} />
                <Text style={styles.addColorText}>Add color</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Section>
  );

  const businessSection = (
    <Section icon="business-outline" title={t('profile.sectionBusiness')}>
      <View style={[styles.infoRow, isEditing && styles.infoRowLast]}>
        <Text style={styles.infoLabel}>{t('profile.fieldDomain')}</Text>
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
        <>
          <ChipRow
            options={DOMAIN_OPTIONS}
            selected={draft.businessDomain}
            onSelect={(v) => updateDraft({ businessDomain: v })}
          />
          {draft.businessDomain === 'Other' && (
            <TextInput
              style={[styles.infoValue, styles.infoInput, styles.otherDomainInput]}
              value={draft.otherDomain}
              onChangeText={(v) => updateDraft({ otherDomain: v })}
              placeholder="Please specify"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="sentences"
              accessibilityLabel="Specify domain"
            />
          )}
        </>
      )}

      {!isEditing && profile.businessDomain === 'Other' && profile.otherDomain && (
        <InfoRow
          label={`${t('profile.fieldDomain')} (${t('setup.step2.domainOther')})`}
          value={profile.otherDomain}
        />
      )}

      <View style={[styles.infoRow, isEditing && styles.infoRowLast]}>
        <Text style={styles.infoLabel}>{t('profile.fieldShopType')}</Text>
        {(isEditing ? draft?.shopType : profile.shopType) ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {labelFor(SHOP_TYPE_OPTIONS, (isEditing ? draft?.shopType : profile.shopType) ?? '')}
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
        label={t('profile.fieldAudience')}
        value={profile.targetAudience ?? ''}
        draftValue={draft?.targetAudience}
        onChangeText={(v) => updateDraft({ targetAudience: v })}
      />

      <InfoRow
        label={t('profile.fieldCompetitors')}
        value={profile.competitors ?? ''}
        draftValue={draft?.competitors}
        onChangeText={(v) => updateDraft({ competitors: v })}
        autoCapitalize="words"
        last
      />
    </Section>
  );

  const COUNTRY_OPTIONS = [
    { value: 'RO', label: t('setup.step2.countryRO') },
    { value: 'MD', label: t('setup.step2.countryMD') },
    { value: 'HU', label: t('setup.step2.countryHU') },
    { value: 'BG', label: t('setup.step2.countryBG') },
    { value: 'Other', label: t('setup.step2.countryOther') },
  ];

  const displayedCountryCode =
    isEditing && draft ? resolveCountryCode(draft, profile.countryCode) : profile.countryCode;
  const displayedCountryLabel = KNOWN_COUNTRY_CODES.includes(displayedCountryCode)
    ? labelFor(COUNTRY_OPTIONS, displayedCountryCode)
    : displayedCountryCode;

  const locationSection = (
    <Section icon="globe-outline" title={t('profile.sectionLocation')}>
      <InfoRow
        label={t('profile.fieldCity')}
        value={profile.city ?? ''}
        draftValue={draft?.city}
        onChangeText={(v) => updateDraft({ city: v })}
        autoCapitalize="words"
        leftIcon="location-outline"
      />

      <View style={[styles.infoRow, isEditing && styles.infoRowLast]}>
        <Text style={styles.infoLabel}>{t('profile.fieldCountry')}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{displayedCountryLabel || '—'}</Text>
        </View>
      </View>
      {isEditing && draft && (
        <>
          <ChipRow
            options={COUNTRY_OPTIONS}
            selected={draft.countryChip}
            onSelect={(v) => updateDraft({ countryChip: v })}
            deselectable={false}
          />
          {draft.countryChip === 'Other' && (
            <TextInput
              style={[styles.infoValue, styles.infoInput, styles.otherDomainInput]}
              value={draft.otherCountry}
              onChangeText={(v) => updateDraft({ otherCountry: v.toUpperCase().slice(0, 2) })}
              placeholder={t('setup.step2.otherCountry')}
              placeholderTextColor={colors.text.muted}
              autoCapitalize="characters"
              accessibilityLabel={t('setup.step2.otherCountry')}
            />
          )}
        </>
      )}
    </Section>
  );

  const contactSection = (
    <Section icon="call-outline" title={t('profile.sectionContact')}>
      <InfoRow
        label="Phone"
        value={profile.phoneNumber ?? ''}
        draftValue={draft?.phoneNumber}
        onChangeText={(v) => updateDraft({ phoneNumber: v })}
        keyboardType="phone-pad"
        autoCapitalize="none"
        leftIcon="call-outline"
      />
      <InfoRow
        label="Email"
        value={profile.email ?? ''}
        draftValue={draft?.email}
        onChangeText={(v) => updateDraft({ email: v })}
        keyboardType="email-address"
        autoCapitalize="none"
        leftIcon="mail-outline"
      />

      {addresses.map((addr, i) => (
        <View key={i} style={[styles.infoRow, isEditing && styles.infoRowEdit]}>
          <View style={styles.infoLabelWithIcon}>
            <Ionicons name="location-outline" size={14} color={colors.text.muted} />
            <Text style={styles.infoLabel}>
              {addresses.length > 1 ? `Address ${i + 1}` : 'Address'}
            </Text>
          </View>
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
    </Section>
  );

  const connectedAccountsSection = !isEditing ? (
    <Section icon="link-outline" title={t('profile.sectionConnected')}>
      <View style={styles.socialConnectRow}>
        <View style={styles.socialConnectLeft}>
          <View style={[styles.socialIconCircle, { backgroundColor: '#1877F215' }]}>
            <Ionicons name="logo-facebook" size={22} color="#1877F2" />
          </View>
          <View>
            <Text style={styles.socialConnectLabel}>Facebook</Text>
            <Text style={styles.socialConnectSubtle}>
              {socialStatus.facebook === 'connected'
                ? t('profile.connected')
                : 'Publish posts to your page'}
            </Text>
          </View>
        </View>
        {socialStatus.facebook === 'connected' ? (
          <Pressable
            onPress={() => void handleDisconnect('facebook')}
            style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('profile.disconnect')}
          >
            <Text style={styles.disconnectBtnText}>{t('profile.disconnect')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={connectFacebook}
            disabled={socialStatus.facebook === 'connecting'}
            style={({ pressed }) => [
              styles.connectBtn,
              pressed && { opacity: 0.85 },
              socialStatus.facebook === 'connecting' && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.connectBtnText}>
              {socialStatus.facebook === 'connecting'
                ? t('profile.connecting')
                : socialStatus.facebook === 'error'
                  ? t('profile.connectError')
                  : t('profile.connect')}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.socialConnectRow, styles.infoRowLast]}>
        <View style={styles.socialConnectLeft}>
          <View style={[styles.socialIconCircle, { backgroundColor: '#E4405F15' }]}>
            <Ionicons name="logo-instagram" size={22} color="#E4405F" />
          </View>
          <View>
            <Text style={styles.socialConnectLabel}>Instagram</Text>
            <Text style={styles.socialConnectSubtle}>Coming soon</Text>
          </View>
        </View>
        <View style={styles.comingSoonPill}>
          <Text style={styles.comingSoonText}>In progress</Text>
        </View>
      </View>
    </Section>
  ) : null;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageInner}>
          {/* ── Hero ── */}
          <Animated.View style={[styles.heroWrap, heroAnimStyle]}>
            <View style={styles.heroCard}>
              <View style={styles.heroGlow} pointerEvents="none" />
              <View style={styles.heroContent}>
                <Pressable
                  onPress={isEditing ? pickLogo : undefined}
                  style={[styles.heroLogo, isEditing && styles.heroLogoEditable]}
                  accessibilityRole={isEditing ? 'button' : 'image'}
                  accessibilityLabel={isEditing ? 'Change logo' : 'Shop logo'}
                >
                  {logoSource ? (
                    <Image source={logoSource} style={styles.heroLogoImage} />
                  ) : (
                    <Ionicons
                      name={isEditing ? 'camera-outline' : 'storefront-outline'}
                      size={isWide ? 40 : 34}
                      color={colors.accent.primary}
                    />
                  )}
                  {isEditing && (
                    <View style={styles.heroLogoBadge}>
                      <Ionicons name="pencil" size={12} color="#fff" />
                    </View>
                  )}
                </Pressable>

                <View style={styles.heroText}>
                  <Text style={styles.heroBrandName} numberOfLines={1}>
                    {profile.brandName}
                  </Text>
                  {profile.slogan ? (
                    <Text style={styles.heroSlogan} numberOfLines={2}>
                      “{profile.slogan}”
                    </Text>
                  ) : null}
                  {accountEmail ? (
                    <View style={styles.heroEmailChip}>
                      <Ionicons name="mail-outline" size={12} color={colors.text.muted} />
                      <Text style={styles.heroEmail} numberOfLines={1}>
                        {accountEmail}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.heroActions}>
                  <Pressable
                    onPress={isEditing ? cancelEditing : startEditing}
                    style={({ pressed }) => [
                      styles.editButton,
                      isEditing && styles.cancelButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={isEditing ? t('common.cancel') : t('profile.edit')}
                  >
                    <Ionicons
                      name={isEditing ? 'close' : 'create-outline'}
                      size={15}
                      color={isEditing ? colors.text.secondary : '#FFFFFF'}
                    />
                    <Text style={[styles.editButtonText, isEditing && styles.cancelButtonText]}>
                      {isEditing ? t('common.cancel') : t('profile.edit')}
                    </Text>
                  </Pressable>

                  {!isEditing && (
                    <Pressable
                      onPress={() => setIsLogoutVisible(true)}
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                        styles.signOutButton,
                        hovered && styles.signOutButtonHover,
                        pressed && styles.signOutButtonPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.signOut')}
                    >
                      <Ionicons name="log-out-outline" size={14} color={colors.text.error} />
                      <Text style={styles.signOutButtonText}>{t('common.signOut')}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ── Sections grid ── */}
          <Animated.View style={gridAnimStyle}>
            {isWide ? (
              <View style={styles.grid}>
                <View style={styles.column}>
                  {preferencesSection}
                  {visualIdentitySection}
                  {locationSection}
                </View>
                <View style={styles.column}>
                  {businessSection}
                  {contactSection}
                </View>
              </View>
            ) : (
              <>
                {preferencesSection}
                {visualIdentitySection}
                {businessSection}
                {locationSection}
                {contactSection}
              </>
            )}

            {connectedAccountsSection}

            {/* ── Save bar (edit mode only) ── */}
            {isEditing && (
              <View style={styles.saveBar}>
                {saveError ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color={colors.text.error} />
                    <Text style={styles.errorText}>{saveError}</Text>
                  </View>
                ) : null}
                <View style={styles.saveButtonRow}>
                  <Pressable
                    onPress={cancelEditing}
                    style={({ pressed }) => [styles.saveSecondary, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.saveSecondaryText}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={!isDirty || isSaving}
                    style={({ pressed }) => [
                      styles.saveButton,
                      (!isDirty || isSaving) && styles.saveButtonDisabled,
                      pressed && isDirty && !isSaving && { opacity: 0.92 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.save')}
                    accessibilityState={{ disabled: !isDirty || isSaving, busy: isSaving }}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark"
                          size={17}
                          color={!isDirty ? colors.text.muted : '#FFFFFF'}
                        />
                        <Text
                          style={[
                            styles.saveButtonText,
                            (!isDirty || isSaving) && styles.saveButtonTextDisabled,
                          ]}
                        >
                          {t('profile.save')}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      {/* Color picker modal */}
      <Modal
        visible={colorPickerModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setColorPickerModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setColorPickerModal(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {colorPickerModal !== null && (
              <RgbColorPicker
                label={`Color ${colorPickerModal.index + 1}`}
                value={colorPickerModal.hex}
                onChange={(hex) => {
                  updateBrandColor(colorPickerModal.index, { hex });
                  setColorPickerModal((prev) => (prev ? { ...prev, hex } : null));
                }}
              />
            )}
            <Pressable
              style={styles.modalDoneButton}
              onPress={() => setColorPickerModal(null)}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <LogoutModal
        visible={isLogoutVisible}
        onConfirm={() => {
          setIsLogoutVisible(false);
          void signOut();
        }}
        onDismiss={() => setIsLogoutVisible(false)}
      />
    </>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isWide: boolean,
  isTablet: boolean
) {
  const maxWidth = 1120;
  const pagePadding = isWide ? D.spacing.xl : isTablet ? D.spacing.lg : D.spacing.md;

  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    content: {
      paddingHorizontal: pagePadding,
      paddingTop: isWide ? D.spacing.xl : D.spacing.md,
      paddingBottom: D.spacing['2xl'],
      alignItems: 'center',
    },
    pageInner: {
      width: '100%',
      maxWidth,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.base,
      padding: D.spacing.xl,
    },

    // ── Hero ───────────────────────────────────────────────────────────────
    heroWrap: {
      marginBottom: isWide ? D.spacing.xl : D.spacing.lg,
    },
    heroCard: {
      position: 'relative',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? { boxShadow: `0 16px 40px -20px ${colors.accent.primary}33` }
        : D.shadow.sm),
    } as any,
    heroGlow: {
      position: 'absolute',
      top: -80,
      right: -80,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: colors.accent.dim,
      opacity: 0.8,
    },
    heroContent: {
      flexDirection: isTablet ? 'row' : 'column',
      alignItems: isTablet ? 'center' : 'flex-start',
      gap: isWide ? D.spacing.lg : D.spacing.md,
      padding: isWide ? D.spacing.xl : D.spacing.lg,
    },
    heroLogo: {
      width: isWide ? 112 : 88,
      height: isWide ? 112 : 88,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      borderWidth: 2,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
      ...(Platform.OS === 'web' ? { boxShadow: `0 8px 20px -8px ${colors.accent.primary}40` } : {}),
    } as any,
    heroLogoEditable: {
      borderColor: colors.accent.primary,
      borderStyle: 'dashed',
    },
    heroLogoImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
    },
    heroLogoBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg.surface,
    },
    heroText: {
      flex: 1,
      minWidth: 0,
    },
    heroBrandName: {
      fontSize: isWide ? D.fontSize['3xl'] : D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
      lineHeight: isWide ? 40 : 34,
    },
    heroSlogan: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      fontStyle: 'italic',
      marginTop: 6,
      lineHeight: 22,
    },
    heroEmailChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: D.spacing.sm,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    heroEmail: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
    },
    heroActions: {
      alignSelf: isTablet ? 'center' : 'flex-start',
      marginTop: isTablet ? 0 : D.spacing.xs,
      flexShrink: 0,
      gap: D.spacing.sm,
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      minWidth: 160,
      flexShrink: 0,
      flexGrow: 0,
      alignSelf: 'stretch',
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
      ...(Platform.OS === 'web' ? { boxShadow: `0 6px 18px -8px ${colors.accent.primary}80` } : {}),
    } as any,
    cancelButton: {
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    editButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      letterSpacing: 0.2,
      flexShrink: 0,
    },
    cancelButtonText: {
      color: colors.text.secondary,
    },

    // ── Grid ───────────────────────────────────────────────────────────────
    grid: {
      flexDirection: 'row',
      gap: D.spacing.lg,
      alignItems: 'flex-start',
    },
    column: {
      flex: 1,
      minWidth: 0,
    },

    // ── Section ────────────────────────────────────────────────────────────
    section: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      padding: isWide ? D.spacing.lg : D.spacing.md,
      marginBottom: isWide ? D.spacing.lg : D.spacing.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      ...(Platform.OS === 'web' ? { boxShadow: `0 2px 10px -4px ${colors.border.default}` } : {}),
    } as any,
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    sectionIconBadge: {
      width: 32,
      height: 32,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    sectionBody: {
      // rows are inside
    },

    // ── Info rows ─────────────────────────────────────────────────────────
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: D.spacing.sm,
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
      gap: 6,
      flex: 1,
    },
    infoLabel: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      flex: 1,
      fontWeight: D.fontWeight.medium,
    },
    infoValue: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      flex: 2,
      textAlign: 'right',
      fontWeight: D.fontWeight.medium,
    },
    infoInput: {
      borderWidth: 1,
      borderColor: colors.border.focus,
      borderRadius: D.radius.sm,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 6,
      textAlign: 'left',
      backgroundColor: colors.bg.input,
    },

    // ── Badge (domain/shop type) ─────────────────────────────────────────
    badge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.accent.primary + '40',
    },
    badgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
      letterSpacing: 0.3,
    },

    // ── Brand colors (view) ──────────────────────────────────────────────
    brandColorsView: {
      paddingVertical: D.spacing.sm + 2,
    },
    brandColorsLabel: {
      flex: undefined,
      marginBottom: D.spacing.sm,
    },
    colorBarOuter: {
      width: '100%',
      marginBottom: D.spacing.sm,
    },
    colorBar: {
      flexDirection: 'row',
      height: 14,
      borderRadius: D.radius.pill,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    colorChipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
    },
    colorChipPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    colorChipDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    colorChipHex: {
      fontSize: D.fontSize.xs,
      color: colors.text.primary,
      fontFamily: Platform.select({ web: 'monospace', default: 'monospace' }),
      fontWeight: D.fontWeight.medium,
    },
    colorChipPct: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
    },

    // ── Brand colors (edit) ──────────────────────────────────────────────
    brandColorsEditSection: {
      paddingTop: 0,
    },
    colorSwatchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      flex: 1,
    },
    colorSwatchEdit: {
      width: 26,
      height: 26,
      borderRadius: D.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    colorHexEdit: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontFamily: Platform.select({ web: 'monospace', default: 'monospace' }),
      fontWeight: D.fontWeight.medium,
    },
    colorPctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    colorPctInput: {
      width: 44,
      textAlign: 'center',
      paddingHorizontal: 4,
    },
    pctSymbol: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    removeColorButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: D.spacing.sm,
    },
    totalIndicator: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontWeight: D.fontWeight.medium,
    },
    totalIndicatorError: {
      color: colors.text.error,
    },
    addColorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: D.spacing.xs,
      paddingHorizontal: D.spacing.sm,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
    },
    addColorText: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },

    // ── Color picker modal ───────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      padding: D.spacing.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      ...(Platform.OS === 'web'
        ? { boxShadow: '0 20px 48px -20px rgba(0,0,0,0.45)' }
        : D.shadow.modal),
    } as any,
    modalDoneButton: {
      marginTop: D.spacing.sm,
      height: 44,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalDoneText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
    },

    // ── Other domain ─────────────────────────────────────────────────────
    otherDomainInput: {
      flex: undefined,
      textAlign: 'left',
      marginBottom: D.spacing.sm,
    },

    // ── Chip row (edit) ──────────────────────────────────────────────────
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
      paddingBottom: D.spacing.sm,
    },
    chip: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: 6,
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
      color: colors.text.secondary,
      fontWeight: D.fontWeight.medium,
    },
    chipTextActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },

    // ── Segmented control ────────────────────────────────────────────────
    segmented: {
      flexDirection: 'row',
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: 3,
      gap: 2,
    },
    segmentItem: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      minWidth: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentItemBorder: {
      // no-op; gap handled by container
    },
    segmentItemActive: {
      backgroundColor: colors.accent.primary,
      ...(Platform.OS === 'web' ? { boxShadow: `0 2px 8px -2px ${colors.accent.primary}66` } : {}),
    } as any,
    segmentText: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontWeight: D.fontWeight.semibold,
      letterSpacing: 0.3,
    },
    segmentTextActive: {
      color: '#FFFFFF',
    },

    // ── Address edit ─────────────────────────────────────────────────────
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
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: D.spacing.xs,
      paddingHorizontal: D.spacing.sm,
      marginTop: D.spacing.xs,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
    },
    addAddrText: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },

    // ── Save bar ─────────────────────────────────────────────────────────
    saveBar: {
      marginTop: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.md,
      gap: D.spacing.sm,
      ...(Platform.OS === 'web'
        ? { boxShadow: `0 -4px 20px -10px ${colors.accent.primary}30` }
        : D.shadow.sm),
    } as any,
    saveButtonRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    saveSecondary: {
      flex: isWide ? 0 : 1,
      height: 48,
      paddingHorizontal: D.spacing.xl,
      minWidth: 140,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    saveSecondaryText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      ...D.shadow.glow,
    },
    saveButtonDisabled: {
      backgroundColor: colors.bg.elevated,
      shadowOpacity: 0,
      elevation: 0,
      borderWidth: 1,
      borderColor: colors.border.default,
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

    // ── Error ────────────────────────────────────────────────────────────
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      backgroundColor: `${colors.destructive}18`,
      borderLeftWidth: 3,
      borderLeftColor: colors.destructive,
      borderRadius: D.radius.sm,
      padding: D.spacing.sm,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.error,
      flex: 1,
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

    // ── Connected accounts ───────────────────────────────────────────────
    socialConnectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: D.spacing.sm,
    },
    socialConnectLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      flex: 1,
      minWidth: 0,
    },
    socialIconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    socialConnectLabel: {
      fontSize: D.fontSize.base,
      color: colors.text.primary,
      fontWeight: D.fontWeight.semibold,
    },
    socialConnectSubtle: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    connectBtn: {
      paddingHorizontal: D.spacing.md,
      paddingVertical: 8,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
    },
    connectBtnText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    disconnectBtn: {
      paddingVertical: 6,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.error,
      backgroundColor: `${colors.destructive}12`,
    },
    disconnectBtnText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.error,
    },
    comingSoonPill: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    comingSoonText: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
    },

    // ── Sign out ─────────────────────────────────────────────────────────
    signOutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.pill,
      backgroundColor: `${colors.destructive}0F`,
      borderWidth: 1.5,
      borderColor: colors.border.error,
      minWidth: 160,
      alignSelf: 'stretch',
      ...(Platform.OS === 'web' ? ({ transitionDuration: '150ms' } as any) : {}),
    } as any,
    signOutButtonHover: {
      backgroundColor: `${colors.destructive}1F`,
    },
    signOutButtonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    signOutButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.error,
      letterSpacing: 0.3,
    },
  });
}
