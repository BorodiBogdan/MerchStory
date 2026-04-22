import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type DimensionValue,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ChipSelector } from '@/components/ui/ChipSelector';
import { GalleryImage } from '@/components/ui/GalleryImage';
import { KeepImageModal } from '@/components/ui/KeepImageModal';
import { PlacementZoneEditor } from '@/components/ui/PlacementZoneEditor';
import { ProductImage } from '@/components/ui/ProductImage';
import { ProductPickerModal } from '@/components/ui/ProductPickerModal';
import { RgbColorPicker } from '@/components/ui/RgbColorPicker';
import { D } from '@/constants/design';
import type { GenerationType } from '@/constants/generationTypes';
import { useShop } from '@/context/shop';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  fetchGallery,
  fetchGalleryImage,
  formatPrice,
  type GalleryItem,
  generateAnnouncementImage,
  generateCatalogImage,
  generateCatalogOnWallpaper,
  type GenerateImageResponse,
  generateWallpaper,
  type PlacementZone,
  type ProductItem,
  saveToGallery,
  type ShopProfileResponse,
  type TextStyleOptions,
} from '@/utils/api';
import * as galleryCache from '@/utils/galleryCache';
import * as galleryImageCache from '@/utils/galleryImageCache';
import * as productImageCache from '@/utils/productImageCache';
import * as productsCache from '@/utils/productsCache';

async function loadProductImageBase64(id: string): Promise<string | null> {
  try {
    const entry = await productImageCache.load(id);
    const comma = entry.uri.indexOf(',');
    return comma >= 0 ? entry.uri.slice(comma + 1) : null;
  } catch {
    return null;
  }
}

const isWeb = Platform.OS === 'web';
const SIDEBAR_WIDTH = 320;
const DESKTOP_BREAKPOINT = 860;

type StudioTab = 'catalog' | 'announcements' | 'video';
type CatalogMode = 'generate' | 'on-wallpaper';
type WallpaperStage = 'none' | 'generating' | 'preview' | 'confirmed';
type PostType = 'Announcement' | 'Job Post' | 'Promotion';
type ContextItem = { key: string; label: string };

// ─── Text style presets (style only — color is chosen separately) ──────────────
// Preview font files must match the backend (CatalogCompositor.LoadEmbeddedFamily)
// so the sidebar preview renders with the same typeface as the generated image.
type TextPreset = {
  id: string;
  label: string;
  i18nKey: string;
  fontFamily: string;
  textEffect: string;
  priceBadge: string;
  nameFont: string;
  priceFont: string;
};

const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'modern-shadow',
    label: 'Shadow',
    i18nKey: 'studio.preset.shadow',
    fontFamily: 'Modern',
    textEffect: 'Shadow',
    priceBadge: 'None',
    nameFont: 'Inter-Regular',
    priceFont: 'Inter-Bold',
  },
  {
    id: 'bold-shadow',
    label: 'Bold',
    i18nKey: 'studio.preset.bold',
    fontFamily: 'Bold',
    textEffect: 'Shadow',
    priceBadge: 'None',
    nameFont: 'Montserrat-Bold',
    priceFont: 'Montserrat-Bold',
  },
  {
    id: 'elegant-clean',
    label: 'Elegant',
    i18nKey: 'studio.preset.elegant',
    fontFamily: 'Elegant',
    textEffect: 'None',
    priceBadge: 'None',
    nameFont: 'PlayfairDisplay-Regular',
    priceFont: 'PlayfairDisplay-Regular',
  },
  {
    id: 'bold-badge',
    label: 'Badge',
    i18nKey: 'studio.preset.badge',
    fontFamily: 'Bold',
    textEffect: 'Shadow',
    priceBadge: 'Pill',
    nameFont: 'Montserrat-Bold',
    priceFont: 'Montserrat-Bold',
  },
  {
    id: 'outline',
    label: 'Outline',
    i18nKey: 'studio.preset.outline',
    fontFamily: 'Modern',
    textEffect: 'Outline',
    priceBadge: 'None',
    nameFont: 'Inter-Regular',
    priceFont: 'Inter-Bold',
  },
  {
    id: 'friendly-badge',
    label: 'Friendly',
    i18nKey: 'studio.preset.friendly',
    fontFamily: 'Friendly',
    textEffect: 'Shadow',
    priceBadge: 'Pill',
    nameFont: 'Lato-Regular',
    priceFont: 'Lato-Regular',
  },
];

const PRICE_SWATCHES = [
  '#FFFFFF',
  '#F59E0B',
  '#EF4444',
  '#22C55E',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#1e1e1e',
];

function isColorLight(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.45;
}

const PRESET_SWATCH_SET = new Set(PRICE_SWATCHES.map((c) => c.toLowerCase()));

// Circle swatch that opens a custom color picker. Uses the OS-native color picker
// on web (zero-friction) and a small modal with the RGB picker on native.
function CustomColorSwatch({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isCustom = !PRESET_SWATCH_SET.has(value.toLowerCase());
  const seed = isCustom && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#808080';

  const RAINBOW = ['#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#3B82F6', '#A855F7'];

  return (
    <>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: isCustom ? 2.5 : 1,
          borderColor: isCustom ? colors.accent.primary : colors.border.default,
          backgroundColor: isCustom ? value : '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {!isCustom && (
          <View style={{ flexDirection: 'row', width: '100%', height: '100%' }}>
            {RAINBOW.map((c) => (
              <View key={c} style={{ flex: 1, backgroundColor: c }} />
            ))}
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <Ionicons name="color-palette" size={10} color="#1e1e1e" />
        </View>
        {Platform.OS === 'web'
          ? // Real native color input stretched over the circle. User's click on
            // the input itself makes Chrome anchor the OS picker to this element.
            React.createElement('input', {
              type: 'color',
              value: seed,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(e.target.value.toUpperCase()),
              'aria-label': 'Pick a custom color',
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
          : null}
        {Platform.OS !== 'web' && (
          <Pressable
            onPress={() => setModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick a custom color"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}
      </View>

      <Modal
        visible={modalOpen && Platform.OS !== 'web'}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: D.spacing.lg,
          }}
          onPress={() => setModalOpen(false)}
        >
          <Pressable
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: colors.bg.surface,
              borderRadius: D.radius.xl,
              padding: D.spacing.lg,
            }}
            onPress={() => {}}
          >
            <RgbColorPicker label="Custom color" value={value} onChange={onChange} />
            <Pressable
              onPress={() => setModalOpen(false)}
              style={{
                marginTop: D.spacing.sm,
                paddingVertical: 12,
                borderRadius: D.radius.pill,
                backgroundColor: colors.accent.primary,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: D.fontSize.base,
                  fontWeight: D.fontWeight.semibold,
                }}
              >
                Done
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function TextStylePresetPicker({
  selectedId,
  onSelect,
  selectedColor,
  onColorChange,
  colors,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  selectedColor: string;
  onColorChange: (c: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const t = useT();
  const previewBg = isColorLight(selectedColor) ? '#1a1a2e' : '#f0f4ff';
  return (
    <>
      <SectionLabel label={t('studio.optColor')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: D.spacing.md }}>
        {PRICE_SWATCHES.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => onColorChange(hex)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedColor === hex }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: hex,
              borderWidth: selectedColor === hex ? 2.5 : 1,
              borderColor: selectedColor === hex ? colors.accent.primary : colors.border.default,
            }}
          />
        ))}
        <CustomColorSwatch value={selectedColor} onChange={onColorChange} colors={colors} />
      </View>

      <SectionLabel label={t('studio.optText')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: D.spacing.sm }}>
        {TEXT_PRESETS.map((preset) => {
          const selected = preset.id === selectedId;
          const hasShadow = preset.textEffect === 'Shadow';
          const hasOutline = preset.textEffect === 'Outline';
          // Single-color glow that reads equally well against light and dark previews
          // and never matches the selectedColor (so it stays visible for every swatch).
          // Using textShadowRadius instead of a 4-direction stack avoids the jagged
          // overdraw artifacts that came from stacking five absolute-positioned Texts.
          const outlineGlow = 'rgba(120, 120, 120, 0.95)';
          const shadowStyle = hasShadow
            ? {
                textShadowColor: 'rgba(0,0,0,0.4)',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 0,
              }
            : undefined;
          return (
            <Pressable
              key={preset.id}
              onPress={() => onSelect(preset.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                width: 130,
                borderRadius: 12,
                overflow: 'hidden',
                borderWidth: selected ? 2.5 : 1.5,
                borderColor: selected ? colors.accent.primary : colors.border.default,
              }}
            >
              <View
                style={{
                  backgroundColor: previewBg,
                  paddingHorizontal: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 88,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: selectedColor,
                    fontSize: 10,
                    fontFamily: preset.nameFont,
                    marginBottom: 8,
                    opacity: 0.85,
                    ...(shadowStyle ?? {}),
                    ...(hasOutline
                      ? {
                          textShadowColor: outlineGlow,
                          textShadowOffset: { width: 0, height: 0 },
                          textShadowRadius: 1.5,
                        }
                      : {}),
                  }}
                >
                  Product Name
                </Text>
                <View
                  style={
                    preset.priceBadge === 'Pill'
                      ? {
                          // Backend draws the pill as a filled shape with no stroke;
                          // tinted selectedColor fill keeps it visible on previewBg
                          // (which sits in the opposite luminance bucket).
                          backgroundColor: selectedColor + '33',
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                          borderRadius: 999,
                        }
                      : undefined
                  }
                >
                  <Text
                    style={{
                      color: selectedColor,
                      fontSize: 24,
                      fontFamily: preset.priceFont,
                      letterSpacing: -0.5,
                      ...(shadowStyle ?? {}),
                      ...(hasOutline
                        ? {
                            textShadowColor: outlineGlow,
                            textShadowOffset: { width: 0, height: 0 },
                            textShadowRadius: 3,
                          }
                        : {}),
                    }}
                  >
                    $19.99
                  </Text>
                </View>
              </View>
              <View
                style={{
                  backgroundColor: colors.bg.surface,
                  paddingVertical: 6,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.accent.primary : colors.text.secondary,
                    fontSize: D.fontSize.xs,
                    fontWeight: '600',
                  }}
                >
                  {t(preset.i18nKey as never)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ─── Static data (labels come from i18n at render time) ───────────────────────
type TranslateFn = (key: string) => string;

function getLayoutOptions(tr: TranslateFn) {
  return [
    { value: 'Showcase', label: tr('studio.layoutShowcaseLabel') },
    { value: 'Story', label: tr('studio.layoutStoryLabel') },
  ];
}
function getColorOptions(tr: TranslateFn) {
  return [
    { value: 'Brand Colors', label: tr('studio.themeBrandLabel') },
    { value: 'Vibrant', label: tr('studio.themeVibrantLabel') },
    { value: 'Monochrome', label: tr('studio.themeMonoLabel') },
    { value: 'Dark', label: tr('studio.themeDarkLabel') },
  ];
}
function getFormatOptions(tr: TranslateFn) {
  return [
    { value: 'Square', label: tr('studio.formatSquareLabel') },
    { value: 'Portrait', label: tr('studio.formatPortraitLabel') },
    { value: 'Story', label: tr('studio.formatStoryLabel') },
  ];
}
function getPostTypes(tr: TranslateFn): {
  type: PostType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  placeholder: string;
}[] {
  return [
    {
      type: 'Announcement',
      label: tr('studio.post.announcement'),
      icon: 'megaphone-outline',
      placeholder: tr('studio.post.announcementPlaceholder'),
    },
    {
      type: 'Job Post',
      label: tr('studio.post.jobPost'),
      icon: 'briefcase-outline',
      placeholder: tr('studio.post.jobPostPlaceholder'),
    },
    {
      type: 'Promotion',
      label: tr('studio.post.promotion'),
      icon: 'pricetag-outline',
      placeholder: tr('studio.post.promotionPlaceholder'),
    },
  ];
}
function getJobImageStyleOptions(tr: TranslateFn) {
  return [
    { value: 'text-only', label: tr('studio.jobStyle.textOnly') },
    { value: 'with-person', label: tr('studio.jobStyle.withPerson') },
  ];
}
function getToneOptions(tr: TranslateFn) {
  return [
    { value: 'Professional', label: tr('studio.tone.professional') },
    { value: 'Friendly', label: tr('studio.tone.friendly') },
    { value: 'Bold', label: tr('studio.tone.bold') },
    { value: 'Playful', label: tr('studio.tone.playful') },
  ];
}
const TAB_META: {
  key: StudioTab;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconFilled: React.ComponentProps<typeof Ionicons>['name'];
  comingSoon?: boolean;
}[] = [
  {
    key: 'catalog',
    label: 'Catalog Generator',
    desc: 'Product catalogs with prices',
    icon: 'grid-outline',
    iconFilled: 'grid',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    desc: 'Job posts, promos, info graphics',
    icon: 'megaphone-outline',
    iconFilled: 'megaphone',
  },
  {
    key: 'video',
    label: 'Video Ads',
    desc: 'AI video ads for your products',
    icon: 'film-outline',
    iconFilled: 'film',
    comingSoon: true,
  },
];

// ─── Brand context helpers ──────────────────────────────────────────────────────
function deriveContextItems(profile: ShopProfileResponse, tr: TranslateFn): ContextItem[] {
  const items: ContextItem[] = [];
  if (profile.logoBase64) items.push({ key: 'logoBase64', label: tr('studio.ctx.logo') });
  if (profile.brandName) items.push({ key: 'brandName', label: tr('studio.ctx.brandName') });
  if (profile.slogan) items.push({ key: 'slogan', label: tr('studio.ctx.slogan') });
  if (profile.brandColors?.length > 0)
    items.push({ key: 'brandColors', label: tr('studio.ctx.brandColors') });
  if (profile.businessDomain)
    items.push({ key: 'businessDomain', label: tr('studio.ctx.businessDomain') });
  if (profile.shopType) items.push({ key: 'shopType', label: tr('studio.ctx.shopType') });
  if (profile.targetAudience)
    items.push({ key: 'targetAudience', label: tr('studio.ctx.targetAudience') });
  if (profile.competitors) items.push({ key: 'competitors', label: tr('studio.ctx.competitors') });
  if (profile.phoneNumber) items.push({ key: 'phoneNumber', label: tr('studio.ctx.phone') });
  if (profile.email) items.push({ key: 'email', label: tr('studio.ctx.email') });
  if (profile.addresses?.length > 0)
    items.push({ key: 'addresses', label: tr('studio.ctx.address') });
  if (profile.instagramHandle)
    items.push({ key: 'instagramHandle', label: tr('studio.ctx.instagram') });
  if (profile.facebookHandle)
    items.push({ key: 'facebookHandle', label: tr('studio.ctx.facebook') });
  if (profile.tikTokHandle) items.push({ key: 'tikTokHandle', label: tr('studio.ctx.tiktok') });
  return items;
}

function BrandContextSection({
  items,
  selected,
  onToggle,
}: {
  items: ContextItem[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  if (items.length === 0) return null;
  return (
    <>
      <SectionLabel label={t('studio.brandContext')} />
      <Text
        style={{
          fontSize: D.fontSize.xs,
          color: colors.text.muted,
          marginBottom: D.spacing.sm,
        }}
      >
        {t('studio.brandContextHint')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: D.spacing.xs }}>
        {items.map((item) => {
          const active = selected.includes(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => onToggle(item.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              style={({ pressed }) => ({
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                gap: 4,
                paddingVertical: 5,
                paddingHorizontal: D.spacing.sm,
                borderRadius: D.radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.accent.primary : colors.border.default,
                backgroundColor: active
                  ? colors.accent.dim
                  : pressed
                    ? colors.bg.elevated
                    : 'transparent',
              })}
            >
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={13}
                color={active ? colors.accent.primary : colors.text.muted}
              />
              <Text
                style={{
                  fontSize: D.fontSize.xs,
                  color: active ? colors.accent.primary : colors.text.secondary,
                  fontWeight: active ? D.fontWeight.medium : D.fontWeight.regular,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: D.fontSize.xs,
        fontWeight: D.fontWeight.semibold,
        color: colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: D.spacing.sm,
        marginTop: D.spacing.md,
      }}
    >
      {label}
    </Text>
  );
}

function OptionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: D.fontSize.sm,
        fontWeight: D.fontWeight.medium,
        color: colors.text.secondary,
        marginBottom: D.spacing.xs,
        marginTop: D.spacing.md,
      }}
    >
      {label}
    </Text>
  );
}

// Vertical radio list — used in the desktop sidebar instead of horizontal chips
function SidebarOptionGroup({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 1, marginTop: D.spacing.xs }}>
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              flexDirection: 'row' as const,
              alignItems: 'center' as const,
              paddingVertical: 7,
              paddingHorizontal: D.spacing.sm,
              borderRadius: D.radius.sm,
              backgroundColor: active
                ? colors.accent.dim
                : pressed
                  ? colors.bg.elevated
                  : 'transparent',
              gap: D.spacing.sm,
            })}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: active ? colors.accent.primary : colors.border.default,
                backgroundColor: active ? colors.accent.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {active && <Ionicons name="checkmark" size={10} color="#fff" />}
            </View>
            <Text
              style={{
                fontSize: D.fontSize.sm,
                fontWeight: active ? D.fontWeight.medium : D.fontWeight.regular,
                color: active ? colors.accent.primary : colors.text.secondary,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function GenerateButton({
  loading,
  disabled,
  label,
  onPress,
}: {
  loading: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        {
          backgroundColor: '#6366F1',
          borderRadius: D.radius.md,
          paddingVertical: 13,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          gap: D.spacing.sm,
          opacity: disabled || loading ? 0.45 : pressed ? 0.85 : 1,
        },
        !disabled &&
          !loading && {
            shadowColor: '#6366F1',
            shadowOpacity: 0.4,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Ionicons name="sparkles-outline" size={15} color="#fff" />
          <Text
            style={{ color: '#fff', fontSize: D.fontSize.base, fontWeight: D.fontWeight.semibold }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function downloadImage(result: GenerateImageResponse, filename: string) {
  if (Platform.OS !== 'web') return;
  const ext = result.mimeType.split('/')[1] ?? 'png';
  const a = document.createElement('a');
  a.href = `data:${result.mimeType};base64,${result.imageBase64}`;
  a.download = `${filename}.${ext}`;
  a.click();
}

function ResultPreviewPanel({
  result,
  generating,
  error,
  emptyTitle,
  emptyHint,
  filename,
  onKeep,
  isKept,
  colors,
  styles,
}: {
  result: GenerateImageResponse | null;
  generating: boolean;
  error: string | null;
  emptyTitle: string;
  emptyHint: string;
  filename: string;
  onKeep?: () => void;
  isKept?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof makeStyles>;
}) {
  const t = useT();
  if (generating) {
    return (
      <View style={styles.previewPlaceholder}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.previewEmptyTitle}>{t('studio.generating')}</Text>
        <Text style={styles.previewEmptyHint}>{t('studio.previewEmptyHint')}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.previewPlaceholder}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.text.error} />
        <Text style={[styles.previewEmptyTitle, { color: colors.text.error }]}>
          {t('studio.errorGeneric')}
        </Text>
        <Text style={styles.previewEmptyHint}>{error}</Text>
      </View>
    );
  }
  if (result) {
    return (
      <View style={styles.resultImageCard}>
        <Image
          source={{ uri: `data:${result.mimeType};base64,${result.imageBase64}` }}
          style={styles.resultImage}
          resizeMode="contain"
          accessibilityLabel={t('studio.a11y.generatedImage')}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {onKeep && (
            <Pressable
              style={({ pressed }) => [
                styles.downloadBtn,
                { backgroundColor: isKept ? colors.accent.dim : colors.accent.primary },
                pressed && { opacity: 0.75 },
              ]}
              onPress={isKept ? undefined : onKeep}
              accessibilityRole="button"
              accessibilityLabel={isKept ? t('studio.a11y.imageSaved') : t('studio.a11y.keepImage')}
            >
              <Ionicons
                name={isKept ? 'checkmark-circle' : 'bookmark-outline'}
                size={15}
                color="#fff"
              />
              <Text style={styles.downloadBtnText}>
                {isKept ? t('studio.saved') : t('studio.keep')}
              </Text>
            </Pressable>
          )}
          {isWeb && (
            <Pressable
              style={({ pressed }) => [styles.downloadBtn, pressed && { opacity: 0.75 }]}
              onPress={() => downloadImage(result, filename)}
              accessibilityRole="button"
              accessibilityLabel={t('studio.a11y.downloadImage')}
            >
              <Ionicons name="download-outline" size={15} color="#fff" />
              <Text style={styles.downloadBtnText}>{t('studio.download')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.previewPlaceholder}>
      <View style={styles.previewIconCircle}>
        <Ionicons name="sparkles-outline" size={28} color={colors.accent.primary} />
      </View>
      <Text style={styles.previewEmptyTitle}>{emptyTitle}</Text>
      <Text style={styles.previewEmptyHint}>{emptyHint}</Text>
    </View>
  );
}

function ProductCard({
  product,
  selected,
  onToggle,
  cardWidth,
  colors,
  styles,
  mismatch = false,
  mismatchHint,
}: {
  product: ProductItem;
  selected: boolean;
  onToggle: () => void;
  cardWidth: DimensionValue;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof makeStyles>;
  mismatch?: boolean;
  mismatchHint?: string;
}) {
  return (
    <Pressable
      style={[
        styles.productCard,
        { width: cardWidth },
        selected && styles.productCardSelected,
        mismatch && { opacity: 0.35 },
      ]}
      onPress={onToggle}
      disabled={mismatch}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: mismatch }}
      accessibilityHint={mismatch ? mismatchHint : undefined}
    >
      <View style={styles.productImageBox}>
        <ProductImage id={product.id} style={styles.productImage} resizeMode="cover" />
        {selected && (
          <View style={styles.selectedOverlay}>
            <Ionicons name="checkmark-circle" size={22} color={colors.accent.primary} />
          </View>
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
      </View>
    </Pressable>
  );
}

const DESKTOP_INLINE_LIMIT = 4;

function ChooseProductsSection({
  subtitle,
  isDesktop,
  products,
  loadingProducts,
  selectedCount,
  selected,
  toggleProduct,
  colors,
  styles,
  showProducts,
}: {
  subtitle: string;
  isDesktop: boolean;
  products: ProductItem[];
  loadingProducts: boolean;
  selectedCount: number;
  selected: Set<string>;
  toggleProduct: (id: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof makeStyles>;
  showProducts: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const t = useT();

  const closePicker = () => {
    setPickerOpen(false);
  };

  // Desktop inline card width: 4 cards in available panel space
  const panelInner = screenWidth - SIDEBAR_WIDTH - 1 - 64;
  const inlineCardWidth = Math.floor(
    (panelInner - D.spacing.sm * (DESKTOP_INLINE_LIMIT - 1)) / DESKTOP_INLINE_LIMIT
  );

  const hasMore = products.length > DESKTOP_INLINE_LIMIT;
  const inlineProducts = products.slice(0, DESKTOP_INLINE_LIMIT);
  const selectedProducts = products.filter((p) => selected.has(p.id));
  const lockedCurrency = selectedProducts.length > 0 ? selectedProducts[0].currency : null;

  const picker = (
    <ProductPickerModal
      visible={pickerOpen}
      onClose={closePicker}
      selected={selected}
      onToggle={toggleProduct}
      subtitle={subtitle}
    />
  );

  // ── Desktop layout ────────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={styles.desktopSection}>
        <View style={styles.desktopSectionHeader}>
          <View>
            <Text style={styles.desktopSectionTitle}>{t('productPicker.defaultTitle')}</Text>
            <Text style={styles.desktopSectionSub}>{subtitle}</Text>
          </View>
          {selectedCount > 0 && (
            <View style={styles.countBadge}>
              <Text
                style={styles.countBadgeText}
              >{`${selectedCount} ${t('productPicker.selected')}`}</Text>
            </View>
          )}
        </View>

        {loadingProducts ? (
          <ActivityIndicator
            size="small"
            color={colors.accent.primary}
            style={{ marginVertical: D.spacing.lg }}
          />
        ) : products.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={32} color={colors.text.muted} />
            <Text style={styles.emptyText}>{t('studio.noProductsAddFirst')}</Text>
          </View>
        ) : showProducts == false ? (
          <>
            <Pressable
              style={({ pressed }) => ({
                marginTop: D.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: D.spacing.xs,
                alignSelf: 'flex-start',
                paddingHorizontal: D.spacing.md,
                paddingVertical: D.spacing.sm,
                borderRadius: D.radius.md,
                borderWidth: 1,
                borderColor: colors.border.default,
                backgroundColor: pressed ? colors.bg.elevated : colors.bg.surface,
              })}
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
            >
              <Ionicons name="grid-outline" size={14} color={colors.accent.primary} />
              <Text
                style={{
                  fontSize: D.fontSize.sm,
                  color: colors.accent.primary,
                  fontWeight: D.fontWeight.medium,
                }}
              >
                {t('studio.browseProducts')}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.accent.primary} />
            </Pressable>
          </>
        ) : (
          <>
            {lockedCurrency !== null ? (
              <View style={styles.currencyNotice}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.accent.primary} />
                <Text style={styles.currencyNoticeText}>
                  {`${t('productPicker.currencyLocked')} ${lockedCurrency}.`}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: D.spacing.sm }}>
              {inlineProducts.map((p) => {
                const isSel = selected.has(p.id);
                const mismatch = lockedCurrency !== null && !isSel && p.currency !== lockedCurrency;
                return (
                  <ProductCard
                    key={p.id}
                    product={p}
                    selected={isSel}
                    onToggle={() => toggleProduct(p.id)}
                    cardWidth={inlineCardWidth}
                    colors={colors}
                    styles={styles}
                    mismatch={mismatch}
                    mismatchHint={t('productPicker.currencyMismatch')}
                  />
                );
              })}
            </View>

            <Pressable
              style={({ pressed }) => ({
                marginTop: D.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: D.spacing.xs,
                alignSelf: 'flex-start',
                paddingHorizontal: D.spacing.md,
                paddingVertical: D.spacing.sm,
                borderRadius: D.radius.md,
                borderWidth: 1,
                borderColor: colors.border.default,
                backgroundColor: pressed ? colors.bg.elevated : colors.bg.surface,
              })}
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
            >
              <Ionicons name="grid-outline" size={14} color={colors.accent.primary} />
              <Text
                style={{
                  fontSize: D.fontSize.sm,
                  color: colors.accent.primary,
                  fontWeight: D.fontWeight.medium,
                }}
              >
                {hasMore
                  ? t('studio.browseAllProducts').replace('{count}', String(products.length))
                  : t('studio.browseProducts')}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.accent.primary} />
            </Pressable>
          </>
        )}

        {picker}
      </View>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.mobileSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('productPicker.defaultTitle')}</Text>
        {selectedCount > 0 && (
          <View style={styles.countBadge}>
            <Text
              style={styles.countBadgeText}
            >{`${selectedCount} ${t('productPicker.selected')}`}</Text>
          </View>
        )}
      </View>

      {loadingProducts ? (
        <ActivityIndicator
          size="small"
          color={colors.accent.primary}
          style={{ marginVertical: D.spacing.lg }}
        />
      ) : products.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="pricetag-outline" size={32} color={colors.text.muted} />
          <Text style={styles.emptyText}>{t('studio.noProductsAddFirst')}</Text>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => ({
            borderRadius: D.radius.md,
            borderWidth: 1.5,
            borderColor: selectedCount > 0 ? colors.accent.primary : colors.border.default,
            backgroundColor: pressed ? colors.bg.elevated : colors.bg.surface,
            overflow: 'hidden',
          })}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
        >
          {/* Selected thumbnails strip */}
          {selectedProducts.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                gap: 2,
                height: 64,
                backgroundColor: colors.bg.base,
              }}
            >
              {selectedProducts.slice(0, 5).map((p, i) => (
                <View key={p.id} style={{ flex: 1, position: 'relative' }}>
                  <ProductImage
                    id={p.id}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  {i === 4 && selectedProducts.length > 5 && (
                    <View
                      style={{
                        ...StyleSheet.absoluteFillObject,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: '#fff',
                          fontSize: D.fontSize.sm,
                          fontWeight: D.fontWeight.semibold,
                        }}
                      >
                        +{selectedProducts.length - 4}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Trigger row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: D.spacing.md,
              paddingVertical: D.spacing.md,
              gap: D.spacing.sm,
            }}
          >
            <Ionicons
              name={selectedCount > 0 ? 'checkmark-circle-outline' : 'pricetag-outline'}
              size={18}
              color={selectedCount > 0 ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={{
                flex: 1,
                fontSize: D.fontSize.sm,
                color: selectedCount > 0 ? colors.text.primary : colors.text.muted,
                fontWeight: selectedCount > 0 ? D.fontWeight.medium : D.fontWeight.regular,
              }}
            >
              {selectedCount > 0
                ? products.length === 1
                  ? t('studio.selectedOfOne').replace('{selected}', String(selectedCount))
                  : t('studio.selectedOfN')
                      .replace('{selected}', String(selectedCount))
                      .replace('{total}', String(products.length))
                : products.length === 1
                  ? t('studio.chooseFromOne')
                  : t('studio.chooseFromN').replace('{count}', String(products.length))}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
          </View>
        </Pressable>
      )}

      {picker}
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function StudioScreen() {
  const { colors } = useTheme();
  const t = useT();
  const { profile: shopProfile } = useShop();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = isWeb && screenWidth >= DESKTOP_BREAKPOINT;
  const styles = useMemo(
    () => makeStyles(colors, isDesktop, screenWidth),
    [colors, isDesktop, screenWidth]
  );

  // ── Translated labels (rebuilt on language change) ───────────────────────────
  const TAB_META_I18N = useMemo(
    () => ({
      catalog: { label: t('studio.navCatalog'), desc: t('studio.toolsCatalogDesc') },
      announcements: {
        label: t('studio.navAnnouncements'),
        desc: t('studio.toolsAnnouncementsDesc'),
      },
      video: { label: t('studio.navVideo'), desc: t('studio.toolsVideoDesc') },
    }),
    [t]
  );
  const tr: TranslateFn = t as unknown as TranslateFn;
  const LAYOUT_OPTIONS = useMemo(() => getLayoutOptions(tr), [tr]);
  const COLOR_OPTIONS = useMemo(() => getColorOptions(tr), [tr]);
  const FORMAT_OPTIONS = useMemo(() => getFormatOptions(tr), [tr]);
  const POST_TYPES = useMemo(() => getPostTypes(tr), [tr]);
  const JOB_IMAGE_STYLE_OPTIONS = useMemo(() => getJobImageStyleOptions(tr), [tr]);
  const TONE_OPTIONS = useMemo(() => getToneOptions(tr), [tr]);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<StudioTab>('catalog');
  const slideAnim = useRef(new Animated.Value(0)).current;

  function switchTab(tab: StudioTab) {
    const toValue = tab === 'catalog' ? 0 : tab === 'announcements' ? 1 : 2;
    Animated.timing(slideAnim, {
      toValue,
      duration: D.duration.normal,
      useNativeDriver: false,
    }).start();
    setActiveTab(tab);
  }

  const indicatorLeft = slideAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['1%', '34.33%', '67.66%'],
  });

  // ── Catalog mode state ───────────────────────────────────────────────────────
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('generate');
  const catalogModeAnim = useRef(new Animated.Value(0)).current;

  function switchCatalogMode(mode: CatalogMode) {
    Animated.timing(catalogModeAnim, {
      toValue: mode === 'generate' ? 0 : 1,
      duration: D.duration.normal,
      useNativeDriver: false,
    }).start();
    setCatalogMode(mode);
    setCatalogResult(null);
    setCatalogError(null);
    setWallpaperOnResult(null);
    setWallpaperOnError(null);
  }

  const catalogModeIndicatorLeft = catalogModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['1%', '51%'],
  });

  // ── Wallpaper state ──────────────────────────────────────────────────────────
  const [wallpaperStage, setWallpaperStage] = useState<WallpaperStage>('none');
  const [wallpaperBase64, setWallpaperBase64] = useState<string | null>(null);
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>(null);
  const [wallpaperPrompt, setWallpaperPrompt] = useState('');
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  // Generate wallpaper modal
  const [wallpaperGenModalVisible, setWallpaperGenModalVisible] = useState(false);
  const [wallpaperGenModalStage, setWallpaperGenModalStage] = useState<'input' | 'result'>('input');
  const [wallpaperGenFormat, setWallpaperGenFormat] = useState('9:16');
  const [wallpaperGenIncludeLogo, setWallpaperGenIncludeLogo] = useState(false);
  const [wallpaperGenBrandFields, setWallpaperGenBrandFields] = useState<string[]>([]);
  const [wallpaperGenResult, setWallpaperGenResult] = useState<GenerateImageResponse | null>(null);
  const [wallpaperGenKept, setWallpaperGenKept] = useState(false);
  const [wallpaperGenGenerating, setWallpaperGenGenerating] = useState(false);
  const [wallpaperOnGenerating, setWallpaperOnGenerating] = useState(false);
  const [wallpaperOnResult, setWallpaperOnResult] = useState<GenerateImageResponse | null>(null);
  const [wallpaperOnKept, setWallpaperOnKept] = useState(false);
  const [wallpaperOnError, setWallpaperOnError] = useState<string | null>(null);

  // ── Placement zone ───────────────────────────────────────────────────────────
  const DEFAULT_PLACEMENT_ZONE: PlacementZone = { x: 0, y: 0.15, width: 1.0, height: 0.7 };
  const [placementZone, setPlacementZone] = useState<PlacementZone>(DEFAULT_PLACEMENT_ZONE);
  // Track the format of the selected wallpaper to warn on mismatch
  const [wallpaperAspectRatio, setWallpaperAspectRatio] = useState<number>(1);

  useEffect(() => {
    if (!wallpaperBase64) {
      setWallpaperAspectRatio(1);
      return;
    }
    const uri = `data:image/jpeg;base64,${wallpaperBase64}`;
    Image.getSize(
      uri,
      (w, h) => setWallpaperAspectRatio(h > 0 ? w / h : 1),
      () => setWallpaperAspectRatio(1)
    );
  }, [wallpaperBase64]);

  // ── Wallpaper picker (choose from saved wallpapers) ──────────────────────────
  const [wallpaperPickerVisible, setWallpaperPickerVisible] = useState(false);
  const [wallpaperPickerItems, setWallpaperPickerItems] = useState<GalleryItem[]>([]);
  const [wallpaperPickerLoading, setWallpaperPickerLoading] = useState(false);

  // ── Text style state ─────────────────────────────────────────────────────────
  const [selectedPresetId, setSelectedPresetId] = useState<string>('modern-shadow');
  const [selectedColor, setSelectedColor] = useState<string>('#F59E0B');
  const textStyle = useMemo<TextStyleOptions>(() => {
    const preset = TEXT_PRESETS.find((p) => p.id === selectedPresetId) ?? TEXT_PRESETS[0];
    return {
      fontFamily: preset.fontFamily,
      fontSize: 'Large',
      nameColor: selectedColor,
      priceColor: selectedColor,
      colorMode: 'Solid',
      textEffect: preset.textEffect,
      priceBadge: preset.priceBadge,
    };
  }, [selectedPresetId, selectedColor]);

  // ── Catalog state ────────────────────────────────────────────────────────────
  const productsCacheState = productsCache.useProductsCache();
  const products = productsCacheState.items;
  const loadingProducts = productsCacheState.loading && !productsCacheState.initialized;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState('Showcase');
  const [colorTheme, setColorTheme] = useState('Brand Colors');
  const [catalogFormat, setCatalogFormat] = useState('Square');
  const [showPrices, setShowPrices] = useState(true);
  const [showProductNames, setShowProductNames] = useState(true);
  const [catalogGenerating, setCatalogGenerating] = useState(false);
  const [catalogResult, setCatalogResult] = useState<GenerateImageResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogKept, setCatalogKept] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void productsCache.ensureLoaded({});
    }, [])
  );

  useEffect(() => {
    if (!shopProfile) return;
    const allKeys = deriveContextItems(shopProfile, tr).map((i) => i.key);
    setCatalogContextFields(allKeys);
    setAnnoContextFields(allKeys);
  }, [shopProfile]);

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCatalogGenerate() {
    const chosen = products.filter((p) => selected.has(p.id));
    if (!chosen.length) return;
    setCatalogGenerating(true);
    setCatalogError(null);
    setCatalogResult(null);
    setCatalogKept(false);
    try {
      const productsWithImages = await Promise.all(
        chosen.map(async (p) => ({
          name: p.name,
          price: p.price,
          currency: p.currency,
          imageBase64: await loadProductImageBase64(p.id),
        }))
      );
      const catalogCurrency = chosen[0].currency;
      setCatalogResult(
        await generateCatalogImage({
          products: productsWithImages,
          layout,
          colorTheme,
          format: catalogFormat,
          showPrices,
          brandContextFields: catalogContextFields.length > 0 ? catalogContextFields : undefined,
          currency: catalogCurrency,
        })
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCatalogGenerating(false);
    }
  }

  async function handleGenerateWallpaper() {
    setWallpaperGenGenerating(true);
    setWallpaperError(null);
    try {
      const res = await generateWallpaper({
        prompt: wallpaperPrompt.trim(),
        format: wallpaperGenFormat,
        includeLogo: wallpaperGenIncludeLogo,
        brandContextFields: wallpaperGenBrandFields,
      });
      setWallpaperGenResult(res);
      setWallpaperGenKept(false);
      setWallpaperGenModalStage('result');
    } catch (err) {
      setWallpaperError(err instanceof Error ? err.message : 'Failed to generate wallpaper.');
    } finally {
      setWallpaperGenGenerating(false);
    }
  }

  function handleCloseWallpaperGenModal() {
    if (wallpaperGenGenerating) return;
    setWallpaperGenModalVisible(false);
    setWallpaperGenModalStage('input');
    setWallpaperGenResult(null);
    setWallpaperGenKept(false);
    setWallpaperError(null);
    setWallpaperPrompt('');
  }

  function toggleWallpaperGenBrandField(key: string) {
    setWallpaperGenBrandFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleImportWallpaper() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      base64: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setWallpaperBase64(result.assets[0].base64);
      setWallpaperStage('confirmed');
      setWallpaperOnResult(null);
      setWallpaperOnError(null);
      setPlacementZone(DEFAULT_PLACEMENT_ZONE);
    }
  }

  async function handleWallpaperOnGenerate() {
    const chosen = products.filter((p) => selected.has(p.id));
    if (!chosen.length || !wallpaperBase64) return;
    setWallpaperOnGenerating(true);
    setWallpaperOnError(null);
    setWallpaperOnResult(null);
    setWallpaperOnKept(false);
    try {
      const productsWithImages = await Promise.all(
        chosen.map(async (p) => ({
          name: p.name,
          price: p.price,
          currency: p.currency,
          imageBase64: await loadProductImageBase64(p.id),
        }))
      );
      setWallpaperOnResult(
        await generateCatalogOnWallpaper({
          products: productsWithImages,
          wallpaperBase64,
          layout,
          showPrices,
          showProductNames,
          textStyle,
          placementZone,
        })
      );
    } catch (err) {
      setWallpaperOnError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setWallpaperOnGenerating(false);
    }
  }

  function openWallpaperPicker() {
    setWallpaperPickerVisible(true);
    setWallpaperPickerLoading(true);
    fetchGallery({ types: ['wallpaper'], pageSize: 12 })
      .then((res) => setWallpaperPickerItems(res.items))
      .catch(() => setWallpaperPickerItems([]))
      .finally(() => setWallpaperPickerLoading(false));
  }

  async function pickWallpaperFromLibrary(item: GalleryItem) {
    try {
      const bytes = await fetchGalleryImage(item.id);
      galleryImageCache.prime(item.id, bytes.imageBase64, bytes.mimeType);
      setWallpaperBase64(bytes.imageBase64);
      setWallpaperStage('confirmed');
      setWallpaperOnResult(null);
      setWallpaperOnError(null);
      setWallpaperPickerVisible(false);
      setPlacementZone(DEFAULT_PLACEMENT_ZONE);
    } catch (err) {
      setWallpaperError(err instanceof Error ? err.message : 'Failed to load wallpaper.');
    }
  }

  // ── Announcements state ──────────────────────────────────────────────────────
  const [postType, setPostType] = useState<PostType>('Announcement');
  const [content, setContent] = useState('');
  const [tone, setTone] = useState('Professional');
  const [annoFormat, setAnnoFormat] = useState('Square');
  const [annoGenerating, setAnnoGenerating] = useState(false);
  const [annoResult, setAnnoResult] = useState<GenerateImageResponse | null>(null);
  const [annoError, setAnnoError] = useState<string | null>(null);
  const [annoKept, setAnnoKept] = useState(false);
  const [promotionSelected, setPromotionSelected] = useState<Set<string>>(new Set());

  // Job Post sub-form state
  const [jobTitle, setJobTitle] = useState('');
  const [jobSchedule, setJobSchedule] = useState('');
  const [jobSalary, setJobSalary] = useState('');
  const [jobImageStyle, setJobImageStyle] = useState<'with-person' | 'text-only'>('text-only');
  const [jobRequirementsText, setJobRequirementsText] = useState('');

  const isJobPost = postType === 'Job Post';
  const jobPostReady = jobTitle.trim().length > 0 && jobSchedule.trim().length > 0;
  const annoReady = isJobPost ? jobPostReady : content.trim().length > 0;

  // ── Brand context state ──────────────────────────────────────────────────────
  const [catalogContextFields, setCatalogContextFields] = useState<string[]>([]);
  const [annoContextFields, setAnnoContextFields] = useState<string[]>([]);

  // ── Keep-image modal (shared across generators) ──────────────────────────────
  const [pendingKeep, setPendingKeep] = useState<{
    imageBase64: string;
    mimeType: string;
    generationType: GenerationType;
    defaultName: string;
    onSaved: () => void;
  } | null>(null);

  const requestKeep = useCallback(
    (params: {
      imageBase64: string;
      mimeType: string;
      generationType: GenerationType;
      defaultName: string;
      onSaved: () => void;
    }) => {
      setPendingKeep(params);
    },
    []
  );

  const handleKeepConfirm = useCallback(
    async (name: string) => {
      if (!pendingKeep) return;
      const saved = await saveToGallery(
        pendingKeep.imageBase64,
        pendingKeep.mimeType,
        pendingKeep.generationType,
        name
      );
      galleryImageCache.prime(saved.id, pendingKeep.imageBase64, pendingKeep.mimeType);
      galleryCache.addItem(saved);
      pendingKeep.onSaved();
      setPendingKeep(null);
    },
    [pendingKeep]
  );

  const autoKeepName = useCallback(
    (label: string) => `${label} ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
    []
  );

  const postTypeToGenType = useCallback((pt: PostType): GenerationType => {
    if (pt === 'Job Post') return 'job-post';
    if (pt === 'Promotion') return 'promotion';
    return 'announcement';
  }, []);

  const contextItems = useMemo(
    () => (shopProfile ? deriveContextItems(shopProfile, tr) : []),
    [shopProfile, tr]
  );

  const toggleCatalogField = useCallback((key: string) => {
    setCatalogContextFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const toggleAnnoField = useCallback((key: string) => {
    setAnnoContextFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const togglePromotionProduct = useCallback((id: string) => {
    setPromotionSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (postType !== 'Promotion') setPromotionSelected(new Set());
  }, [postType]);

  async function handleAnnoGenerate() {
    if (!annoReady) return;
    setAnnoGenerating(true);
    setAnnoError(null);
    setAnnoResult(null);
    setAnnoKept(false);
    try {
      const promotionProductImages =
        postType === 'Promotion' && promotionSelected.size > 0
          ? (
              await Promise.all(
                products
                  .filter((p) => promotionSelected.has(p.id))
                  .map((p) => loadProductImageBase64(p.id))
              )
            ).filter((b64): b64 is string => !!b64)
          : undefined;

      const jobRequirementsList = isJobPost
        ? jobRequirementsText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        : [];

      setAnnoResult(
        await generateAnnouncementImage({
          postType,
          content: content.trim(),
          tone,
          format: annoFormat,
          brandContextFields: annoContextFields.length > 0 ? annoContextFields : undefined,
          productImages: promotionProductImages,
          jobTitle: isJobPost ? jobTitle.trim() : undefined,
          jobSchedule: isJobPost ? jobSchedule.trim() : undefined,
          jobSalary: isJobPost && jobSalary.trim().length > 0 ? jobSalary.trim() : undefined,
          jobImageStyle: isJobPost ? jobImageStyle : undefined,
          jobRequirements:
            isJobPost && jobRequirementsList.length > 0 ? jobRequirementsList : undefined,
        })
      );
    } catch (err) {
      setAnnoError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAnnoGenerating(false);
    }
  }

  // ── Video WIP animation ──────────────────────────────────────────────────────
  const floatY = useSharedValue(0);
  useEffect(() => {
    floatY.value = withRepeat(withTiming(-12, { duration: 1800 }), -1, true);
  }, [floatY]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  const selectedCount = selected.size;
  const currentPostType = POST_TYPES.find((t) => t.type === postType)!;

  // ── Product card width ───────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────────────────
  // DESKTOP LAYOUT
  // ────────────────────────────────────────────────────────────────────────────
  if (isDesktop) {
    // ── Sidebar options per tab ──────────────────────────────────────────────
    const sidebarOptions =
      activeTab === 'catalog' ? (
        catalogMode === 'generate' ? (
          <>
            <SectionLabel label={t('studio.generationOptions')} />
            <OptionLabel label={t('studio.opt.layout')} />
            <SidebarOptionGroup options={LAYOUT_OPTIONS} selected={layout} onSelect={setLayout} />
            <OptionLabel label={t('studio.opt.colorTheme')} />
            <SidebarOptionGroup
              options={COLOR_OPTIONS}
              selected={colorTheme}
              onSelect={setColorTheme}
            />
            <OptionLabel label={t('studio.opt.format')} />
            <SidebarOptionGroup
              options={FORMAT_OPTIONS}
              selected={catalogFormat}
              onSelect={setCatalogFormat}
            />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('studio.showPrices')}</Text>
              <Switch
                value={showPrices}
                onValueChange={setShowPrices}
                thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            <BrandContextSection
              items={contextItems}
              selected={catalogContextFields}
              onToggle={toggleCatalogField}
            />
          </>
        ) : (
          <>
            <SectionLabel label={t('studio.placementOptions')} />
            <OptionLabel label={t('studio.opt.layout')} />
            <SidebarOptionGroup options={LAYOUT_OPTIONS} selected={layout} onSelect={setLayout} />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('studio.showProductNames')}</Text>
              <Switch
                value={showProductNames}
                onValueChange={setShowProductNames}
                thumbColor={showProductNames ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('studio.showPrices')}</Text>
              <Switch
                value={showPrices}
                onValueChange={setShowPrices}
                thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            <TextStylePresetPicker
              selectedId={selectedPresetId}
              onSelect={setSelectedPresetId}
              selectedColor={selectedColor}
              onColorChange={setSelectedColor}
              colors={colors}
            />
          </>
        )
      ) : activeTab === 'announcements' ? (
        <>
          <SectionLabel label={t('studio.styleOptions')} />
          <OptionLabel label={t('studio.opt.tone')} />
          <SidebarOptionGroup options={TONE_OPTIONS} selected={tone} onSelect={setTone} />
          <OptionLabel label={t('studio.opt.format')} />
          <SidebarOptionGroup
            options={FORMAT_OPTIONS}
            selected={annoFormat}
            onSelect={setAnnoFormat}
          />
          <BrandContextSection
            items={contextItems}
            selected={annoContextFields}
            onToggle={toggleAnnoField}
          />
        </>
      ) : null;

    const sidebarFooter =
      activeTab === 'catalog' ? (
        catalogMode === 'generate' ? (
          <GenerateButton
            loading={catalogGenerating}
            disabled={selectedCount === 0}
            label={
              selectedCount === 0 ? t('studio.selectProductsFirst') : t('studio.generateCatalog')
            }
            onPress={handleCatalogGenerate}
          />
        ) : (
          <GenerateButton
            loading={wallpaperOnGenerating}
            disabled={selectedCount === 0 || wallpaperBase64 === null}
            label={
              wallpaperBase64 === null
                ? t('studio.pickWallpaperFirst')
                : selectedCount === 0
                  ? t('studio.selectProductsFirst')
                  : t('studio.placeOnWallpaper')
            }
            onPress={handleWallpaperOnGenerate}
          />
        )
      ) : activeTab === 'announcements' ? (
        <GenerateButton
          loading={annoGenerating}
          disabled={!annoReady}
          label={t('studio.generateGraphic')}
          onPress={handleAnnoGenerate}
        />
      ) : null;

    // ── Right panel content per tab ──────────────────────────────────────────
    const rightContent =
      activeTab === 'catalog' ? (
        <>
          {/* Catalog mode sub-tab bar */}
          <View style={styles.desktopSection}>
            <View style={styles.segmentTrack}>
              <Animated.View
                style={[styles.segmentIndicator, { width: '48%', left: catalogModeIndicatorLeft }]}
              />
              {(['generate', 'on-wallpaper'] as CatalogMode[]).map((mode) => {
                const isActive = catalogMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={styles.segmentButton}
                    onPress={() => switchCatalogMode(mode)}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={
                        mode === 'generate'
                          ? isActive
                            ? 'sparkles'
                            : 'sparkles-outline'
                          : isActive
                            ? 'image'
                            : 'image-outline'
                      }
                      size={14}
                      color={isActive ? '#fff' : colors.text.secondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                      {mode === 'generate' ? t('studio.generate') : t('studio.onWallpaperTab')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {catalogMode === 'generate' ? (
            <>
              {/* Product picker */}
              <ChooseProductsSection
                subtitle={t('studio.subtitleCatalog')}
                isDesktop
                products={products}
                loadingProducts={loadingProducts}
                selectedCount={selectedCount}
                selected={selected}
                toggleProduct={toggleProduct}
                colors={colors}
                styles={styles}
                showProducts
              />

              {/* Preview */}
              <View style={styles.desktopSection}>
                <Text style={styles.desktopSectionTitle}>{t('studio.preview')}</Text>
                <Text style={styles.desktopSectionSub}>{t('studio.catalogPreviewSub')}</Text>
                <View style={{ marginTop: D.spacing.md }}>
                  <ResultPreviewPanel
                    result={catalogResult}
                    generating={catalogGenerating}
                    error={catalogError}
                    emptyTitle={t('studio.previewEmptyCatalog')}
                    emptyHint={t('studio.hintCatalog')}
                    filename="catalog"
                    onKeep={() => {
                      if (!catalogResult) return;
                      requestKeep({
                        imageBase64: catalogResult.imageBase64,
                        mimeType: catalogResult.mimeType,
                        generationType: 'catalog',
                        defaultName: autoKeepName('Catalog'),
                        onSaved: () => setCatalogKept(true),
                      });
                    }}
                    isKept={catalogKept}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Product picker */}
              <ChooseProductsSection
                subtitle={t('studio.subtitleWallpaper')}
                isDesktop
                products={products}
                loadingProducts={loadingProducts}
                selectedCount={selectedCount}
                selected={selected}
                toggleProduct={toggleProduct}
                colors={colors}
                styles={styles}
                showProducts
              />

              {/* Wallpaper picker */}
              <View style={styles.desktopSection}>
                <Text style={styles.desktopSectionTitle}>{t('studio.backgroundWallpaper')}</Text>
                <Text style={styles.desktopSectionSub}>{t('studio.wallpaperImportSub')}</Text>

                <View style={[styles.wallpaperActionRow, { marginTop: D.spacing.md }]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperActionBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={handleImportWallpaper}
                    accessibilityRole="button"
                  >
                    <Ionicons name="image-outline" size={16} color={colors.accent.primary} />
                    <Text style={styles.wallpaperActionText}>{t('studio.import')}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperActionBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => setWallpaperGenModalVisible(true)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="sparkles-outline" size={16} color={colors.accent.primary} />
                    <Text style={styles.wallpaperActionText}>{t('studio.generate')}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperActionBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={openWallpaperPicker}
                    accessibilityRole="button"
                  >
                    <Ionicons name="albums-outline" size={16} color={colors.accent.primary} />
                    <Text style={styles.wallpaperActionText}>{t('studio.myWallpapers')}</Text>
                  </Pressable>
                </View>

                {wallpaperError && (
                  <Text style={[styles.errorText, { marginTop: D.spacing.sm }]}>
                    {wallpaperError}
                  </Text>
                )}

                {/* Preview candidate — keep or discard */}
                {wallpaperStage === 'preview' && wallpaperPreview && (
                  <View style={styles.wallpaperPreviewBox}>
                    <Image
                      source={{
                        uri: wallpaperPreview.startsWith('data:')
                          ? wallpaperPreview
                          : `data:image/png;base64,${wallpaperPreview}`,
                      }}
                      style={styles.wallpaperPreviewImage}
                      resizeMode="cover"
                      accessibilityLabel={t('studio.a11y.generatedWallpaperPreview')}
                    />
                    <View style={styles.wallpaperPreviewActions}>
                      <Pressable
                        style={[
                          styles.wallpaperConfirmBtn,
                          { backgroundColor: colors.accent.primary },
                        ]}
                        onPress={() => {
                          setWallpaperBase64(wallpaperPreview);
                          setWallpaperStage('confirmed');
                          setWallpaperPreview(null);
                          setPlacementZone(DEFAULT_PLACEMENT_ZONE);
                          const b64 = wallpaperPreview.startsWith('data:')
                            ? wallpaperPreview.split(',')[1]
                            : wallpaperPreview;
                          requestKeep({
                            imageBase64: b64,
                            mimeType: 'image/png',
                            generationType: 'wallpaper',
                            defaultName: autoKeepName('Wallpaper'),
                            onSaved: () => {},
                          });
                        }}
                        accessibilityRole="button"
                      >
                        <Ionicons name="checkmark" size={15} color="#fff" />
                        <Text style={styles.wallpaperConfirmBtnText}>{t('studio.keep')}</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.wallpaperConfirmBtn,
                          {
                            backgroundColor: colors.bg.elevated,
                            borderWidth: 1,
                            borderColor: colors.border.default,
                          },
                        ]}
                        onPress={() => {
                          setWallpaperPreview(null);
                          setWallpaperStage('none');
                        }}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close" size={15} color={colors.text.secondary} />
                        <Text
                          style={[styles.wallpaperConfirmBtnText, { color: colors.text.secondary }]}
                        >
                          Discard
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.wallpaperConfirmBtn,
                          {
                            backgroundColor: colors.bg.elevated,
                            borderWidth: 1,
                            borderColor: colors.border.default,
                          },
                        ]}
                        onPress={handleGenerateWallpaper}
                        accessibilityRole="button"
                      >
                        <Ionicons name="refresh-outline" size={15} color={colors.text.secondary} />
                        <Text
                          style={[styles.wallpaperConfirmBtnText, { color: colors.text.secondary }]}
                        >
                          Retry
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Confirmed wallpaper thumbnail */}
                {wallpaperStage === 'confirmed' && wallpaperBase64 && (
                  <View style={styles.wallpaperConfirmedRow}>
                    <Image
                      source={{
                        uri: wallpaperBase64.startsWith('data:')
                          ? wallpaperBase64
                          : `data:image/png;base64,${wallpaperBase64}`,
                      }}
                      style={styles.wallpaperThumb}
                      resizeMode="cover"
                      accessibilityLabel={t('studio.a11y.selectedWallpaper')}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: D.fontSize.sm,
                          color: colors.text.primary,
                          fontWeight: D.fontWeight.medium,
                        }}
                      >
                        Wallpaper selected
                      </Text>
                      <Pressable
                        onPress={() => {
                          setWallpaperBase64(null);
                          setWallpaperStage('none');
                          setWallpaperOnResult(null);
                          setWallpaperOnError(null);
                          setPlacementZone(DEFAULT_PLACEMENT_ZONE);
                        }}
                        accessibilityRole="button"
                      >
                        <Text
                          style={{
                            fontSize: D.fontSize.xs,
                            color: colors.accent.primary,
                            marginTop: 2,
                          }}
                        >
                          Change
                        </Text>
                      </Pressable>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                  </View>
                )}

                {/* Placement zone editor */}
                {wallpaperStage === 'confirmed' && wallpaperBase64 && (
                  <PlacementZoneEditor
                    wallpaperBase64={wallpaperBase64}
                    outputAspectRatio={wallpaperAspectRatio}
                    zone={placementZone}
                    onChange={setPlacementZone}
                  />
                )}
              </View>

              {/* Result */}
              <View style={styles.desktopSection}>
                <Text style={styles.desktopSectionTitle}>{t('studio.result')}</Text>
                <Text style={styles.desktopSectionSub}>{t('studio.wallpaperResultSub')}</Text>
                <View style={{ marginTop: D.spacing.md }}>
                  <ResultPreviewPanel
                    result={wallpaperOnResult}
                    generating={wallpaperOnGenerating}
                    error={wallpaperOnError}
                    emptyTitle={t('studio.previewResult')}
                    emptyHint={t('studio.hintWallpaper')}
                    filename="wallpaper-composite"
                    onKeep={() => {
                      if (!wallpaperOnResult) return;
                      requestKeep({
                        imageBase64: wallpaperOnResult.imageBase64,
                        mimeType: wallpaperOnResult.mimeType,
                        generationType: 'catalog-on-wallpaper',
                        defaultName: autoKeepName('Catalog on Wallpaper'),
                        onSaved: () => setWallpaperOnKept(true),
                      });
                    }}
                    isKept={wallpaperOnKept}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            </>
          )}
        </>
      ) : activeTab === 'announcements' ? (
        <>
          {/* Post type + content */}
          <View style={styles.desktopSection}>
            <Text style={styles.desktopSectionTitle}>{t('studio.announcement.postType')}</Text>
            <Text style={styles.desktopSectionSub}>{t('studio.postTypeHint')}</Text>
            <View style={[styles.typeRow, { marginTop: D.spacing.md }]}>
              {POST_TYPES.map(({ type, label, icon }) => {
                const active = postType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setPostType(type)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={icon}
                      size={15}
                      color={active ? colors.accent.primary : colors.text.muted}
                    />
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {postType === 'Promotion' && (
            <ChooseProductsSection
              subtitle={t('studio.subtitleAnnouncement')}
              isDesktop
              products={products}
              loadingProducts={loadingProducts}
              selectedCount={promotionSelected.size}
              selected={promotionSelected}
              toggleProduct={togglePromotionProduct}
              colors={colors}
              styles={styles}
              showProducts={false}
            />
          )}
          {isJobPost ? (
            <View style={styles.desktopSection}>
              <Text style={styles.desktopSectionTitle}>{t('studio.jobDetails')}</Text>
              <Text style={styles.desktopSectionSub}>{t('studio.jobDetailsSub')}</Text>
              <OptionLabel label={t('studio.opt.jobTitle')} />
              <TextInput
                style={styles.jobInput}
                placeholder={t('studio.announcement.jobTitlePlaceholderCashier')}
                placeholderTextColor={colors.text.muted}
                value={jobTitle}
                onChangeText={setJobTitle}
                editable={!annoGenerating}
              />
              <OptionLabel label={t('studio.opt.jobSchedule')} />
              <TextInput
                style={styles.jobInput}
                placeholder={t('studio.announcement.jobSchedulePlaceholder')}
                placeholderTextColor={colors.text.muted}
                value={jobSchedule}
                onChangeText={setJobSchedule}
                editable={!annoGenerating}
              />
              <OptionLabel label={t('studio.opt.jobSalary')} />
              <TextInput
                style={styles.jobInput}
                placeholder={t('studio.announcement.jobSalaryPlaceholder')}
                placeholderTextColor={colors.text.muted}
                value={jobSalary}
                onChangeText={setJobSalary}
                editable={!annoGenerating}
              />
              <OptionLabel label={t('studio.opt.jobRequirements')} />
              <TextInput
                style={styles.jobTextArea}
                placeholder={"Driver's license\nCommunication skills\nResponsibility"}
                placeholderTextColor={colors.text.muted}
                value={jobRequirementsText}
                onChangeText={setJobRequirementsText}
                multiline
                editable={!annoGenerating}
              />
              <OptionLabel label={t('studio.opt.jobImageStyle')} />
              <ChipSelector
                options={JOB_IMAGE_STYLE_OPTIONS}
                selected={jobImageStyle}
                onSelect={(v) => setJobImageStyle(v as 'with-person' | 'text-only')}
                accessibilityLabel={t('studio.a11y.jobImageStyle')}
              />
              <OptionLabel label={t('studio.opt.additionalDirection')} />
              <TextInput
                style={styles.jobTextArea}
                placeholder={'e.g. "Apply by email at jobs@example.com" or "Call 555-1234"'}
                placeholderTextColor={colors.text.muted}
                value={content}
                onChangeText={setContent}
                multiline
                editable={!annoGenerating}
              />
            </View>
          ) : (
            <View style={styles.desktopSection}>
              <Text style={styles.desktopSectionTitle}>{t('studio.contentSection')}</Text>
              <Text style={styles.desktopSectionSub}>{t('studio.announcement.describe')}</Text>
              <TextInput
                style={[styles.textArea, { marginTop: D.spacing.md }]}
                placeholder={currentPostType.placeholder}
                placeholderTextColor={colors.text.muted}
                value={content}
                onChangeText={setContent}
                multiline
                editable={!annoGenerating}
              />
            </View>
          )}

          {/* Preview */}
          <View style={styles.desktopSection}>
            <Text style={styles.desktopSectionTitle}>{t('studio.preview')}</Text>
            <Text style={styles.desktopSectionSub}>{t('studio.previewEmptyAnnouncement')}</Text>
            <View style={{ marginTop: D.spacing.md }}>
              <ResultPreviewPanel
                result={annoResult}
                generating={annoGenerating}
                error={annoError}
                emptyTitle={t('studio.previewGraphic')}
                emptyHint={t('studio.hintAnnouncement')}
                filename="announcement"
                onKeep={() => {
                  if (!annoResult) return;
                  requestKeep({
                    imageBase64: annoResult.imageBase64,
                    mimeType: annoResult.mimeType,
                    generationType: postTypeToGenType(postType),
                    defaultName: autoKeepName(postType),
                    onSaved: () => setAnnoKept(true),
                  });
                }}
                isKept={annoKept}
                colors={colors}
                styles={styles}
              />
            </View>
          </View>
        </>
      ) : (
        // Video WIP
        <View style={styles.videoWip}>
          <ReAnimated.View style={floatStyle}>
            <Ionicons
              name="film-outline"
              size={80}
              color={colors.accent.primary}
              style={{ opacity: 0.6 }}
            />
          </ReAnimated.View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>{t('studio.comingSoon')}</Text>
          </View>
          <Text style={styles.videoTitle}>{t('studio.videoAdsTitle')}</Text>
          <Text style={styles.videoDescription}>{t('studio.videoBody')}</Text>
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>{t('studio.videoWhatsComing')}</Text>
            {(
              [
                { icon: 'film-outline', label: t('studio.videoStep1') },
                { icon: 'sparkles-outline', label: t('studio.videoStep2') },
                { icon: 'cloud-upload-outline', label: t('studio.videoStep3') },
              ] as { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[]
            ).map(({ icon, label }, i) => (
              <View key={label} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Ionicons name={icon} size={16} color={colors.text.muted} />
                <Text style={styles.stepLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      );

    return (
      <>
        <View style={styles.desktopRoot}>
          {/* ── LEFT SIDEBAR ── */}
          <View style={styles.sidebar}>
            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>{t('studio.title')}</Text>
                <Text style={styles.sidebarSubtitle}>{t('studio.subtitle')}</Text>
              </View>

              {/* Vertical tab nav */}
              <SectionLabel label={t('studio.title')} />
              <View style={styles.verticalNav}>
                {TAB_META.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      style={[styles.navItem, active && styles.navItemActive]}
                      onPress={() => switchTab(tab.key)}
                      accessibilityRole="button"
                    >
                      <View style={[styles.navIconBox, active && styles.navIconBoxActive]}>
                        <Ionicons
                          name={active ? tab.iconFilled : tab.icon}
                          size={17}
                          color={active ? '#fff' : colors.text.muted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                          {TAB_META_I18N[tab.key].label}
                        </Text>
                        <Text style={styles.navDesc}>{TAB_META_I18N[tab.key].desc}</Text>
                      </View>
                      {tab.comingSoon && (
                        <View style={styles.navBadge}>
                          <Text style={styles.navBadgeText}>{t('gallery.videoBadge')}</Text>
                        </View>
                      )}
                      {active && !tab.comingSoon && (
                        <Ionicons name="chevron-forward" size={14} color={colors.accent.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Tab-specific options */}
              {sidebarOptions}
            </ScrollView>

            {/* Sticky footer */}
            {sidebarFooter && <View style={styles.sidebarFooter}>{sidebarFooter}</View>}
          </View>

          {/* ── PANEL DIVIDER ── */}
          <View style={styles.panelDivider} />

          {/* ── RIGHT PANEL ── */}
          <ScrollView
            style={styles.rightPanel}
            contentContainerStyle={styles.rightPanelContent}
            showsVerticalScrollIndicator={false}
          >
            {rightContent}
          </ScrollView>
        </View>

        {/* Wallpaper generate modal (desktop) */}
        <Modal
          visible={wallpaperGenModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseWallpaperGenModal}
        >
          <Pressable
            style={styles.wallpaperGenOverlay}
            onPress={isWeb ? () => {} : handleCloseWallpaperGenModal}
          >
            <View
              style={styles.wallpaperGenSheet}
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => {}}
            >
              <Pressable
                style={styles.wallpaperGenCloseBtn}
                onPress={handleCloseWallpaperGenModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </Pressable>

              {wallpaperGenModalStage === 'input' ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.wallpaperGenScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.wallpaperGenTitle}>{t('wallpapers.modal.title')}</Text>
                  <Text style={styles.wallpaperGenSubtitle}>
                    {t('studio.wallpaperModal.subtitle')}
                  </Text>

                  <Text style={styles.wallpaperGenSectionLabel}>
                    {t('wallpapers.modal.format')}
                  </Text>
                  <View style={styles.wallpaperGenFormatRow}>
                    {(
                      [
                        { value: '9:16', label: t('studio.wallpaperModal.verticalAspect') },
                        { value: '1:1', label: t('studio.wallpaperModal.squareAspect') },
                        { value: '4:5', label: t('studio.wallpaperModal.portraitAspect') },
                      ] as const
                    ).map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={[
                          styles.wallpaperGenFormatPill,
                          wallpaperGenFormat === opt.value && styles.wallpaperGenFormatPillActive,
                        ]}
                        onPress={() => setWallpaperGenFormat(opt.value)}
                        disabled={wallpaperGenGenerating}
                      >
                        <Text
                          style={[
                            styles.wallpaperGenFormatPillText,
                            wallpaperGenFormat === opt.value &&
                              styles.wallpaperGenFormatPillTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text
                          style={[
                            styles.wallpaperGenFormatPillRatio,
                            wallpaperGenFormat === opt.value &&
                              styles.wallpaperGenFormatPillTextActive,
                          ]}
                        >
                          {opt.value}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.wallpaperGenSectionLabel}>Style prompt (optional)</Text>
                  <TextInput
                    style={styles.wallpaperGenInput}
                    placeholder={t('studio.wallpaper.promptPlaceholder')}
                    placeholderTextColor={colors.text.muted}
                    value={wallpaperPrompt}
                    onChangeText={setWallpaperPrompt}
                    multiline
                    editable={!wallpaperGenGenerating}
                  />

                  <View style={styles.wallpaperGenToggleRow}>
                    <View>
                      <Text style={styles.wallpaperGenToggleLabel}>
                        {t('wallpapers.modal.includeLogo')}
                      </Text>
                      <Text style={styles.wallpaperGenToggleHint}>
                        Place your brand logo in the header
                      </Text>
                    </View>
                    <Switch
                      value={wallpaperGenIncludeLogo}
                      onValueChange={setWallpaperGenIncludeLogo}
                      disabled={wallpaperGenGenerating}
                      trackColor={{ true: colors.accent.primary }}
                    />
                  </View>

                  <Text style={styles.wallpaperGenSectionLabel}>
                    {t('wallpapers.modal.includeBrand')}
                  </Text>
                  <View>
                    {(
                      [
                        { key: 'brandName', label: 'Brand Name' },
                        { key: 'slogan', label: 'Slogan' },
                        { key: 'brandColors', label: 'Brand Colors' },
                        { key: 'businessDomain', label: 'Business Domain' },
                        { key: 'shopType', label: 'Shop Type' },
                        { key: 'targetAudience', label: 'Target Audience' },
                        { key: 'phoneNumber', label: 'Phone Number' },
                        { key: 'email', label: 'Email' },
                        { key: 'addresses', label: 'Address' },
                        { key: 'instagramHandle', label: 'Instagram' },
                        { key: 'facebookHandle', label: 'Facebook' },
                        { key: 'tikTokHandle', label: 'TikTok' },
                      ] as const
                    ).map((opt) => {
                      const checked = wallpaperGenBrandFields.includes(opt.key);
                      return (
                        <Pressable
                          key={opt.key}
                          style={({ pressed }) => [
                            styles.wallpaperGenCheckRow,
                            pressed && { opacity: 0.7 },
                          ]}
                          onPress={() => toggleWallpaperGenBrandField(opt.key)}
                          disabled={wallpaperGenGenerating}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={checked ? colors.accent.primary : colors.text.muted}
                          />
                          <Text style={styles.wallpaperGenCheckLabel}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {wallpaperError && <Text style={styles.wallpaperGenError}>{wallpaperError}</Text>}

                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperGenBtn2,
                      wallpaperGenGenerating && { opacity: 0.6 },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={handleGenerateWallpaper}
                    disabled={wallpaperGenGenerating}
                    accessibilityRole="button"
                  >
                    {wallpaperGenGenerating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="sparkles-outline" size={16} color="#fff" />
                    )}
                    <Text style={styles.wallpaperGenBtnText2}>
                      {wallpaperGenGenerating ? t('studio.generating') : t('studio.generate')}
                    </Text>
                  </Pressable>
                </ScrollView>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.wallpaperGenResultContainer}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.wallpaperGenTitle}>{t('wallpapers.result.title')}</Text>
                  <Text style={styles.wallpaperGenSubtitle}>
                    Keep it as your background or generate a new one
                  </Text>

                  {wallpaperGenResult && (
                    <Image
                      source={{
                        uri: `data:${wallpaperGenResult.mimeType};base64,${wallpaperGenResult.imageBase64}`,
                      }}
                      style={[
                        styles.wallpaperGenResultImage,
                        {
                          aspectRatio:
                            wallpaperGenFormat === '1:1'
                              ? 1
                              : wallpaperGenFormat === '4:5'
                                ? 4 / 5
                                : 9 / 16,
                        },
                      ]}
                      resizeMode="contain"
                      accessibilityLabel={t('studio.a11y.generatedWallpaper')}
                    />
                  )}

                  <View style={styles.wallpaperGenResultActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.wallpaperGenResultBtn,
                        {
                          backgroundColor: wallpaperGenKept
                            ? colors.accent.dim
                            : colors.accent.primary,
                        },
                        pressed && { opacity: 0.75 },
                      ]}
                      onPress={() => {
                        if (!wallpaperGenResult || wallpaperGenKept) return;
                        setWallpaperBase64(wallpaperGenResult.imageBase64);
                        setWallpaperStage('confirmed');
                        setWallpaperGenKept(true);
                        setPlacementZone(DEFAULT_PLACEMENT_ZONE);
                        setWallpaperGenModalVisible(false);
                        setWallpaperGenModalStage('input');
                        requestKeep({
                          imageBase64: wallpaperGenResult.imageBase64,
                          mimeType: wallpaperGenResult.mimeType,
                          generationType: 'wallpaper',
                          defaultName: autoKeepName('Wallpaper'),
                          onSaved: () => {},
                        });
                      }}
                      disabled={wallpaperGenKept}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={wallpaperGenKept ? 'checkmark-circle' : 'bookmark-outline'}
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.wallpaperGenResultBtnText}>
                        {wallpaperGenKept ? 'Saved' : 'Keep'}
                      </Text>
                    </Pressable>

                    {wallpaperGenResult && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.wallpaperGenResultBtn,
                          { backgroundColor: colors.accent.primary },
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={() => {
                          if (!wallpaperGenResult) return;
                          const ext = wallpaperGenResult.mimeType.split('/')[1] ?? 'png';
                          const a = document.createElement('a');
                          a.href = `data:${wallpaperGenResult.mimeType};base64,${wallpaperGenResult.imageBase64}`;
                          a.download = `wallpaper.${ext}`;
                          a.click();
                        }}
                        accessibilityRole="button"
                      >
                        <Ionicons name="download-outline" size={16} color="#fff" />
                        <Text style={styles.wallpaperGenResultBtnText}>{t('studio.download')}</Text>
                      </Pressable>
                    )}
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperGenSecondaryBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      setWallpaperGenResult(null);
                      setWallpaperGenModalStage('input');
                      setWallpaperError(null);
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name="refresh-outline" size={15} color={colors.text.secondary} />
                    <Text style={styles.wallpaperGenSecondaryBtnText}>
                      {t('studio.generateAgain')}
                    </Text>
                  </Pressable>
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>

        {/* Wallpaper picker modal (desktop) */}
        <Modal
          visible={wallpaperPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setWallpaperPickerVisible(false)}
        >
          <Pressable style={styles.pickerOverlay} onPress={() => setWallpaperPickerVisible(false)}>
            <Pressable style={styles.pickerDialog} onPress={() => {}}>
              {/* Dialog header */}
              <View style={styles.pickerHeader}>
                <View>
                  <Text style={styles.pickerTitle}>{t('studio.myWallpapers')}</Text>
                  <Text style={styles.pickerSubtitle}>{t('studio.wallpaper.pickFromGallery')}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.pickerClose, pressed && { opacity: 0.7 }]}
                  onPress={() => setWallpaperPickerVisible(false)}
                >
                  <Ionicons name="close" size={18} color={colors.text.secondary} />
                </Pressable>
              </View>

              {/* Content */}
              {wallpaperPickerLoading ? (
                <View style={styles.pickerEmpty}>
                  <ActivityIndicator size="large" color={colors.accent.primary} />
                </View>
              ) : wallpaperPickerItems.length === 0 ? (
                <View style={styles.pickerEmpty}>
                  <Ionicons
                    name="albums-outline"
                    size={40}
                    color={colors.text.muted}
                    style={{ marginBottom: D.spacing.sm }}
                  />
                  <Text style={styles.pickerEmptyText}>No wallpapers saved yet.</Text>
                  <Text style={styles.pickerEmptyHint}>
                    Generate wallpapers in the Wallpapers tab first.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={wallpaperPickerItems}
                  keyExtractor={(item) => item.id}
                  numColumns={4}
                  contentContainerStyle={{ padding: D.spacing.lg, gap: D.spacing.md }}
                  columnWrapperStyle={{ gap: D.spacing.md }}
                  renderItem={({ item }) => {
                    const dialogWidth = Math.min(screenWidth - 96, 960);
                    const thumbWidth = (dialogWidth - D.spacing.lg * 2 - D.spacing.md * 3) / 4;
                    return (
                      <Pressable
                        style={({ pressed }) => ({
                          width: thumbWidth,
                          aspectRatio: 9 / 16,
                          borderRadius: D.radius.md,
                          overflow: 'hidden',
                          opacity: pressed ? 0.85 : 1,
                          borderWidth: 1,
                          borderColor: colors.border.default,
                          backgroundColor: colors.bg.base,
                        })}
                        onPress={() => pickWallpaperFromLibrary(item)}
                      >
                        <GalleryImage
                          id={item.id}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="contain"
                        />
                      </Pressable>
                    );
                  }}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <KeepImageModal
          visible={pendingKeep !== null}
          defaultName={pendingKeep?.defaultName}
          onCancel={() => setPendingKeep(null)}
          onConfirm={handleKeepConfirm}
        />
      </>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MOBILE LAYOUT
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollBg}
        contentContainerStyle={styles.mobileContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mobileInner}>
          {/* Segmented control */}
          <View style={styles.segmentTrack}>
            <Animated.View style={[styles.segmentIndicator, { left: indicatorLeft }]} />
            {(['catalog', 'announcements', 'video'] as StudioTab[]).map((tab) => {
              const isActive = activeTab === tab;
              const meta = TAB_META.find((t) => t.key === tab)!;
              return (
                <Pressable
                  key={tab}
                  style={styles.segmentButton}
                  onPress={() => switchTab(tab)}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={isActive ? meta.iconFilled : meta.icon}
                    size={14}
                    color={isActive ? '#fff' : colors.text.secondary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {tab === 'catalog'
                      ? t('studio.tabCatalog')
                      : tab === 'announcements'
                        ? t('studio.tabAnnouncement')
                        : 'Video'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── CATALOG ── */}
          {activeTab === 'catalog' && (
            <>
              {/* Catalog mode sub-tab bar */}
              <View style={styles.segmentTrack}>
                <Animated.View
                  style={[
                    styles.segmentIndicator,
                    { width: '48%', left: catalogModeIndicatorLeft },
                  ]}
                />
                {(['generate', 'on-wallpaper'] as CatalogMode[]).map((mode) => {
                  const isActive = catalogMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={styles.segmentButton}
                      onPress={() => switchCatalogMode(mode)}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={
                          mode === 'generate'
                            ? isActive
                              ? 'sparkles'
                              : 'sparkles-outline'
                            : isActive
                              ? 'image'
                              : 'image-outline'
                        }
                        size={14}
                        color={isActive ? '#fff' : colors.text.secondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                        {mode === 'generate' ? t('studio.generate') : t('studio.onWallpaperTab')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {catalogMode === 'generate' ? (
                <>
                  <ChooseProductsSection
                    subtitle={t('studio.subtitleCatalog')}
                    isDesktop={false}
                    products={products}
                    loadingProducts={loadingProducts}
                    selectedCount={selectedCount}
                    selected={selected}
                    toggleProduct={toggleProduct}
                    colors={colors}
                    styles={styles}
                    showProducts
                  />

                  <View style={styles.mobileSection}>
                    <Text style={styles.sectionTitle}>{t('studio.generationOptions')}</Text>
                    <OptionLabel label={t('studio.opt.layout')} />
                    <ChipSelector
                      options={LAYOUT_OPTIONS}
                      selected={layout}
                      onSelect={setLayout}
                      accessibilityLabel={t('studio.opt.layout')}
                    />
                    <OptionLabel label={t('studio.opt.colorTheme')} />
                    <ChipSelector
                      options={COLOR_OPTIONS}
                      selected={colorTheme}
                      onSelect={setColorTheme}
                      accessibilityLabel={t('studio.opt.colorTheme')}
                    />
                    <OptionLabel label={t('studio.opt.format')} />
                    <ChipSelector
                      options={FORMAT_OPTIONS}
                      selected={catalogFormat}
                      onSelect={setCatalogFormat}
                      accessibilityLabel={t('studio.opt.format')}
                    />
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>{t('studio.showPrices')}</Text>
                      <Switch
                        value={showPrices}
                        onValueChange={setShowPrices}
                        thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                  </View>

                  {contextItems.length > 0 && (
                    <View style={styles.mobileSection}>
                      <BrandContextSection
                        items={contextItems}
                        selected={catalogContextFields}
                        onToggle={toggleCatalogField}
                      />
                    </View>
                  )}

                  <GenerateButton
                    loading={catalogGenerating}
                    disabled={selectedCount === 0}
                    label={
                      selectedCount === 0
                        ? t('studio.selectProductsToGenerate')
                        : t('studio.generateCatalog')
                    }
                    onPress={handleCatalogGenerate}
                  />

                  {catalogError && <Text style={styles.errorText}>{catalogError}</Text>}
                  {catalogResult && (
                    <View style={styles.mobileResultCard}>
                      <Image
                        source={{
                          uri: `data:${catalogResult.mimeType};base64,${catalogResult.imageBase64}`,
                        }}
                        style={styles.mobileResultImage}
                        resizeMode="contain"
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.downloadBtn,
                            {
                              backgroundColor: catalogKept
                                ? colors.accent.dim
                                : colors.accent.primary,
                            },
                            pressed && { opacity: 0.75 },
                          ]}
                          onPress={() => {
                            if (catalogKept) return;
                            requestKeep({
                              imageBase64: catalogResult.imageBase64,
                              mimeType: catalogResult.mimeType,
                              generationType: 'catalog',
                              defaultName: autoKeepName('Catalog'),
                              onSaved: () => setCatalogKept(true),
                            });
                          }}
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name={catalogKept ? 'checkmark-circle' : 'bookmark-outline'}
                            size={15}
                            color="#fff"
                          />
                          <Text style={styles.downloadBtnText}>
                            {catalogKept ? 'Saved' : 'Keep'}
                          </Text>
                        </Pressable>
                        {isWeb && (
                          <Pressable
                            style={({ pressed }) => [
                              styles.downloadBtn,
                              pressed && { opacity: 0.75 },
                            ]}
                            onPress={() => downloadImage(catalogResult, 'catalog')}
                            accessibilityRole="button"
                          >
                            <Ionicons name="download-outline" size={15} color="#fff" />
                            <Text style={styles.downloadBtnText}>{t('studio.download')}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {/* Products */}
                  <ChooseProductsSection
                    subtitle={t('studio.subtitleWallpaper')}
                    isDesktop={false}
                    products={products}
                    loadingProducts={loadingProducts}
                    selectedCount={selectedCount}
                    selected={selected}
                    toggleProduct={toggleProduct}
                    colors={colors}
                    styles={styles}
                    showProducts
                  />

                  {/* Wallpaper picker */}
                  <View style={styles.mobileSection}>
                    <Text style={styles.sectionTitle}>{t('studio.backgroundWallpaper')}</Text>
                    <Text
                      style={[
                        styles.emptyText,
                        { textAlign: 'left', marginTop: 4, marginBottom: D.spacing.sm },
                      ]}
                    >
                      Import or generate — your wallpaper stays unchanged
                    </Text>

                    <View style={styles.wallpaperActionRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.wallpaperActionBtn,
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={handleImportWallpaper}
                        accessibilityRole="button"
                      >
                        <Ionicons name="image-outline" size={15} color={colors.accent.primary} />
                        <Text style={styles.wallpaperActionText}>{t('studio.import')}</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.wallpaperActionBtn,
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={() => setWallpaperGenModalVisible(true)}
                        accessibilityRole="button"
                      >
                        <Ionicons name="sparkles-outline" size={15} color={colors.accent.primary} />
                        <Text style={styles.wallpaperActionText}>{t('studio.generate')}</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.wallpaperActionBtn,
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={openWallpaperPicker}
                        accessibilityRole="button"
                      >
                        <Ionicons name="albums-outline" size={15} color={colors.accent.primary} />
                        <Text style={styles.wallpaperActionText}>{t('studio.myWallpapers')}</Text>
                      </Pressable>
                    </View>

                    {wallpaperError && (
                      <Text style={[styles.errorText, { marginTop: D.spacing.sm }]}>
                        {wallpaperError}
                      </Text>
                    )}

                    {wallpaperStage === 'preview' && wallpaperPreview && (
                      <View style={styles.wallpaperPreviewBox}>
                        <Image
                          source={{
                            uri: wallpaperPreview.startsWith('data:')
                              ? wallpaperPreview
                              : `data:image/png;base64,${wallpaperPreview}`,
                          }}
                          style={styles.wallpaperPreviewImage}
                          resizeMode="cover"
                          accessibilityLabel={t('studio.a11y.generatedWallpaperPreview')}
                        />
                        <View style={styles.wallpaperPreviewActions}>
                          <Pressable
                            style={[
                              styles.wallpaperConfirmBtn,
                              { backgroundColor: colors.accent.primary },
                            ]}
                            onPress={() => {
                              setWallpaperBase64(wallpaperPreview);
                              setWallpaperStage('confirmed');
                              setWallpaperPreview(null);
                              setPlacementZone(DEFAULT_PLACEMENT_ZONE);
                              const b64 = wallpaperPreview.startsWith('data:')
                                ? wallpaperPreview.split(',')[1]
                                : wallpaperPreview;
                              requestKeep({
                                imageBase64: b64,
                                mimeType: 'image/png',
                                generationType: 'wallpaper',
                                defaultName: autoKeepName('Wallpaper'),
                                onSaved: () => {},
                              });
                            }}
                            accessibilityRole="button"
                          >
                            <Ionicons name="checkmark" size={14} color="#fff" />
                            <Text style={styles.wallpaperConfirmBtnText}>{t('studio.keep')}</Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.wallpaperConfirmBtn,
                              {
                                backgroundColor: colors.bg.elevated,
                                borderWidth: 1,
                                borderColor: colors.border.default,
                              },
                            ]}
                            onPress={() => {
                              setWallpaperPreview(null);
                              setWallpaperStage('none');
                            }}
                            accessibilityRole="button"
                          >
                            <Ionicons name="close" size={14} color={colors.text.secondary} />
                            <Text
                              style={[
                                styles.wallpaperConfirmBtnText,
                                { color: colors.text.secondary },
                              ]}
                            >
                              Discard
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.wallpaperConfirmBtn,
                              {
                                backgroundColor: colors.bg.elevated,
                                borderWidth: 1,
                                borderColor: colors.border.default,
                              },
                            ]}
                            onPress={handleGenerateWallpaper}
                            accessibilityRole="button"
                          >
                            <Ionicons
                              name="refresh-outline"
                              size={14}
                              color={colors.text.secondary}
                            />
                            <Text
                              style={[
                                styles.wallpaperConfirmBtnText,
                                { color: colors.text.secondary },
                              ]}
                            >
                              Retry
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {wallpaperStage === 'confirmed' && wallpaperBase64 && (
                      <View style={styles.wallpaperConfirmedRow}>
                        <Image
                          source={{
                            uri: wallpaperBase64.startsWith('data:')
                              ? wallpaperBase64
                              : `data:image/png;base64,${wallpaperBase64}`,
                          }}
                          style={styles.wallpaperThumb}
                          resizeMode="cover"
                          accessibilityLabel={t('studio.a11y.selectedWallpaper')}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: D.fontSize.sm,
                              color: colors.text.primary,
                              fontWeight: D.fontWeight.medium,
                            }}
                          >
                            Wallpaper selected
                          </Text>
                          <Pressable
                            onPress={() => {
                              setWallpaperBase64(null);
                              setWallpaperStage('none');
                              setWallpaperOnResult(null);
                              setWallpaperOnError(null);
                              setPlacementZone(DEFAULT_PLACEMENT_ZONE);
                            }}
                            accessibilityRole="button"
                          >
                            <Text
                              style={{
                                fontSize: D.fontSize.xs,
                                color: colors.accent.primary,
                                marginTop: 2,
                              }}
                            >
                              Change
                            </Text>
                          </Pressable>
                        </View>
                        <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                      </View>
                    )}

                    {/* Placement zone editor */}
                    {wallpaperStage === 'confirmed' && wallpaperBase64 && (
                      <PlacementZoneEditor
                        wallpaperBase64={wallpaperBase64}
                        outputAspectRatio={wallpaperAspectRatio}
                        zone={placementZone}
                        onChange={setPlacementZone}
                      />
                    )}
                  </View>

                  {/* Placement options */}
                  <View style={styles.mobileSection}>
                    <Text style={styles.sectionTitle}>{t('studio.placementOptions')}</Text>
                    <OptionLabel label={t('studio.opt.layout')} />
                    <ChipSelector
                      options={LAYOUT_OPTIONS}
                      selected={layout}
                      onSelect={setLayout}
                      accessibilityLabel={t('studio.opt.layout')}
                    />
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>{t('studio.showProductNames')}</Text>
                      <Switch
                        value={showProductNames}
                        onValueChange={setShowProductNames}
                        thumbColor={showProductNames ? colors.accent.primary : colors.text.muted}
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>{t('studio.showPrices')}</Text>
                      <Switch
                        value={showPrices}
                        onValueChange={setShowPrices}
                        thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                    <TextStylePresetPicker
                      selectedId={selectedPresetId}
                      onSelect={setSelectedPresetId}
                      selectedColor={selectedColor}
                      onColorChange={setSelectedColor}
                      colors={colors}
                    />
                  </View>

                  <GenerateButton
                    loading={wallpaperOnGenerating}
                    disabled={selectedCount === 0 || wallpaperBase64 === null}
                    label={
                      wallpaperBase64 === null
                        ? t('studio.pickWallpaperFirst')
                        : selectedCount === 0
                          ? t('studio.selectProductsFirst')
                          : t('studio.placeOnWallpaper')
                    }
                    onPress={handleWallpaperOnGenerate}
                  />

                  {wallpaperOnError && <Text style={styles.errorText}>{wallpaperOnError}</Text>}
                  {wallpaperOnResult && (
                    <View style={styles.mobileResultCard}>
                      <Image
                        source={{
                          uri: `data:${wallpaperOnResult.mimeType};base64,${wallpaperOnResult.imageBase64}`,
                        }}
                        style={styles.mobileResultImage}
                        resizeMode="contain"
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.downloadBtn,
                            {
                              backgroundColor: wallpaperOnKept
                                ? colors.accent.dim
                                : colors.accent.primary,
                            },
                            pressed && { opacity: 0.75 },
                          ]}
                          onPress={async () => {
                            if (wallpaperOnKept) return;
                            requestKeep({
                              imageBase64: wallpaperOnResult.imageBase64,
                              mimeType: wallpaperOnResult.mimeType,
                              generationType: 'catalog-on-wallpaper',
                              defaultName: autoKeepName('Catalog on Wallpaper'),
                              onSaved: () => setWallpaperOnKept(true),
                            });
                          }}
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name={wallpaperOnKept ? 'checkmark-circle' : 'bookmark-outline'}
                            size={15}
                            color="#fff"
                          />
                          <Text style={styles.downloadBtnText}>
                            {wallpaperOnKept ? 'Saved' : 'Keep'}
                          </Text>
                        </Pressable>
                        {isWeb && (
                          <Pressable
                            style={({ pressed }) => [
                              styles.downloadBtn,
                              pressed && { opacity: 0.75 },
                            ]}
                            onPress={() => downloadImage(wallpaperOnResult, 'wallpaper-composite')}
                            accessibilityRole="button"
                          >
                            <Ionicons name="download-outline" size={15} color="#fff" />
                            <Text style={styles.downloadBtnText}>{t('studio.download')}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {/* ── ANNOUNCEMENTS ── */}
          {activeTab === 'announcements' && (
            <>
              <View style={styles.mobileSection}>
                <Text style={styles.sectionTitle}>{t('studio.announcement.postType')}</Text>
                <View style={[styles.typeRow, { marginTop: D.spacing.sm }]}>
                  {POST_TYPES.map(({ type, icon }) => {
                    const active = postType === type;
                    return (
                      <Pressable
                        key={type}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                        onPress={() => setPostType(type)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <Ionicons
                          name={icon}
                          size={14}
                          color={active ? colors.accent.primary : colors.text.muted}
                        />
                        <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                          {type}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {isJobPost ? (
                <View style={styles.mobileSection}>
                  <Text style={styles.sectionTitle}>{t('studio.jobDetails')}</Text>
                  <OptionLabel label={t('studio.opt.jobTitle')} />
                  <TextInput
                    style={styles.jobInput}
                    placeholder={t('studio.announcement.jobTitlePlaceholderCashier')}
                    placeholderTextColor={colors.text.muted}
                    value={jobTitle}
                    onChangeText={setJobTitle}
                    editable={!annoGenerating}
                  />
                  <OptionLabel label={t('studio.opt.jobSchedule')} />
                  <TextInput
                    style={styles.jobInput}
                    placeholder={t('studio.announcement.jobSchedulePlaceholderShort')}
                    placeholderTextColor={colors.text.muted}
                    value={jobSchedule}
                    onChangeText={setJobSchedule}
                    editable={!annoGenerating}
                  />
                  <OptionLabel label={t('studio.opt.jobSalary')} />
                  <TextInput
                    style={styles.jobInput}
                    placeholder={t('studio.announcement.jobSalaryPlaceholderShort')}
                    placeholderTextColor={colors.text.muted}
                    value={jobSalary}
                    onChangeText={setJobSalary}
                    editable={!annoGenerating}
                  />
                  <OptionLabel label={t('studio.opt.jobRequirementsShort')} />
                  <TextInput
                    style={styles.jobTextArea}
                    placeholder={"Driver's license\nCommunication skills"}
                    placeholderTextColor={colors.text.muted}
                    value={jobRequirementsText}
                    onChangeText={setJobRequirementsText}
                    multiline
                    editable={!annoGenerating}
                  />
                  <OptionLabel label={t('studio.opt.jobImageStyle')} />
                  <ChipSelector
                    options={JOB_IMAGE_STYLE_OPTIONS}
                    selected={jobImageStyle}
                    onSelect={(v) => setJobImageStyle(v as 'with-person' | 'text-only')}
                    accessibilityLabel={t('studio.a11y.jobImageStyle')}
                  />
                  <OptionLabel label={t('studio.opt.additionalDirection')} />
                  <TextInput
                    style={styles.jobTextArea}
                    placeholder={'e.g. "Apply by email at jobs@example.com"'}
                    placeholderTextColor={colors.text.muted}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    editable={!annoGenerating}
                  />
                </View>
              ) : (
                <View style={styles.mobileSection}>
                  <Text style={styles.sectionTitle}>{t('studio.contentSection')}</Text>
                  <TextInput
                    style={[styles.textArea, { marginTop: D.spacing.sm }]}
                    placeholder={currentPostType.placeholder}
                    placeholderTextColor={colors.text.muted}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    editable={!annoGenerating}
                  />
                </View>
              )}

              <View style={styles.mobileSection}>
                <Text style={styles.sectionTitle}>{t('studio.styleSection')}</Text>
                <OptionLabel label={t('studio.opt.tone')} />
                <ChipSelector
                  options={TONE_OPTIONS}
                  selected={tone}
                  onSelect={setTone}
                  accessibilityLabel={t('studio.opt.tone')}
                />
                <OptionLabel label={t('studio.opt.format')} />
                <ChipSelector
                  options={FORMAT_OPTIONS}
                  selected={annoFormat}
                  onSelect={setAnnoFormat}
                  accessibilityLabel={t('studio.opt.format')}
                />
              </View>

              {contextItems.length > 0 && (
                <View style={styles.mobileSection}>
                  <BrandContextSection
                    items={contextItems}
                    selected={annoContextFields}
                    onToggle={toggleAnnoField}
                  />
                </View>
              )}

              {postType === 'Promotion' && (
                <ChooseProductsSection
                  subtitle={t('studio.subtitleAnnouncement')}
                  isDesktop={false}
                  products={products}
                  loadingProducts={loadingProducts}
                  selectedCount={promotionSelected.size}
                  selected={promotionSelected}
                  toggleProduct={togglePromotionProduct}
                  colors={colors}
                  styles={styles}
                  showProducts
                />
              )}

              <GenerateButton
                loading={annoGenerating}
                disabled={!annoReady}
                label={t('studio.generateGraphic')}
                onPress={handleAnnoGenerate}
              />

              {annoError && <Text style={styles.errorText}>{annoError}</Text>}
              {annoResult && (
                <View style={styles.mobileResultCard}>
                  <Image
                    source={{ uri: `data:${annoResult.mimeType};base64,${annoResult.imageBase64}` }}
                    style={styles.mobileResultImage}
                    resizeMode="contain"
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.downloadBtn,
                        { backgroundColor: annoKept ? colors.accent.dim : colors.accent.primary },
                        pressed && { opacity: 0.75 },
                      ]}
                      onPress={async () => {
                        if (annoKept) return;
                        requestKeep({
                          imageBase64: annoResult.imageBase64,
                          mimeType: annoResult.mimeType,
                          generationType: postTypeToGenType(postType),
                          defaultName: autoKeepName(postType),
                          onSaved: () => setAnnoKept(true),
                        });
                      }}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={annoKept ? 'checkmark-circle' : 'bookmark-outline'}
                        size={15}
                        color="#fff"
                      />
                      <Text style={styles.downloadBtnText}>{annoKept ? 'Saved' : 'Keep'}</Text>
                    </Pressable>
                    {isWeb && (
                      <Pressable
                        style={({ pressed }) => [styles.downloadBtn, pressed && { opacity: 0.75 }]}
                        onPress={() => downloadImage(annoResult, 'announcement')}
                        accessibilityRole="button"
                      >
                        <Ionicons name="download-outline" size={15} color="#fff" />
                        <Text style={styles.downloadBtnText}>{t('studio.download')}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {/* ── VIDEO ── */}
          {activeTab === 'video' && (
            <View style={styles.videoWip}>
              <ReAnimated.View style={floatStyle}>
                <Ionicons
                  name="film-outline"
                  size={72}
                  color={colors.accent.primary}
                  style={{ opacity: 0.6 }}
                />
              </ReAnimated.View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>{t('studio.comingSoon')}</Text>
              </View>
              <Text style={styles.videoTitle}>{t('studio.videoAdsTitle')}</Text>
              <Text style={styles.videoDescription}>{t('studio.videoBody')}</Text>
              <View style={styles.stepsCard}>
                <Text style={styles.stepsTitle}>{t('studio.videoWhatsComing')}</Text>
                {(
                  [
                    { icon: 'film-outline', label: t('studio.videoStep1') },
                    { icon: 'sparkles-outline', label: t('studio.videoStep2') },
                    { icon: 'cloud-upload-outline', label: t('studio.videoStep3') },
                  ] as { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[]
                ).map(({ icon, label }, i) => (
                  <View key={label} style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{i + 1}</Text>
                    </View>
                    <Ionicons name={icon} size={16} color={colors.text.muted} />
                    <Text style={styles.stepLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Wallpaper generate modal */}
      <Modal
        visible={wallpaperGenModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseWallpaperGenModal}
      >
        <Pressable
          style={styles.wallpaperGenOverlay}
          onPress={isWeb ? () => {} : handleCloseWallpaperGenModal}
        >
          <View
            style={styles.wallpaperGenSheet}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => {}}
          >
            {!isWeb && <View style={styles.wallpaperGenHandle} />}

            {isWeb && (
              <Pressable
                style={styles.wallpaperGenCloseBtn}
                onPress={handleCloseWallpaperGenModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </Pressable>
            )}

            {wallpaperGenModalStage === 'input' ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.wallpaperGenScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.wallpaperGenTitle}>{t('wallpapers.modal.title')}</Text>
                <Text style={styles.wallpaperGenSubtitle}>
                  {t('studio.wallpaperModal.subtitle')}
                </Text>

                {/* Format */}
                <Text style={styles.wallpaperGenSectionLabel}>{t('wallpapers.modal.format')}</Text>
                <View style={styles.wallpaperGenFormatRow}>
                  {(
                    [
                      { value: '9:16', label: t('studio.wallpaperModal.verticalAspect') },
                      { value: '1:1', label: t('studio.wallpaperModal.squareAspect') },
                      { value: '16:9', label: t('wallpapers.modal.formatLandscape') },
                    ] as const
                  ).map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.wallpaperGenFormatPill,
                        wallpaperGenFormat === opt.value && styles.wallpaperGenFormatPillActive,
                      ]}
                      onPress={() => setWallpaperGenFormat(opt.value)}
                      disabled={wallpaperGenGenerating}
                    >
                      <Text
                        style={[
                          styles.wallpaperGenFormatPillText,
                          wallpaperGenFormat === opt.value &&
                            styles.wallpaperGenFormatPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text
                        style={[
                          styles.wallpaperGenFormatPillRatio,
                          wallpaperGenFormat === opt.value &&
                            styles.wallpaperGenFormatPillTextActive,
                        ]}
                      >
                        {opt.value}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Prompt */}
                <Text style={styles.wallpaperGenSectionLabel}>Style prompt (optional)</Text>
                <TextInput
                  style={styles.wallpaperGenInput}
                  placeholder={t('studio.wallpaper.promptPlaceholder')}
                  placeholderTextColor={colors.text.muted}
                  value={wallpaperPrompt}
                  onChangeText={setWallpaperPrompt}
                  multiline
                  editable={!wallpaperGenGenerating}
                />

                {/* Include logo */}
                <View style={styles.wallpaperGenToggleRow}>
                  <View>
                    <Text style={styles.wallpaperGenToggleLabel}>
                      {t('wallpapers.modal.includeLogo')}
                    </Text>
                    <Text style={styles.wallpaperGenToggleHint}>
                      Place your brand logo in the header
                    </Text>
                  </View>
                  <Switch
                    value={wallpaperGenIncludeLogo}
                    onValueChange={setWallpaperGenIncludeLogo}
                    disabled={wallpaperGenGenerating}
                    trackColor={{ true: colors.accent.primary }}
                  />
                </View>

                {/* Brand context */}
                <Text style={styles.wallpaperGenSectionLabel}>
                  {t('wallpapers.modal.includeBrand')}
                </Text>
                <View>
                  {(
                    [
                      { key: 'brandName', label: 'Brand Name' },
                      { key: 'slogan', label: 'Slogan' },
                      { key: 'brandColors', label: 'Brand Colors' },
                      { key: 'businessDomain', label: 'Business Domain' },
                      { key: 'shopType', label: 'Shop Type' },
                      { key: 'targetAudience', label: 'Target Audience' },
                      { key: 'phoneNumber', label: 'Phone Number' },
                      { key: 'email', label: 'Email' },
                      { key: 'addresses', label: 'Address' },
                      { key: 'instagramHandle', label: 'Instagram' },
                      { key: 'facebookHandle', label: 'Facebook' },
                      { key: 'tikTokHandle', label: 'TikTok' },
                    ] as const
                  ).map((opt) => {
                    const checked = wallpaperGenBrandFields.includes(opt.key);
                    return (
                      <Pressable
                        key={opt.key}
                        style={({ pressed }) => [
                          styles.wallpaperGenCheckRow,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => toggleWallpaperGenBrandField(opt.key)}
                        disabled={wallpaperGenGenerating}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                      >
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={checked ? colors.accent.primary : colors.text.muted}
                        />
                        <Text style={styles.wallpaperGenCheckLabel}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {wallpaperError && <Text style={styles.wallpaperGenError}>{wallpaperError}</Text>}

                <Pressable
                  style={({ pressed }) => [
                    styles.wallpaperGenBtn2,
                    wallpaperGenGenerating && { opacity: 0.6 },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={handleGenerateWallpaper}
                  disabled={wallpaperGenGenerating}
                  accessibilityRole="button"
                >
                  {wallpaperGenGenerating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="sparkles-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.wallpaperGenBtnText2}>
                    {wallpaperGenGenerating ? t('studio.generating') : t('studio.generate')}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.wallpaperGenResultContainer}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.wallpaperGenTitle}>{t('wallpapers.result.title')}</Text>
                <Text style={styles.wallpaperGenSubtitle}>
                  Keep it as your background or generate a new one
                </Text>

                {wallpaperGenResult && (
                  <Image
                    source={{
                      uri: `data:${wallpaperGenResult.mimeType};base64,${wallpaperGenResult.imageBase64}`,
                    }}
                    style={[
                      styles.wallpaperGenResultImage,
                      {
                        aspectRatio:
                          wallpaperGenFormat === '1:1'
                            ? 1
                            : wallpaperGenFormat === '4:5'
                              ? 4 / 5
                              : 9 / 16,
                      },
                    ]}
                    resizeMode="contain"
                    accessibilityLabel={t('studio.a11y.generatedWallpaper')}
                  />
                )}

                <View style={styles.wallpaperGenResultActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperGenResultBtn,
                      {
                        backgroundColor: wallpaperGenKept
                          ? colors.accent.dim
                          : colors.accent.primary,
                      },
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => {
                      if (!wallpaperGenResult || wallpaperGenKept) return;
                      setWallpaperBase64(wallpaperGenResult.imageBase64);
                      setWallpaperStage('confirmed');
                      setWallpaperGenKept(true);
                      setPlacementZone(DEFAULT_PLACEMENT_ZONE);
                      setWallpaperGenModalVisible(false);
                      setWallpaperGenModalStage('input');
                      requestKeep({
                        imageBase64: wallpaperGenResult.imageBase64,
                        mimeType: wallpaperGenResult.mimeType,
                        generationType: 'wallpaper',
                        defaultName: autoKeepName('Wallpaper'),
                        onSaved: () => {},
                      });
                    }}
                    disabled={wallpaperGenKept}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={wallpaperGenKept ? 'checkmark-circle' : 'bookmark-outline'}
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.wallpaperGenResultBtnText}>
                      {wallpaperGenKept ? 'Saved' : 'Keep'}
                    </Text>
                  </Pressable>

                  {Platform.OS === 'web' && wallpaperGenResult && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.wallpaperGenResultBtn,
                        { backgroundColor: colors.accent.primary },
                        pressed && { opacity: 0.75 },
                      ]}
                      onPress={() => {
                        if (!wallpaperGenResult) return;
                        const ext = wallpaperGenResult.mimeType.split('/')[1] ?? 'png';
                        const a = document.createElement('a');
                        a.href = `data:${wallpaperGenResult.mimeType};base64,${wallpaperGenResult.imageBase64}`;
                        a.download = `wallpaper.${ext}`;
                        a.click();
                      }}
                      accessibilityRole="button"
                    >
                      <Ionicons name="download-outline" size={16} color="#fff" />
                      <Text style={styles.wallpaperGenResultBtnText}>{t('studio.download')}</Text>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.wallpaperGenSecondaryBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    setWallpaperGenResult(null);
                    setWallpaperGenModalStage('input');
                    setWallpaperError(null);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.text.secondary} />
                  <Text style={styles.wallpaperGenSecondaryBtnText}>
                    {t('studio.generateAgain')}
                  </Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Wallpaper picker modal */}
      <Modal
        visible={wallpaperPickerVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setWallpaperPickerVisible(false)}
      >
        <View style={styles.pickerFullScreen}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t('studio.myWallpapers')}</Text>
            <Pressable
              style={({ pressed }) => [styles.pickerClose, pressed && { opacity: 0.7 }]}
              onPress={() => setWallpaperPickerVisible(false)}
            >
              <Ionicons name="close" size={20} color={colors.text.secondary} />
            </Pressable>
          </View>
          {wallpaperPickerLoading ? (
            <View style={styles.pickerEmpty}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
            </View>
          ) : wallpaperPickerItems.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Ionicons
                name="albums-outline"
                size={40}
                color={colors.text.muted}
                style={{ marginBottom: D.spacing.sm }}
              />
              <Text style={styles.pickerEmptyText}>No wallpapers saved yet.</Text>
              <Text style={styles.pickerEmptyHint}>
                Generate wallpapers in the Wallpapers tab first.
              </Text>
            </View>
          ) : (
            <FlatList
              data={wallpaperPickerItems}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={{ padding: D.spacing.md, gap: D.spacing.sm }}
              columnWrapperStyle={{ gap: D.spacing.sm }}
              renderItem={({ item }) => {
                const thumbWidth = (screenWidth - D.spacing.md * 2 - D.spacing.sm) / 2;
                return (
                  <Pressable
                    style={({ pressed }) => ({
                      width: thumbWidth,
                      aspectRatio: 9 / 16,
                      borderRadius: D.radius.md,
                      overflow: 'hidden',
                      opacity: pressed ? 0.8 : 1,
                      borderWidth: 1.5,
                      borderColor: colors.border.default,
                    })}
                    onPress={() => pickWallpaperFromLibrary(item)}
                  >
                    <GalleryImage
                      id={item.id}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>

      <KeepImageModal
        visible={pendingKeep !== null}
        defaultName={pendingKeep?.defaultName}
        onCancel={() => setPendingKeep(null)}
        onConfirm={handleKeepConfirm}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDesktop: boolean,
  screenWidth: number
) {
  return StyleSheet.create({
    // ── Desktop root ───────────────────────────────────────────────────────────
    desktopRoot: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.bg.base,
    },

    // ── Sidebar ────────────────────────────────────────────────────────────────
    sidebar: {
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.bg.surface,
      flexDirection: 'column',
    },
    sidebarScroll: { flex: 1 },
    sidebarContent: {
      padding: D.spacing.lg,
      paddingBottom: D.spacing.sm,
    },
    sidebarHeader: {
      marginBottom: D.spacing.xs,
    },
    sidebarTitle: {
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    sidebarSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    sidebarFooter: {
      padding: D.spacing.lg,
      paddingTop: D.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
    },

    // ── Vertical nav ───────────────────────────────────────────────────────────
    verticalNav: {
      gap: D.spacing.xs,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    navItemActive: {
      backgroundColor: colors.accent.dim,
      borderColor: colors.border.focus,
    },
    navIconBox: {
      width: 32,
      height: 32,
      borderRadius: D.radius.sm,
      backgroundColor: colors.bg.base,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navIconBoxActive: {
      backgroundColor: colors.accent.primary,
    },
    navLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    navLabelActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    navDesc: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 1,
    },
    navBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.xs + 2,
      paddingVertical: 2,
    },
    navBadgeText: {
      fontSize: 10,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },

    // ── Panel divider ──────────────────────────────────────────────────────────
    panelDivider: {
      width: 1,
      backgroundColor: colors.border.subtle,
    },

    // ── Right panel ────────────────────────────────────────────────────────────
    rightPanel: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    rightPanelContent: {
      padding: D.spacing.xl,
      gap: D.spacing.xl,
      flexGrow: 1,
    },

    // ── Desktop sections ───────────────────────────────────────────────────────
    desktopSection: {
      // no card bg on desktop — sections are separated by whitespace
    },
    desktopSectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: D.spacing.md,
    },
    desktopSectionTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    desktopSectionSub: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: 2,
    },

    // ── Preview placeholder ────────────────────────────────────────────────────
    previewPlaceholder: {
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderStyle: 'dashed' as never,
      borderRadius: D.radius.xl,
      minHeight: 280,
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
      padding: D.spacing.xl,
      backgroundColor: colors.bg.surface,
    },
    previewIconCircle: {
      width: 56,
      height: 56,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.xs,
    },
    previewEmptyTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    previewEmptyHint: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      maxWidth: 320,
      lineHeight: 20,
    },
    resultImageCard: {
      borderRadius: D.radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      ...D.shadow.modal,
    },
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      margin: D.spacing.md,
      alignSelf: 'flex-end',
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
    },
    downloadBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    resultImage: {
      width: '100%',
      aspectRatio: 1,
      maxHeight: 480,
    },

    // ── Mobile layout ──────────────────────────────────────────────────────────
    scrollBg: { flex: 1, backgroundColor: colors.bg.base },
    mobileContainer: {
      flexGrow: 1,
      alignItems: 'center',
      paddingVertical: 20,
    },
    mobileInner: {
      width: '100%',
      paddingHorizontal: D.spacing.md,
      gap: D.spacing.md,
    },

    // ── Mobile segmented control ───────────────────────────────────────────────
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 4,
      position: 'relative',
      height: 40,
    },
    segmentIndicator: {
      position: 'absolute',
      top: 4,
      width: '31.33%',
      height: 32,
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.sm,
      shadowColor: '#6366F1',
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    segmentLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    segmentLabelActive: { color: '#fff', fontWeight: D.fontWeight.semibold },

    // ── Mobile section cards ───────────────────────────────────────────────────
    mobileSection: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.md,
      ...D.shadow.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: D.spacing.md,
    },
    sectionTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    mobileResultCard: {
      borderRadius: D.radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
    },
    mobileResultImage: { width: '100%', aspectRatio: 1, maxHeight: 400 },

    // ── Shared ─────────────────────────────────────────────────────────────────
    countBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 2,
    },
    countBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: D.spacing.xl,
      gap: D.spacing.sm,
    },
    emptyText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
    },
    productGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.sm,
    },
    productCard: {
      backgroundColor: colors.bg.base,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
    },
    productCardSelected: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    productImageBox: { width: '100%', aspectRatio: 1, position: 'relative' },
    productImage: { width: '100%', height: '100%' },
    productImagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.surface,
    },
    selectedOverlay: {
      position: 'absolute',
      top: D.spacing.xs,
      right: D.spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: D.radius.pill,
    },
    productInfo: { padding: D.spacing.sm },
    productName: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    productPrice: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
      marginTop: 2,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: D.spacing.md,
      paddingTop: D.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    toggleLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    typeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.sm,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.pill,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    typeChipActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
      shadowColor: '#6366F1',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    typeChipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.muted,
    },
    typeChipTextActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.semibold,
    },
    textArea: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      padding: D.spacing.md,
      fontSize: D.fontSize.base,
      minHeight: isDesktop ? 140 : 100,
      textAlignVertical: 'top',
      color: colors.text.primary,
      backgroundColor: colors.bg.base,
      outlineStyle: 'none' as never,
    },
    jobInput: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      fontSize: D.fontSize.sm,
      height: 40,
      color: colors.text.primary,
      backgroundColor: colors.bg.base,
      outlineStyle: 'none' as never,
    },
    jobTextArea: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      fontSize: D.fontSize.sm,
      minHeight: 72,
      textAlignVertical: 'top',
      color: colors.text.primary,
      backgroundColor: colors.bg.base,
      outlineStyle: 'none' as never,
    },
    errorText: {
      color: colors.text.error,
      fontSize: D.fontSize.sm,
      textAlign: 'center',
    },

    // ── Video WIP ──────────────────────────────────────────────────────────────
    videoWip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: D.spacing['2xl'],
      gap: D.spacing.md,
    },
    comingSoonBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.xs,
      shadowColor: '#6366F1',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    comingSoonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    videoTitle: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    videoDescription: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      maxWidth: 300,
      lineHeight: 20,
    },
    stepsCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.md,
      opacity: 0.55,
    },
    stepsTitle: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      marginBottom: D.spacing.md,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: D.spacing.sm,
    },
    stepNumber: {
      width: 20,
      height: 20,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.text.muted,
    },
    stepLabel: { fontSize: D.fontSize.sm, color: colors.text.muted },

    // ── Wallpaper picker ───────────────────────────────────────────────────────
    wallpaperActionRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    wallpaperActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    wallpaperActionText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.accent.primary,
    },
    wallpaperGenBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
    },
    wallpaperGenBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    // ── Wallpaper generate modal ─────────────────────────────────────────────
    wallpaperGenOverlay: {
      flex: 1,
      backgroundColor: isWeb ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.5)',
      justifyContent: isWeb ? 'center' : 'flex-end',
      alignItems: isWeb ? 'center' : 'stretch',
      padding: isWeb ? D.spacing.xl : 0,
    },
    wallpaperGenSheet: {
      backgroundColor: colors.bg.surface,
      borderTopLeftRadius: D.radius.xl,
      borderTopRightRadius: D.radius.xl,
      borderBottomLeftRadius: isWeb ? D.radius.xl : 0,
      borderBottomRightRadius: isWeb ? D.radius.xl : 0,
      paddingTop: D.spacing.md,
      paddingBottom: isWeb ? D.spacing.lg : D.spacing['2xl'],
      maxHeight: isWeb ? ('85vh' as unknown as number) : '90%',
      ...(isWeb ? { width: '100%', maxWidth: 540, ...D.shadow.modal } : {}),
    },
    wallpaperGenHandle: {
      width: 40,
      height: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: D.spacing.md,
    },
    wallpaperGenScrollContent: {
      paddingHorizontal: D.spacing.lg,
      gap: D.spacing.sm,
      paddingBottom: D.spacing.md,
    },
    wallpaperGenTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    wallpaperGenSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    wallpaperGenSectionLabel: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: D.spacing.xs,
    },
    wallpaperGenFormatRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    wallpaperGenFormatPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    wallpaperGenFormatPillActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    wallpaperGenFormatPillText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    wallpaperGenFormatPillRatio: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 1,
    },
    wallpaperGenFormatPillTextActive: {
      color: '#fff',
    },
    wallpaperGenInput: {
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
      padding: D.spacing.md,
      minHeight: 72,
      textAlignVertical: 'top',
    },
    wallpaperGenToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: D.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    wallpaperGenToggleLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    wallpaperGenToggleHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    wallpaperGenCheckRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    wallpaperGenCheckLabel: {
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
    },
    wallpaperGenError: {
      fontSize: D.fontSize.xs,
      color: '#EF4444',
    },
    wallpaperGenBtn2: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      backgroundColor: colors.accent.primary,
      paddingVertical: 13,
      borderRadius: D.radius.pill,
      marginTop: D.spacing.sm,
      ...D.shadow.glow,
    },
    wallpaperGenBtnText2: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
    },
    wallpaperGenResultContainer: {
      paddingHorizontal: D.spacing.lg,
      paddingBottom: D.spacing.md,
      gap: D.spacing.sm,
    },
    wallpaperGenResultImage: {
      width: '100%',
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      marginTop: D.spacing.xs,
      ...(isWeb ? { maxHeight: 380 } : {}),
    },
    wallpaperGenResultActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
    },
    wallpaperGenResultBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    wallpaperGenResultBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    wallpaperGenSecondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.xs,
      paddingVertical: 11,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    wallpaperGenSecondaryBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    wallpaperGenCloseBtn: {
      position: 'absolute',
      top: D.spacing.md,
      right: D.spacing.md,
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    wallpaperPreviewBox: {
      marginTop: D.spacing.md,
      borderRadius: D.radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    wallpaperPreviewImage: {
      width: '100%',
      aspectRatio: 1,
    },
    wallpaperPreviewActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      padding: D.spacing.sm,
      backgroundColor: colors.bg.surface,
    },
    wallpaperConfirmBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 7,
      borderRadius: D.radius.sm,
    },
    wallpaperConfirmBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: '#fff',
    },
    wallpaperConfirmedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      marginTop: D.spacing.md,
      padding: D.spacing.sm,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    wallpaperThumb: {
      width: 52,
      height: 52,
      borderRadius: D.radius.sm,
    },

    // ── Wallpaper picker modal ─────────────────────────────────────────────────
    pickerFullScreen: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerDialog: {
      width: Math.min(screenWidth - 96, 960),
      maxHeight: '85%' as DimensionValue,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      overflow: 'hidden',
      ...D.shadow.modal,
    },
    pickerSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: D.spacing.lg,
      paddingTop: D.spacing.lg,
      marginBottom: D.spacing.md,
    },
    pickerTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    pickerClose: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.base,
    },
    pickerEmpty: {
      alignItems: 'center',
      paddingVertical: D.spacing['2xl'],
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.lg,
    },
    pickerEmptyText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    pickerEmptyHint: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
    },
    aspectWarningBanner: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: D.spacing.xs,
      backgroundColor: 'rgba(245,158,11,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.30)',
      borderRadius: D.radius.sm,
      padding: D.spacing.sm,
      marginTop: D.spacing.sm,
    },
    aspectWarningText: {
      flex: 1,
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      lineHeight: 16,
    },
    currencyNotice: {
      marginTop: D.spacing.sm,
      marginBottom: D.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: D.spacing.xs,
      paddingHorizontal: D.spacing.sm,
      borderRadius: D.radius.sm,
      backgroundColor: colors.accent.dim,
      alignSelf: 'flex-start',
    },
    currencyNoticeText: {
      fontSize: D.fontSize.xs,
      color: colors.accent.primary,
      fontWeight: D.fontWeight.medium,
    },
  });
}
