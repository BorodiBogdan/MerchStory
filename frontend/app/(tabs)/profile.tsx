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
  View,
} from 'react-native';

import { RgbColorPicker } from '@/components/ui/RgbColorPicker';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import {
  BrandColor,
  disconnectSocial,
  getFacebookConnectUrl,
  getShopProfile,
  getSocialStatus,
  ShopProfileResponse,
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
  const scalar: (keyof Omit<DraftState, 'newLogoUri' | 'addresses' | 'brandColors'>)[] = [
    'brandName',
    'slogan',
    'businessDomain',
    'otherDomain',
    'targetAudience',
    'shopType',
    'competitors',
    'phoneNumber',
    'email',
    'instagramHandle',
    'facebookHandle',
    'tikTokHandle',
  ];
  if (scalar.some((k) => draft[k] !== orig[k])) return true;
  if (JSON.stringify(draft.brandColors) !== JSON.stringify(orig.brandColors)) return true;
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
  const [colorPickerModal, setColorPickerModal] = useState<{ index: number; hex: string } | null>(
    null
  );
  const [socialStatus, setSocialStatus] = useState<{ facebook?: string }>({});

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

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [])
  );

  async function loadProfile() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [p, social] = await Promise.all([getShopProfile(), getSocialStatus()]);
      setProfile(p);
      setSocialStatus({
        facebook: social.facebookConnected ? 'connected' : undefined,
      });
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
    } catch (err) {
      console.error('Facebook connect error:', err);
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

  const displayColors = isEditing && draft ? draft.brandColors : (profile.brandColors ?? []);

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

          {/* Brand Colors */}
          {!isEditing && (
            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>Brand Colors</Text>
              <View style={styles.colorSwatchRow}>
                {displayColors.map((c, i) => (
                  <View key={i} style={styles.colorChip}>
                    <View style={[styles.colorSwatch, { backgroundColor: c.hex }]} />
                    <Text style={styles.colorHexText}>{c.hex}</Text>
                    <Text style={styles.colorPctText}>{c.percentage}%</Text>
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
                  style={[
                    styles.infoRow,
                    index === draft.brandColors.length - 1 && styles.infoRowLast,
                  ]}
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
                  style={[
                    styles.totalIndicator,
                    draftTotalPct !== 100 && styles.totalIndicatorError,
                  ]}
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
            <InfoRow label="Domain (Other)" value={profile.otherDomain} />
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
            label="Target Audience"
            value={profile.targetAudience ?? ''}
            draftValue={draft?.targetAudience}
            onChangeText={(v) => updateDraft({ targetAudience: v })}
          />

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

        {/* ── Connected Accounts ── */}
        {!isEditing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connected Accounts</Text>

            <View style={[styles.socialConnectRow, styles.infoRowLast]}>
              <View style={styles.socialConnectLeft}>
                <Ionicons name="logo-facebook" size={20} color={colors.text.primary} />
                <Text style={styles.socialConnectLabel}>Facebook</Text>
              </View>
              {socialStatus.facebook === 'connected' ? (
                <View style={styles.socialConnectActions}>
                  <Text style={styles.socialConnectStatus}>✓ Connected</Text>
                  <Pressable
                    onPress={() => void handleDisconnect('facebook')}
                    style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Disconnect Facebook"
                  >
                    <Text style={styles.disconnectBtnText}>Disconnect</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={connectFacebook}
                  disabled={socialStatus.facebook === 'connecting'}
                  accessibilityRole="button"
                >
                  <Text style={styles.socialConnectStatus}>
                    {socialStatus.facebook === 'connecting'
                      ? 'Opening…'
                      : socialStatus.facebook === 'error'
                        ? 'Failed — retry'
                        : 'Connect'}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={[styles.socialConnectRow, styles.infoRowLast]}>
              <View style={styles.socialConnectLeft}>
                <Ionicons name="logo-instagram" size={20} color={colors.text.primary} />
                <Text style={styles.socialConnectLabel}>Instagram</Text>
              </View>
              <Text style={styles.socialConnectStatus}>In progress</Text>
            </View>
          </View>
        )}

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
    // Brand colors — read mode
    colorSwatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
      flex: 2,
      justifyContent: 'flex-end',
    },
    colorChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    colorSwatch: {
      width: 16,
      height: 16,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    colorHexText: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontFamily: 'monospace',
    },
    colorPctText: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    // Brand colors — edit mode
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
      width: 20,
      height: 20,
      borderRadius: D.radius.sm,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    colorHexEdit: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontFamily: 'monospace',
    },
    colorPctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    colorPctInput: {
      width: 36,
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
      paddingTop: D.spacing.xs,
    },
    totalIndicator: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
    },
    totalIndicatorError: {
      color: colors.text.error,
    },
    addColorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: D.spacing.xs,
    },
    addColorText: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.medium,
    },
    // Color picker modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      padding: D.spacing.md,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    modalDoneButton: {
      marginTop: D.spacing.sm,
      height: 42,
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
    // Other domain input
    otherDomainInput: {
      flex: undefined,
      textAlign: 'left',
      marginBottom: D.spacing.sm,
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
    socialConnectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.md,
      paddingHorizontal: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
    },
    socialConnectLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    socialConnectLabel: {
      fontSize: D.fontSize.base,
      color: colors.text.primary,
    },
    socialConnectStatus: {
      fontSize: D.fontSize.sm,
      color: colors.accent.secondary,
      fontWeight: D.fontWeight.medium,
    },
    socialConnectActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    disconnectBtn: {
      paddingVertical: 4,
      paddingHorizontal: D.spacing.sm,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.error,
    },
    disconnectBtnText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      color: colors.text.error,
    },
  });
}
