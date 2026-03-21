import { Ionicons } from '@expo/vector-icons';
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
  View,
} from 'react-native';

import { ChipSelector } from '@/components/ui/ChipSelector';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { RgbColorPicker } from '@/components/ui/RgbColorPicker';
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
      console.log(
        '[Profile] GET response:',
        JSON.stringify({ phone: p?.phoneNumber, email: p?.email, addresses: p?.addresses })
      );
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
      console.log(
        '[Profile] POST response:',
        JSON.stringify({
          phone: updated?.phoneNumber,
          email: updated?.email,
          addresses: updated?.addresses,
        })
      );
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

          {isEditing && draft ? (
            <>
              <FloatingInput
                label="Brand Name"
                value={draft.brandName}
                onChangeText={(v) => updateDraft({ brandName: v })}
                accessibilityLabel="Brand name"
                autoCapitalize="words"
              />
              <FloatingInput
                label="Slogan / Motto (optional)"
                value={draft.slogan}
                onChangeText={(v) => updateDraft({ slogan: v })}
                accessibilityLabel="Brand slogan"
                autoCapitalize="sentences"
              />
              <Text style={styles.fieldLabel}>Colour Palette</Text>
              <RgbColorPicker
                label="Primary"
                value={draft.primaryColor}
                onChange={(v) => updateDraft({ primaryColor: v })}
              />
              <RgbColorPicker
                label="Secondary"
                value={draft.secondaryColor}
                onChange={(v) => updateDraft({ secondaryColor: v })}
              />
              <RgbColorPicker
                label="Accent"
                value={draft.accentColor}
                onChange={(v) => updateDraft({ accentColor: v })}
              />
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Brand Name</Text>
                <Text style={styles.infoValue}>{profile.brandName || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Slogan</Text>
                <Text style={styles.infoValue}>{profile.slogan || '—'}</Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoLabel}>Colours</Text>
                {[profile.primaryColor, profile.secondaryColor, profile.accentColor].some(
                  Boolean
                ) ? (
                  <View style={styles.colorSwatches}>
                    {[profile.primaryColor, profile.secondaryColor, profile.accentColor]
                      .filter(Boolean)
                      .map((c, i) => (
                        <View key={i} style={[styles.colorSwatch, { backgroundColor: c! }]} />
                      ))}
                  </View>
                ) : (
                  <Text style={styles.infoValue}>—</Text>
                )}
              </View>
            </>
          )}
        </View>

        {/* ── Business DNA ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business DNA</Text>

          {isEditing && draft ? (
            <>
              <Text style={styles.fieldLabel}>Business Domain</Text>
              <ChipSelector
                options={DOMAIN_OPTIONS}
                selected={draft.businessDomain}
                onSelect={(v) => updateDraft({ businessDomain: v })}
                accessibilityLabel="Select your business domain"
              />
              <FloatingInput
                label="Target Audience"
                value={draft.targetAudience}
                onChangeText={(v) => updateDraft({ targetAudience: v })}
                accessibilityLabel="Target audience"
                autoCapitalize="sentences"
              />
              <Text style={styles.fieldLabel}>Atmosphere (optional)</Text>
              <ChipSelector
                options={ATMOSPHERE_OPTIONS}
                selected={draft.atmosphere}
                onSelect={(v) => updateDraft({ atmosphere: v })}
                accessibilityLabel="Select atmosphere"
              />
              <Text style={styles.fieldLabel}>Shop Type</Text>
              <ChipSelector
                options={SHOP_TYPE_OPTIONS}
                selected={draft.shopType}
                onSelect={(v) => updateDraft({ shopType: v })}
                accessibilityLabel="Select shop type"
              />
              <FloatingInput
                label="Competitors (optional)"
                value={draft.competitors}
                onChangeText={(v) => updateDraft({ competitors: v })}
                accessibilityLabel="Competitors"
                autoCapitalize="words"
              />
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Domain</Text>
                {profile.businessDomain ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {labelFor(DOMAIN_OPTIONS, profile.businessDomain)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.infoValue}>—</Text>
                )}
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Target Audience</Text>
                <Text style={styles.infoValue}>{profile.targetAudience || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Atmosphere</Text>
                {profile.atmosphere ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {labelFor(ATMOSPHERE_OPTIONS, profile.atmosphere)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.infoValue}>—</Text>
                )}
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Shop Type</Text>
                {profile.shopType ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {labelFor(SHOP_TYPE_OPTIONS, profile.shopType)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.infoValue}>—</Text>
                )}
              </View>
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoLabel}>Competitors</Text>
                <Text style={styles.infoValue}>{profile.competitors || '—'}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Contact & Social ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact & Social</Text>

          {isEditing && draft ? (
            <>
              <FloatingInput
                label="Phone Number"
                value={draft.phoneNumber}
                onChangeText={(v) => updateDraft({ phoneNumber: v })}
                keyboardType="phone-pad"
                leftIcon="call-outline"
                accessibilityLabel="Phone number"
                autoCapitalize="none"
              />
              <FloatingInput
                label="Email"
                value={draft.email}
                onChangeText={(v) => updateDraft({ email: v })}
                keyboardType="email-address"
                leftIcon="mail-outline"
                accessibilityLabel="Business email"
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>
                {'Address' + (draft.addresses.length > 1 ? 'es' : '')}
              </Text>
              {draft.addresses.map((addr, index) => (
                <View key={index} style={styles.addressRow}>
                  <View style={styles.addressInput}>
                    <FloatingInput
                      label={draft.addresses.length > 1 ? `Address ${index + 1}` : 'Address'}
                      value={addr}
                      onChangeText={(v) => updateAddress(index, v)}
                      accessibilityLabel={`Address ${index + 1}`}
                      autoCapitalize="words"
                    />
                  </View>
                  {draft.addresses.length > 1 && (
                    <Pressable
                      onPress={() => removeAddress(index)}
                      style={styles.removeButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove address ${index + 1}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.text.muted} />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable
                onPress={addAddress}
                style={styles.addButton}
                accessibilityRole="button"
                accessibilityLabel="Add another address"
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.accent.primary} />
                <Text style={styles.addButtonText}>Add another address</Text>
              </Pressable>

              <Text style={[styles.fieldLabel, { marginTop: D.spacing.sm }]}>
                Social Media (optional)
              </Text>
              <FloatingInput
                label="Instagram"
                value={draft.instagramHandle}
                onChangeText={(v) => updateDraft({ instagramHandle: v })}
                leftIcon="logo-instagram"
                accessibilityLabel="Instagram handle"
                autoCapitalize="none"
              />
              <FloatingInput
                label="Facebook"
                value={draft.facebookHandle}
                onChangeText={(v) => updateDraft({ facebookHandle: v })}
                leftIcon="logo-facebook"
                accessibilityLabel="Facebook page"
                autoCapitalize="none"
              />
              <FloatingInput
                label="TikTok"
                value={draft.tikTokHandle}
                onChangeText={(v) => updateDraft({ tikTokHandle: v })}
                leftIcon="logo-tiktok"
                accessibilityLabel="TikTok handle"
                autoCapitalize="none"
              />
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{profile.phoneNumber || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{profile.email || '—'}</Text>
              </View>
              {(profile.addresses?.length ?? 0) > 0 ? (
                profile.addresses.map((addr, i) => (
                  <View key={i} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>
                      {profile.addresses.length > 1 ? `Address ${i + 1}` : 'Address'}
                    </Text>
                    <Text style={styles.infoValue}>{addr || '—'}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>—</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <View style={styles.infoLabelWithIcon}>
                  <Ionicons name="logo-instagram" size={13} color={colors.text.muted} />
                  <Text style={styles.infoLabel}>Instagram</Text>
                </View>
                <Text style={styles.infoValue}>{profile.instagramHandle || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <View style={styles.infoLabelWithIcon}>
                  <Ionicons name="logo-facebook" size={13} color={colors.text.muted} />
                  <Text style={styles.infoLabel}>Facebook</Text>
                </View>
                <Text style={styles.infoValue}>{profile.facebookHandle || '—'}</Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <View style={styles.infoLabelWithIcon}>
                  <Ionicons name="logo-tiktok" size={13} color={colors.text.muted} />
                  <Text style={styles.infoLabel}>TikTok</Text>
                </View>
                <Text style={styles.infoValue}>{profile.tikTokHandle || '—'}</Text>
              </View>
            </>
          )}
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
    fieldLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: D.spacing.sm,
    },
    // Info rows (view mode)
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.default,
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
      color: colors.text.muted,
      flex: 1,
    },
    infoValue: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      flex: 2,
      textAlign: 'right',
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
    colorSwatches: {
      flexDirection: 'row',
      gap: D.spacing.xs,
    },
    colorSwatch: {
      width: 20,
      height: 20,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    // Address (edit mode)
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    addressInput: {
      flex: 1,
    },
    removeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.sm,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingVertical: D.spacing.xs,
      marginBottom: D.spacing.sm,
    },
    addButtonText: {
      fontSize: D.fontSize.sm,
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
    // Bottom actions
    themeRow: {
      height: 50,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
      marginBottom: D.spacing.sm,
    },
    themeRowText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    logoutSection: {
      marginTop: D.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: D.spacing.md,
    },
    logoutButton: {
      height: 50,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderColor: colors.destructive,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
    },
    logoutText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.destructive,
    },
  });
}
