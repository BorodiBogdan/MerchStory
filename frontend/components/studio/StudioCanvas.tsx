import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CatalogOfferModal } from '@/components/ui/CatalogOfferModal';
import { ChipSelector } from '@/components/ui/ChipSelector';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { CreditIcon } from '@/components/ui/CreditIcon';
import { GalleryImage } from '@/components/ui/GalleryImage';
import { glassNavRail } from '@/components/ui/GlassNavbar';
import { InsufficientCreditsModal } from '@/components/ui/InsufficientCreditsModal';
import { KeepImageModal } from '@/components/ui/KeepImageModal';
import { PlacementZoneEditor } from '@/components/ui/PlacementZoneEditor';
import { ProductImage } from '@/components/ui/ProductImage';
import { ProductPickerModal } from '@/components/ui/ProductPickerModal';
import { D } from '@/constants/design';
import type { GenerationType } from '@/constants/generationTypes';
import { useAuth } from '@/context/auth';
import { useShop } from '@/context/shop';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  type CatalogOfferConfig,
  fetchGallery,
  fetchGalleryImageBase64,
  formatPrice,
  type GalleryItem,
  generateAnnouncementImage,
  generateCatalogImage,
  generateCatalogOnWallpaper,
  type GenerateImageResponse,
  generateWallpaper,
  InsufficientCreditsError,
  offerHasGrouping,
  type PlacementZone,
  type ProductItem,
  saveToGallery,
  type ShopProfileResponse,
  type TextStyleOptions,
} from '@/utils/api';
import * as galleryCache from '@/utils/galleryCache';
import * as galleryImageCache from '@/utils/galleryImageCache';
import * as productsCache from '@/utils/productsCache';

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
  {
    id: 'flyer-sticker',
    label: 'Flyer',
    i18nKey: 'studio.preset.flyer',
    fontFamily: 'Bold',
    textEffect: 'Shadow',
    priceBadge: 'Sticker',
    nameFont: 'Montserrat-Bold',
    priceFont: 'Montserrat-Bold',
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

function colorLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isColorLight(hex: string): boolean {
  // Perceived luminance
  return colorLuminance(hex) > 0.45;
}

const PRESET_SWATCH_SET = new Set(PRICE_SWATCHES.map((c) => c.toLowerCase()));

// Circle swatch that opens a custom color picker. The picking behavior (OS-native
// picker on web, RGB modal on native) lives in the shared ColorPicker; this just
// supplies the rainbow circle trigger.
function CustomColorSwatch({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const isCustom = !PRESET_SWATCH_SET.has(value.toLowerCase());

  const RAINBOW = ['#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#3B82F6', '#A855F7'];

  return (
    <ColorPicker value={value} onChange={onChange} label="Custom color">
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
      </View>
    </ColorPicker>
  );
}

function ColorSwatchRow({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: D.spacing.md }}>
      {PRICE_SWATCHES.map((hex) => (
        <Pressable
          key={hex}
          onPress={() => onChange(hex)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === hex }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: hex,
            borderWidth: value === hex ? 2.5 : 1,
            borderColor: value === hex ? colors.accent.primary : colors.border.default,
          }}
        />
      ))}
      <CustomColorSwatch value={value} onChange={onChange} colors={colors} />
    </View>
  );
}

function TextStylePresetPicker({
  selectedId,
  onSelect,
  nameColor,
  onNameColorChange,
  priceColor,
  onPriceColorChange,
  colors,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  nameColor: string;
  onNameColorChange: (c: string) => void;
  priceColor: string;
  onPriceColorChange: (c: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const t = useT();
  // Preview background tracks the name color (the dominant text element) so light
  // names show on dark and vice versa — same rule as before the split.
  const previewBg = isColorLight(nameColor) ? '#1a1a2e' : '#f0f4ff';
  return (
    <>
      <OptionLabel label={t('studio.optNameColor')} />
      <ColorSwatchRow value={nameColor} onChange={onNameColorChange} colors={colors} />
      <OptionLabel label={t('studio.optPriceColor')} />
      <ColorSwatchRow value={priceColor} onChange={onPriceColorChange} colors={colors} />

      <SectionLabel label={t('studio.optText')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: D.spacing.sm }}>
        {TEXT_PRESETS.map((preset) => {
          const selected = preset.id === selectedId;
          const hasShadow = preset.textEffect === 'Shadow';
          const hasOutline = preset.textEffect === 'Outline';
          const isSticker = preset.priceBadge === 'Sticker';
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
          // Sticker-chip colors mirror the backend exactly: fill is always white
          // (retail-flyer aesthetic), and text renders in the user's picked price
          // color. Only when the picked color is too close to white (luminance > 0.65,
          // matching EnsureReadableOn with a white fill) do we flip to dark so the
          // price stays legible against a white chip.
          const stickerFill = '#ffffff';
          const stickerText = colorLuminance(priceColor) > 0.65 ? '#1e1e1e' : priceColor;
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
                borderWidth: 2.5,
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
                {isSticker ? (
                  // Flyer preview mirrors the actual composition: a mock product tile with
                  // a white sticker chip overhanging the bottom-right and the name below.
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <View
                      style={{
                        width: 54,
                        height: 38,
                        borderRadius: 6,
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.18)',
                        marginBottom: 6,
                        position: 'relative',
                        overflow: 'visible',
                      }}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          right: -10,
                          bottom: -6,
                          backgroundColor: stickerFill,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          shadowColor: '#000',
                          shadowOpacity: 0.25,
                          shadowOffset: { width: 1, height: 2 },
                          shadowRadius: 2,
                          elevation: 3,
                        }}
                      >
                        <Text
                          style={{
                            color: stickerText,
                            fontSize: 11,
                            fontFamily: preset.priceFont,
                            fontWeight: '700',
                            letterSpacing: -0.3,
                          }}
                        >
                          $19.99
                        </Text>
                      </View>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: nameColor,
                        fontSize: 11,
                        fontFamily: preset.nameFont,
                        fontWeight: '700',
                        ...(shadowStyle ?? {}),
                      }}
                    >
                      Product Name
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: nameColor,
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
                      style={{
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={
                          preset.priceBadge === 'Pill'
                            ? {
                                // Backend draws the pill as a filled shape with no stroke;
                                // tinted priceColor fill keeps it visible on previewBg
                                // (which sits in the opposite luminance bucket).
                                backgroundColor: priceColor + '33',
                                paddingHorizontal: 16,
                                paddingVertical: 6,
                                borderRadius: 999,
                              }
                            : undefined
                        }
                      >
                        <Text
                          style={
                            {
                              color: priceColor,
                              fontSize: 24,
                              lineHeight: 26,
                              includeFontPadding: false,
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
                            } as any
                          }
                        >
                          $19.99
                        </Text>
                      </View>
                    </View>
                  </>
                )}
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
    { value: 'None', label: tr('studio.themeNoneLabel') },
    { value: 'Brand Colors', label: tr('studio.themeBrandLabel') },
    { value: 'Vibrant', label: tr('studio.themeVibrantLabel') },
    { value: 'Monochrome', label: tr('studio.themeMonoLabel') },
    { value: 'Dark', label: tr('studio.themeDarkLabel') },
  ];
}
function getFormatOptions(tr: TranslateFn) {
  return [
    { value: 'Poster', label: tr('studio.formatPosterLabel') },
    { value: 'Square', label: tr('studio.formatSquareLabel') },
    { value: 'Portrait', label: tr('studio.formatPortraitLabel') },
    { value: 'Story', label: tr('studio.formatStoryLabel') },
  ];
}
function getBackgroundStyleOptions(tr: TranslateFn) {
  return [
    { value: 'SocialPost', label: tr('studio.backgroundStyle.socialPost') },
    { value: 'Realistic', label: tr('studio.backgroundStyle.realistic') },
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
// ─── Brand context helpers ──────────────────────────────────────────────────────
function deriveContextItems(profile: ShopProfileResponse, tr: TranslateFn): ContextItem[] {
  const items: ContextItem[] = [];
  if (profile.logoUrl) items.push({ key: 'logoBase64', label: tr('studio.ctx.logo') });
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
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = isWeb && screenWidth >= DESKTOP_BREAKPOINT;
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
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: isDesktop ? D.spacing.xs : D.spacing.sm,
        }}
      >
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
                gap: isDesktop ? 4 : 6,
                paddingVertical: isDesktop ? 5 : 9,
                paddingHorizontal: isDesktop ? D.spacing.sm : D.spacing.md,
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
                size={isDesktop ? 13 : 16}
                color={active ? colors.accent.primary : colors.text.muted}
              />
              <Text
                style={{
                  fontSize: isDesktop ? D.fontSize.xs : D.fontSize.sm,
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
    <View style={{ gap: 2, marginTop: D.spacing.xs }}>
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) =>
              ({
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                paddingVertical: 9,
                paddingHorizontal: D.spacing.sm + 2,
                borderRadius: D.radius.md,
                backgroundColor: active
                  ? colors.accent.dim
                  : pressed
                    ? colors.bg.elevated
                    : 'transparent',
                borderWidth: 1,
                borderColor: active ? colors.accent.primary + '55' : 'transparent',
                gap: D.spacing.sm + 2,
                ...(Platform.OS === 'web' ? ({ transitionDuration: '140ms' } as any) : {}),
              }) as any
            }
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2,
                borderColor: active ? colors.accent.primary : colors.border.default,
                backgroundColor: active ? colors.accent.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                ...(Platform.OS === 'web' && active
                  ? ({ boxShadow: `0 0 0 3px ${colors.accent.primary}22` } as any)
                  : {}),
              }}
            >
              {active && <Ionicons name="checkmark" size={11} color="#fff" />}
            </View>
            <Text
              style={{
                fontSize: D.fontSize.sm,
                fontWeight: active ? D.fontWeight.semibold : D.fontWeight.medium,
                color: active ? colors.accent.primary : colors.text.secondary,
                letterSpacing: active ? 0.1 : 0,
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
  cost,
}: {
  loading: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
  cost?: number | 'free';
}) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const showCost = !inactive && cost !== undefined;
  return (
    <Pressable
      style={({ pressed }) =>
        [
          {
            borderRadius: D.radius.pill,
            paddingVertical: 14,
            paddingHorizontal: D.spacing.md,
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            gap: 6,
            backgroundColor: inactive ? colors.bg.elevated : colors.accent.primary,
            borderWidth: inactive ? 1 : 0,
            borderColor: colors.border.default,
            transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
            opacity: loading ? 0.85 : pressed && !inactive ? 0.95 : 1,
          },
          !inactive &&
            (Platform.OS === 'web'
              ? ({
                  boxShadow: `0 10px 28px -10px ${colors.accent.primary}CC, 0 0 0 1px ${colors.accent.primary}33 inset`,
                  transitionDuration: '160ms',
                } as any)
              : D.shadow.glow),
        ] as any
      }
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Ionicons name="sparkles" size={16} color={inactive ? colors.text.muted : '#fff'} />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: inactive ? colors.text.muted : '#fff',
              fontSize: D.fontSize.base,
              fontWeight: D.fontWeight.bold,
              letterSpacing: 0.3,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {label}
          </Text>
          {showCost && cost === 'free' && (
            <Text
              style={{
                color: '#fff',
                fontSize: D.fontSize.base,
                fontWeight: D.fontWeight.bold,
                letterSpacing: 0.3,
              }}
            >
              · Free
            </Text>
          )}
          {showCost && typeof cost === 'number' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text
                style={{
                  color: '#fff',
                  fontSize: D.fontSize.base,
                  fontWeight: D.fontWeight.bold,
                  letterSpacing: 0.3,
                }}
              >
                · {cost}
              </Text>
              <CreditIcon size={16} />
            </View>
          )}
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
        <View style={styles.previewIconCircle}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
        </View>
        <Text style={styles.previewEmptyTitle}>{t('studio.generating')}</Text>
        <Text style={styles.previewEmptyHint}>{t('studio.previewEmptyHint')}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.previewPlaceholder}>
        <View style={[styles.previewIconCircle, { backgroundColor: `${colors.destructive}1A` }]}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.text.error} />
        </View>
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
        <View style={{ flexDirection: 'row', gap: 8, margin: D.spacing.md, marginTop: 0 }}>
          {onKeep && (
            <Pressable
              style={({ pressed }) => [
                styles.downloadBtn,
                { margin: 0, backgroundColor: isKept ? colors.accent.dim : colors.accent.primary },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
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
              style={({ pressed }) => [
                styles.downloadBtn,
                { margin: 0 },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
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
        <Ionicons name="sparkles" size={30} color={colors.accent.primary} />
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

  // Desktop inline card width: 4 cards fit inside the right panel's section card.
  // Layout: the workspace sits on the navbar rail (railInset each side), then
  // sidebar + root gap; inside the right panel subtract rightPanelContent
  // horizontal padding (lg * 2), desktopSection inner padding (lg * 2), and
  // the section's 1px border on each side.
  const railInset = glassNavRail(screenWidth, true).inset;
  const rightPanelWidth = screenWidth - railInset * 2 - SIDEBAR_WIDTH - D.spacing.md;
  const panelInner = rightPanelWidth - D.spacing.lg * 2 - D.spacing.lg * 2 - 2;
  const inlineCardWidth = Math.max(
    96,
    Math.floor((panelInner - D.spacing.sm * (DESKTOP_INLINE_LIMIT - 1)) / DESKTOP_INLINE_LIMIT)
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

// ─── Main canvas ───────────────────────────────────────────────────────────────
export type StudioCanvasMode = Exclude<StudioTab, 'video'>;

export function StudioCanvas({ mode }: { mode: StudioCanvasMode }) {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { profile: shopProfile } = useShop();
  const { creditBalance, setCreditBalance, refreshCreditBalance } = useAuth();
  const [insufficientVisible, setInsufficientVisible] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const BACKGROUND_STYLE_OPTIONS = useMemo(() => getBackgroundStyleOptions(tr), [tr]);
  const POST_TYPES = useMemo(() => getPostTypes(tr), [tr]);
  const JOB_IMAGE_STYLE_OPTIONS = useMemo(() => getJobImageStyleOptions(tr), [tr]);
  const TONE_OPTIONS = useMemo(() => getToneOptions(tr), [tr]);

  // ── Active mode (driven by route, not state) ────────────────────────────────
  const activeTab: StudioTab = mode;

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
  const [selectedNameColor, setSelectedNameColor] = useState<string>('#F59E0B');
  const [selectedPriceColor, setSelectedPriceColor] = useState<string>('#F59E0B');
  const textStyle = useMemo<TextStyleOptions>(() => {
    const preset = TEXT_PRESETS.find((p) => p.id === selectedPresetId) ?? TEXT_PRESETS[0];
    return {
      fontFamily: preset.fontFamily,
      fontSize: 'Large',
      nameColor: selectedNameColor,
      priceColor: selectedPriceColor,
      colorMode: 'Solid',
      textEffect: preset.textEffect,
      priceBadge: preset.priceBadge,
    };
  }, [selectedPresetId, selectedNameColor, selectedPriceColor]);

  // ── Catalog state ────────────────────────────────────────────────────────────
  const productsCacheState = productsCache.useProductsCache();
  const products = productsCacheState.items;
  const loadingProducts = productsCacheState.loading && !productsCacheState.initialized;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState('Showcase');
  const [colorTheme, setColorTheme] = useState('Brand Colors');
  const [catalogFormat, setCatalogFormat] = useState('Poster');
  const [showPrices, setShowPrices] = useState(true);
  const [showProductNames, setShowProductNames] = useState(true);
  const [showCatalogProductNames, setShowCatalogProductNames] = useState(false);
  const [backgroundStyle, setBackgroundStyle] = useState<'SocialPost' | 'Realistic'>('SocialPost');
  const [preserveProductImages, setPreserveProductImages] = useState(false);
  const [showPreserveHelp, setShowPreserveHelp] = useState(false);
  const [showPricesHelp, setShowPricesHelp] = useState(false);
  const [showNamesHelp, setShowNamesHelp] = useState(false);
  const [showBackgroundStyleHelp, setShowBackgroundStyleHelp] = useState(false);
  const [reviewMode, setReviewMode] = useState<null | 'catalog' | 'wallpaperOn'>(null);
  // In-modal base-price overrides (productId -> price), applied to the next generation only.
  const priceOverridesRef = useRef<Record<string, number>>({});
  // Offer config from the review modal, applied to the next catalog generation only.
  const catalogOfferRef = useRef<CatalogOfferConfig | null>(null);
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

  function handleAfterPaidGenerate(result: GenerateImageResponse | null | undefined) {
    if (result && typeof result.balance === 'number') {
      setCreditBalance(result.balance);
    } else {
      refreshCreditBalance();
    }
  }

  function handleGenerationError(err: unknown, set: (msg: string) => void) {
    if (err instanceof InsufficientCreditsError) {
      setInsufficientVisible(true);
      set('Not enough credits.');
      return;
    }
    set(err instanceof Error ? err.message : 'Something went wrong.');
  }

  function openCatalogReview() {
    const chosen = products.filter((p) => selected.has(p.id));
    if (!chosen.length) return;
    if (creditBalance < 1) {
      setInsufficientVisible(true);
      return;
    }
    setReviewMode('catalog');
  }

  function openWallpaperOnReview() {
    const chosen = products.filter((p) => selected.has(p.id));
    if (!chosen.length || !wallpaperBase64) return;
    setReviewMode('wallpaperOn');
  }

  // Settings recap shown on the review modal's "generation options" step.
  function buildOptionsSummary(
    mode: 'catalog' | 'wallpaperOn'
  ): { label: string; value: string }[] {
    const onOff = (v: boolean) => (v ? t('studio.offer.optOn') : t('studio.offer.optOff'));
    // Product-name row is rendered by the modal itself (it forces it off and
    // annotates when the offer has a group/bundle), so it is omitted here.
    if (mode === 'wallpaperOn') {
      return [
        { label: t('studio.offer.optLayout'), value: layout },
        { label: t('studio.offer.optPrices'), value: onOff(showPrices) },
      ];
    }
    return [
      { label: t('studio.offer.optFormat'), value: catalogFormat },
      { label: t('studio.offer.optTheme'), value: colorTheme },
      { label: t('studio.offer.optBackground'), value: backgroundStyle },
      { label: t('studio.offer.optPrices'), value: onOff(showPrices) },
      { label: t('studio.offer.optPreserve'), value: onOff(preserveProductImages) },
    ];
  }

  function runReviewGeneration(mode: null | 'catalog' | 'wallpaperOn') {
    setReviewMode(null);
    if (mode === 'catalog') void handleCatalogGenerate();
    else if (mode === 'wallpaperOn') void handleWallpaperOnGenerate();
  }

  async function handleCatalogGenerate() {
    const chosen = products.filter((p) => selected.has(p.id));
    if (!chosen.length) return;
    if (creditBalance < 1) {
      setInsufficientVisible(true);
      return;
    }
    setCatalogGenerating(true);
    setCatalogError(null);
    setCatalogResult(null);
    setCatalogKept(false);
    try {
      const productsWithImages = chosen.map((p) => ({
        id: p.id,
        name: p.name,
        price: priceOverridesRef.current[p.id] ?? p.price,
        currency: p.currency,
      }));
      const catalogCurrency = chosen[0].currency;
      // Brand colors are driven by the "Brand Colors" color theme, not the context
      // chips, so they are excluded from the catalog's brand-context fields.
      const catalogFields = catalogContextFields.filter((k) => k !== 'brandColors');
      const offer = catalogOfferRef.current ?? undefined;
      // Product-name labels are hidden whenever the offer has a group or bundle.
      const namesForcedOff = offer?.isOffer ? offerHasGrouping(offer.groups) : false;
      const result = await generateCatalogImage({
        products: productsWithImages,
        colorTheme,
        format: catalogFormat,
        showPrices,
        showProductNames: namesForcedOff ? false : showCatalogProductNames,
        backgroundStyle,
        preserveProductImages,
        brandContextFields: catalogFields.length > 0 ? catalogFields : undefined,
        currency: catalogCurrency,
        offer,
      });
      setCatalogResult(result);
      handleAfterPaidGenerate(result);
    } catch (err) {
      handleGenerationError(err, setCatalogError);
    } finally {
      setCatalogGenerating(false);
    }
  }

  async function handleGenerateWallpaper() {
    if (creditBalance < 1) {
      setInsufficientVisible(true);
      return;
    }
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
      handleAfterPaidGenerate(res);
    } catch (err) {
      handleGenerationError(err, setWallpaperError);
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
      const productsWithImages = chosen.map((p) => ({
        id: p.id,
        name: p.name,
        price: priceOverridesRef.current[p.id] ?? p.price,
        currency: p.currency,
      }));
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
      // The compositor needs raw base64 to inline into the catalog request. We
      // fetch the bytes through our own API (which reads the blob server-side)
      // rather than fetching the SAS URL directly: a browser fetch of the blob
      // URL is CORS-blocked and fails with "Failed to fetch".
      const { imageBase64: base64, mimeType } = await fetchGalleryImageBase64(item.id);
      if (!base64) throw new Error('Failed to read wallpaper.');
      galleryImageCache.prime(item.id, base64, mimeType);
      setWallpaperBase64(base64);
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
  // When navigated from the home tab's "Ideas for you" Generate button, the
  // route carries `brief` (AI-generated image prompt) and `postType` so the
  // user lands on the right form pre-filled. Applied once per mount so later
  // edits aren't clobbered.
  const routeParams = useLocalSearchParams<{ brief?: string; postType?: string }>();
  const [postType, setPostType] = useState<PostType>(
    routeParams.postType === 'Promotion' ? 'Promotion' : 'Announcement'
  );
  const [content, setContent] = useState(
    typeof routeParams.brief === 'string' ? routeParams.brief : ''
  );
  const [tone, setTone] = useState('Professional');
  const [annoFormat, setAnnoFormat] = useState('Square');
  const [annoGenerating, setAnnoGenerating] = useState(false);
  const [annoResult, setAnnoResult] = useState<GenerateImageResponse | null>(null);
  const [annoError, setAnnoError] = useState<string | null>(null);
  const [annoKept, setAnnoKept] = useState(false);
  const [promotionSelected, setPromotionSelected] = useState<Set<string>>(new Set());

  // Re-apply route params when the user navigates from the home tab a second
  // time with a different idea. The state initializers above handle the first
  // mount; this effect handles subsequent navigations that re-render the same
  // mounted screen with new params. We track the last-applied brief so manual
  // edits to `content` aren't overwritten by stale param values.
  const lastAppliedBriefRef = useRef<string | undefined>(
    typeof routeParams.brief === 'string' ? routeParams.brief : undefined
  );
  useEffect(() => {
    if (mode !== 'announcements') return;
    const incomingBrief = typeof routeParams.brief === 'string' ? routeParams.brief : undefined;
    if (incomingBrief === lastAppliedBriefRef.current) return;
    if (incomingBrief && incomingBrief.length > 0) {
      setContent(incomingBrief);
    }
    if (routeParams.postType === 'Promotion' || routeParams.postType === 'Announcement') {
      setPostType(routeParams.postType);
    }
    lastAppliedBriefRef.current = incomingBrief;
  }, [mode, routeParams.brief, routeParams.postType]);

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

  // Catalogs pick brand colors through the "Brand Colors" color theme, so the brand
  // colors chip is dropped from the catalog brand-context list to avoid duplication.
  const catalogContextItems = useMemo(
    () => contextItems.filter((i) => i.key !== 'brandColors'),
    [contextItems]
  );

  // A realistic photographic background can't be art-directed onto the brand palette
  // the way a graphic social post can, so the "Brand Colors" theme is hidden for it.
  const catalogColorOptions = useMemo(
    () =>
      backgroundStyle === 'Realistic'
        ? COLOR_OPTIONS.filter((o) => o.value !== 'Brand Colors')
        : COLOR_OPTIONS,
    [COLOR_OPTIONS, backgroundStyle]
  );

  // Switching to a realistic background while "Brand Colors" is selected falls back to
  // letting the AI decide, so an unavailable theme is never sent.
  useEffect(() => {
    if (backgroundStyle === 'Realistic' && colorTheme === 'Brand Colors') {
      setColorTheme('None');
    }
  }, [backgroundStyle, colorTheme]);

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
    if (creditBalance < 1) {
      setInsufficientVisible(true);
      return;
    }
    setAnnoGenerating(true);
    setAnnoError(null);
    setAnnoResult(null);
    setAnnoKept(false);
    try {
      const promotionProductImageIds =
        postType === 'Promotion' && promotionSelected.size > 0
          ? products.filter((p) => promotionSelected.has(p.id)).map((p) => p.id)
          : undefined;

      const jobRequirementsList = isJobPost
        ? jobRequirementsText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        : [];

      const result = await generateAnnouncementImage({
        postType,
        content: content.trim(),
        tone,
        format: annoFormat,
        brandContextFields: annoContextFields.length > 0 ? annoContextFields : undefined,
        productImageIds: promotionProductImageIds,
        jobTitle: isJobPost ? jobTitle.trim() : undefined,
        jobSchedule: isJobPost ? jobSchedule.trim() : undefined,
        jobSalary: isJobPost && jobSalary.trim().length > 0 ? jobSalary.trim() : undefined,
        jobImageStyle: isJobPost ? jobImageStyle : undefined,
        jobRequirements:
          isJobPost && jobRequirementsList.length > 0 ? jobRequirementsList : undefined,
      });
      setAnnoResult(result);
      handleAfterPaidGenerate(result);
    } catch (err) {
      handleGenerationError(err, setAnnoError);
    } finally {
      setAnnoGenerating(false);
    }
  }

  // ── Entrance animation (opacity + translateY) ────────────────────────────────
  const enterOpacity = useSharedValue(0);
  const enterTranslate = useSharedValue(14);
  useEffect(() => {
    enterOpacity.value = withTiming(1, {
      duration: D.duration.entrance,
      easing: Easing.out(Easing.cubic),
    });
    enterTranslate.value = withTiming(0, {
      duration: D.duration.entrance + 50,
      easing: Easing.out(Easing.cubic),
    });
  }, [enterOpacity, enterTranslate]);
  const heroEnterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterTranslate.value }],
  }));

  const panelOpacity = useSharedValue(0);
  const panelTranslate = useSharedValue(18);
  useEffect(() => {
    panelOpacity.value = withDelay(120, withTiming(1, { duration: 500 }));
    panelTranslate.value = withDelay(120, withTiming(0, { duration: 520 }));
  }, [panelOpacity, panelTranslate]);
  const panelEnterStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
    transform: [{ translateY: panelTranslate.value }],
  }));

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
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelRow}>
                <Text style={styles.toggleLabel}>{t('studio.preserveProductImages.label')}</Text>
                <Pressable
                  onPress={() => setShowPreserveHelp((v) => !v)}
                  hitSlop={8}
                  style={styles.infoButton}
                  accessibilityLabel={t('studio.preserveProductImages.label')}
                >
                  <Ionicons
                    name={showPreserveHelp ? 'information-circle' : 'information-circle-outline'}
                    size={18}
                    color={colors.text.muted}
                  />
                </Pressable>
              </View>
              <Switch
                value={preserveProductImages}
                onValueChange={setPreserveProductImages}
                thumbColor={preserveProductImages ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            {showPreserveHelp && (
              <Text style={styles.toggleHelper}>{t('studio.preserveProductImages.helper')}</Text>
            )}
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelRow}>
                <Text style={styles.toggleLabel}>{t('studio.showPrices')}</Text>
                <Pressable
                  onPress={() => setShowPricesHelp((v) => !v)}
                  hitSlop={8}
                  style={styles.infoButton}
                  accessibilityLabel={t('studio.showPrices')}
                >
                  <Ionicons
                    name={showPricesHelp ? 'information-circle' : 'information-circle-outline'}
                    size={18}
                    color={colors.text.muted}
                  />
                </Pressable>
              </View>
              <Switch
                value={showPrices}
                onValueChange={setShowPrices}
                thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            {showPricesHelp && (
              <Text style={styles.toggleHelper}>{t('studio.showPrices.helper')}</Text>
            )}
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelRow}>
                <Text style={styles.toggleLabel}>{t('studio.showProductNames')}</Text>
                <Pressable
                  onPress={() => setShowNamesHelp((v) => !v)}
                  hitSlop={8}
                  style={styles.infoButton}
                  accessibilityLabel={t('studio.showProductNames')}
                >
                  <Ionicons
                    name={showNamesHelp ? 'information-circle' : 'information-circle-outline'}
                    size={18}
                    color={colors.text.muted}
                  />
                </Pressable>
              </View>
              <Switch
                value={showCatalogProductNames}
                onValueChange={setShowCatalogProductNames}
                thumbColor={showCatalogProductNames ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            {showNamesHelp && (
              <Text style={styles.toggleHelper}>{t('studio.showProductNames.helper')}</Text>
            )}
            <View style={styles.toggleLabelRow}>
              <OptionLabel label={t('studio.opt.backgroundStyle')} />
              <Pressable
                onPress={() => setShowBackgroundStyleHelp((v) => !v)}
                hitSlop={8}
                style={styles.infoButton}
                accessibilityLabel={t('studio.opt.backgroundStyle')}
              >
                <Ionicons
                  name={
                    showBackgroundStyleHelp ? 'information-circle' : 'information-circle-outline'
                  }
                  size={18}
                  color={colors.text.muted}
                />
              </Pressable>
            </View>
            <SidebarOptionGroup
              options={BACKGROUND_STYLE_OPTIONS}
              selected={backgroundStyle}
              onSelect={(v) => setBackgroundStyle(v as 'SocialPost' | 'Realistic')}
            />
            {showBackgroundStyleHelp && (
              <Text style={styles.toggleHelper}>{t('studio.backgroundStyle.helper')}</Text>
            )}
            <OptionLabel label={t('studio.opt.colorTheme')} />
            <SidebarOptionGroup
              options={catalogColorOptions}
              selected={colorTheme}
              onSelect={setColorTheme}
            />
            <OptionLabel label={t('studio.opt.format')} />
            <SidebarOptionGroup
              options={FORMAT_OPTIONS}
              selected={catalogFormat}
              onSelect={setCatalogFormat}
            />
            {catalogFormat === 'Poster' && (
              <Text style={styles.toggleHelper}>{t('studio.formatPosterHint')}</Text>
            )}
            <BrandContextSection
              items={catalogContextItems}
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
              nameColor={selectedNameColor}
              onNameColorChange={setSelectedNameColor}
              priceColor={selectedPriceColor}
              onPriceColorChange={setSelectedPriceColor}
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
          {annoFormat === 'Poster' && (
            <Text style={styles.toggleHelper}>{t('studio.formatPosterHint')}</Text>
          )}
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
            onPress={openCatalogReview}
            cost={1}
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
            onPress={openWallpaperOnReview}
            cost="free"
          />
        )
      ) : activeTab === 'announcements' ? (
        <GenerateButton
          loading={annoGenerating}
          disabled={!annoReady}
          label={t('studio.generateGraphic')}
          onPress={handleAnnoGenerate}
          cost={1}
        />
      ) : null;

    // ── Right panel content per tab ──────────────────────────────────────────
    // Note: the Photo/On-Wallpaper segmented control now lives inside the hero's
    // top-right dock, so the body starts directly with the mode's content.
    const rightContent =
      activeTab === 'catalog' ? (
        <>
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
                    <Text numberOfLines={1} style={styles.wallpaperActionText}>
                      {t('studio.import')}
                    </Text>
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
                    <Text numberOfLines={1} style={styles.wallpaperActionText}>
                      {t('studio.generate')}
                    </Text>
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
                    <Text numberOfLines={1} style={styles.wallpaperActionText}>
                      {t('studio.myWallpapers')}
                    </Text>
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
      ) : null;

    return (
      <>
        <View style={styles.desktopRoot}>
          {/* ── LEFT SIDEBAR ── */}
          <ReAnimated.View style={[styles.sidebar, heroEnterStyle]}>
            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header: back to hub + title */}
              <Pressable
                onPress={() => router.navigate('/(tabs)')}
                accessibilityRole="button"
                accessibilityLabel={t('studio.back')}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.sidebarBackLink,
                  (pressed || hovered) && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="chevron-back" size={16} color={colors.text.muted} />
                <Text style={styles.sidebarBackText}>{t('studio.title')}</Text>
              </Pressable>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>{TAB_META_I18N[activeTab].label}</Text>
                <Text style={styles.sidebarSubtitle}>{TAB_META_I18N[activeTab].desc}</Text>
              </View>

              {/* Mode-specific options */}
              {sidebarOptions}
            </ScrollView>

            {/* Sticky footer */}
            {sidebarFooter && <View style={styles.sidebarFooter}>{sidebarFooter}</View>}
          </ReAnimated.View>

          {/* ── RIGHT PANEL ── */}
          <ScrollView
            style={styles.rightPanel}
            contentContainerStyle={styles.rightPanelContent}
            showsVerticalScrollIndicator={false}
          >
            <ReAnimated.View style={[panelEnterStyle, { gap: D.spacing.lg }]}>
              {/* Hero header */}
              <View style={styles.heroWrap}>
                <View style={activeTab === 'catalog' ? styles.heroTextClamp : undefined}>
                  <Text style={styles.heroTitle}>
                    {activeTab === 'catalog'
                      ? t('studio.navCatalog')
                      : activeTab === 'announcements'
                        ? t('studio.navAnnouncements')
                        : t('studio.navVideo')}
                  </Text>
                  <Text style={styles.heroSubtitle}>{TAB_META_I18N[activeTab].desc}</Text>
                  <View style={styles.heroMetaRow}>
                    {activeTab === 'catalog' && (
                      <View style={styles.heroMetaChip}>
                        <Ionicons name="grid-outline" size={12} color={colors.accent.primary} />
                        <Text style={styles.heroMetaText}>
                          {selectedCount > 0
                            ? `${selectedCount} ${t('productPicker.selected')}`
                            : t('studio.selectProductsFirst')}
                        </Text>
                      </View>
                    )}
                    {activeTab === 'announcements' && (
                      <View style={styles.heroMetaChip}>
                        <Ionicons
                          name="megaphone-outline"
                          size={12}
                          color={colors.accent.primary}
                        />
                        <Text style={styles.heroMetaText}>{postType}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Photo ↔ On Wallpaper segmented control (docked top-right) */}
                {activeTab === 'catalog' && (
                  <View style={styles.heroSegmentDock}>
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
                            <Text
                              style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}
                            >
                              {mode === 'generate'
                                ? t('studio.generate')
                                : t('studio.onWallpaperTab')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              {rightContent}
            </ReAnimated.View>
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
                        {
                          value: 'Poster',
                          label: t('studio.wallpaperModal.posterAspect'),
                          ratio: t('studio.wallpaperModal.posterRatioHint'),
                        },
                        {
                          value: '9:16',
                          label: t('studio.wallpaperModal.verticalAspect'),
                          ratio: '9:16',
                        },
                        {
                          value: '1:1',
                          label: t('studio.wallpaperModal.squareAspect'),
                          ratio: '1:1',
                        },
                        {
                          value: '4:5',
                          label: t('studio.wallpaperModal.portraitAspect'),
                          ratio: '4:5',
                        },
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
                          {opt.ratio}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {wallpaperGenFormat === 'Poster' && (
                    <Text style={styles.toggleHelper}>{t('studio.formatPosterHint')}</Text>
                  )}

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
                            size={isDesktop ? 18 : 24}
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
                      {wallpaperGenGenerating
                        ? t('studio.generating')
                        : `${t('studio.generate')} · 1`}
                    </Text>
                    {!wallpaperGenGenerating && <CreditIcon size={16} />}
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
                            wallpaperGenFormat === 'Poster'
                              ? 1 / Math.SQRT2
                              : wallpaperGenFormat === '1:1'
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

        <InsufficientCreditsModal
          visible={insufficientVisible}
          onDismiss={() => setInsufficientVisible(false)}
        />

        <CatalogOfferModal
          visible={reviewMode !== null}
          products={products
            .filter((p) => selected.has(p.id))
            .map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency }))}
          title={reviewMode === 'wallpaperOn' ? t('studio.placeOnWallpaper') : undefined}
          allowOffer={reviewMode === 'catalog' && !preserveProductImages}
          optionsSummary={reviewMode ? buildOptionsSummary(reviewMode) : []}
          showProductNames={
            reviewMode === 'wallpaperOn' ? showProductNames : showCatalogProductNames
          }
          generating={reviewMode === 'wallpaperOn' ? wallpaperOnGenerating : catalogGenerating}
          cost={reviewMode === 'wallpaperOn' ? undefined : 1}
          onCancel={() => setReviewMode(null)}
          onContinue={(offer, overrides) => {
            priceOverridesRef.current = overrides;
            catalogOfferRef.current = offer;
            runReviewGeneration(reviewMode);
          }}
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
        <ReAnimated.View style={[styles.mobileInner, heroEnterStyle]}>
          {/* Back to hub */}
          <Pressable
            onPress={() => router.navigate('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel={t('studio.back')}
            style={({ pressed }) => [styles.mobileBackLink, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text.secondary} />
            <Text style={styles.mobileBackText}>{t('studio.title')}</Text>
          </Pressable>

          {/* Mobile hero header */}
          <View style={styles.mobileHero}>
            <Text style={styles.mobileHeroTitle}>{TAB_META_I18N[activeTab].label}</Text>
            <Text style={styles.mobileHeroSubtitle}>{TAB_META_I18N[activeTab].desc}</Text>
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
                    <View style={styles.toggleRow}>
                      <View style={styles.toggleLabelRow}>
                        <Text style={styles.toggleLabel}>
                          {t('studio.preserveProductImages.label')}
                        </Text>
                        <Pressable
                          onPress={() => setShowPreserveHelp((v) => !v)}
                          hitSlop={8}
                          style={styles.infoButton}
                          accessibilityLabel={t('studio.preserveProductImages.label')}
                        >
                          <Ionicons
                            name={
                              showPreserveHelp ? 'information-circle' : 'information-circle-outline'
                            }
                            size={18}
                            color={colors.text.muted}
                          />
                        </Pressable>
                      </View>
                      <Switch
                        value={preserveProductImages}
                        onValueChange={setPreserveProductImages}
                        thumbColor={
                          preserveProductImages ? colors.accent.primary : colors.text.muted
                        }
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                    {showPreserveHelp && (
                      <Text style={styles.toggleHelper}>
                        {t('studio.preserveProductImages.helper')}
                      </Text>
                    )}
                    <View style={styles.toggleRow}>
                      <View style={styles.toggleLabelRow}>
                        <Text style={styles.toggleLabel}>{t('studio.showPrices')}</Text>
                        <Pressable
                          onPress={() => setShowPricesHelp((v) => !v)}
                          hitSlop={8}
                          style={styles.infoButton}
                          accessibilityLabel={t('studio.showPrices')}
                        >
                          <Ionicons
                            name={
                              showPricesHelp ? 'information-circle' : 'information-circle-outline'
                            }
                            size={18}
                            color={colors.text.muted}
                          />
                        </Pressable>
                      </View>
                      <Switch
                        value={showPrices}
                        onValueChange={setShowPrices}
                        thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                    {showPricesHelp && (
                      <Text style={styles.toggleHelper}>{t('studio.showPrices.helper')}</Text>
                    )}
                    <View style={styles.toggleRow}>
                      <View style={styles.toggleLabelRow}>
                        <Text style={styles.toggleLabel}>{t('studio.showProductNames')}</Text>
                        <Pressable
                          onPress={() => setShowNamesHelp((v) => !v)}
                          hitSlop={8}
                          style={styles.infoButton}
                          accessibilityLabel={t('studio.showProductNames')}
                        >
                          <Ionicons
                            name={
                              showNamesHelp ? 'information-circle' : 'information-circle-outline'
                            }
                            size={18}
                            color={colors.text.muted}
                          />
                        </Pressable>
                      </View>
                      <Switch
                        value={showCatalogProductNames}
                        onValueChange={setShowCatalogProductNames}
                        thumbColor={
                          showCatalogProductNames ? colors.accent.primary : colors.text.muted
                        }
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                    {showNamesHelp && (
                      <Text style={styles.toggleHelper}>{t('studio.showProductNames.helper')}</Text>
                    )}
                    <View style={styles.toggleLabelRow}>
                      <OptionLabel label={t('studio.opt.backgroundStyle')} />
                      <Pressable
                        onPress={() => setShowBackgroundStyleHelp((v) => !v)}
                        hitSlop={8}
                        style={styles.infoButton}
                        accessibilityLabel={t('studio.opt.backgroundStyle')}
                      >
                        <Ionicons
                          name={
                            showBackgroundStyleHelp
                              ? 'information-circle'
                              : 'information-circle-outline'
                          }
                          size={18}
                          color={colors.text.muted}
                        />
                      </Pressable>
                    </View>
                    <ChipSelector
                      options={BACKGROUND_STYLE_OPTIONS}
                      selected={backgroundStyle}
                      onSelect={(v) => setBackgroundStyle(v as 'SocialPost' | 'Realistic')}
                      accessibilityLabel={t('studio.opt.backgroundStyle')}
                    />
                    {showBackgroundStyleHelp && (
                      <Text style={styles.toggleHelper}>{t('studio.backgroundStyle.helper')}</Text>
                    )}
                    <OptionLabel label={t('studio.opt.colorTheme')} />
                    <ChipSelector
                      options={catalogColorOptions}
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
                    {catalogFormat === 'Poster' && (
                      <Text style={styles.toggleHelper}>{t('studio.formatPosterHint')}</Text>
                    )}
                  </View>

                  {catalogContextItems.length > 0 && (
                    <View style={styles.mobileSection}>
                      <BrandContextSection
                        items={catalogContextItems}
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
                    onPress={openCatalogReview}
                    cost={1}
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
                        <Text numberOfLines={1} style={styles.wallpaperActionText}>
                          {t('studio.import')}
                        </Text>
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
                        <Text numberOfLines={1} style={styles.wallpaperActionText}>
                          {t('studio.generate')}
                        </Text>
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
                        <Text numberOfLines={1} style={styles.wallpaperActionText}>
                          {t('studio.myWallpapers')}
                        </Text>
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
                      nameColor={selectedNameColor}
                      onNameColorChange={setSelectedNameColor}
                      priceColor={selectedPriceColor}
                      onPriceColorChange={setSelectedPriceColor}
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
                    onPress={openWallpaperOnReview}
                    cost="free"
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
                  <Text style={styles.toggleHelper}>{t('studio.announcement.describe')}</Text>
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
                {annoFormat === 'Poster' && (
                  <Text style={styles.toggleHelper}>{t('studio.formatPosterHint')}</Text>
                )}
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
                cost={1}
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
        </ReAnimated.View>
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
                      {
                        value: 'Poster',
                        label: t('studio.wallpaperModal.posterAspect'),
                        ratio: t('studio.wallpaperModal.posterRatioHint'),
                      },
                      {
                        value: '9:16',
                        label: t('studio.wallpaperModal.verticalAspect'),
                        ratio: '9:16',
                      },
                      {
                        value: '1:1',
                        label: t('studio.wallpaperModal.squareAspect'),
                        ratio: '1:1',
                      },
                      {
                        value: '16:9',
                        label: t('wallpapers.modal.formatLandscape'),
                        ratio: '16:9',
                      },
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
                        {opt.ratio}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {wallpaperGenFormat === 'Poster' && (
                  <Text style={styles.toggleHelper}>{t('studio.formatPosterHint')}</Text>
                )}

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
                          size={isDesktop ? 18 : 24}
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
                    {wallpaperGenGenerating
                      ? t('studio.generating')
                      : `${t('studio.generate')} · 1`}
                  </Text>
                  {!wallpaperGenGenerating && <CreditIcon size={16} />}
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
                          wallpaperGenFormat === 'Poster'
                            ? 1 / Math.SQRT2
                            : wallpaperGenFormat === '1:1'
                              ? 1
                              : wallpaperGenFormat === '16:9'
                                ? 16 / 9
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
        <View
          style={[
            styles.pickerFullScreen,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
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
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const thumbWidth = (screenWidth - D.spacing.md * 2 - D.spacing.sm) / 2;
                const thumbHeight = Math.min(thumbWidth * (16 / 9), screenWidth * 0.55);
                return (
                  <Pressable
                    style={({ pressed }) => ({
                      width: thumbWidth,
                      height: thumbHeight,
                      borderRadius: D.radius.md,
                      overflow: 'hidden',
                      opacity: pressed ? 0.8 : 1,
                      borderWidth: 1.5,
                      borderColor: colors.border.default,
                      backgroundColor: colors.bg.elevated,
                    })}
                    onPress={() => pickWallpaperFromLibrary(item)}
                  >
                    <GalleryImage
                      id={item.id}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
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

      <InsufficientCreditsModal
        visible={insufficientVisible}
        onDismiss={() => setInsufficientVisible(false)}
      />

      <CatalogOfferModal
        visible={reviewMode !== null}
        products={products
          .filter((p) => selected.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency }))}
        title={reviewMode === 'wallpaperOn' ? t('studio.placeOnWallpaper') : undefined}
        allowOffer={reviewMode === 'catalog' && !preserveProductImages}
        optionsSummary={reviewMode ? buildOptionsSummary(reviewMode) : []}
        showProductNames={reviewMode === 'wallpaperOn' ? showProductNames : showCatalogProductNames}
        generating={reviewMode === 'wallpaperOn' ? wallpaperOnGenerating : catalogGenerating}
        cost={reviewMode === 'wallpaperOn' ? undefined : 1}
        onCancel={() => setReviewMode(null)}
        onContinue={(offer, overrides) => {
          priceOverridesRef.current = overrides;
          catalogOfferRef.current = offer;
          runReviewGeneration(reviewMode);
        }}
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
  // Align the workspace with the glass navbar pill: same side insets, so the
  // sidebar's left edge and the pill's left edge share one rail.
  const railInset = glassNavRail(screenWidth, true).inset;

  return StyleSheet.create({
    // ── Desktop root ───────────────────────────────────────────────────────────
    desktopRoot: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.bg.base,
      position: 'relative',
      overflow: 'hidden',
      paddingLeft: railInset,
      paddingRight: railInset,
      paddingBottom: D.spacing.md,
      paddingTop: D.spacing.xs,
      gap: D.spacing.md,
    },

    // ── Sidebar ────────────────────────────────────────────────────────────────
    // Floating rounded card (same language as the navbar pill) instead of a
    // full-bleed slab, so the gap between navbar and sidebar reads as intended.
    sidebar: {
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.bg.surface,
      flexDirection: 'column',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: `0 1px 2px rgba(0,0,0,0.04), 0 20px 44px -28px ${colors.accent.primary}40`,
          } as any)
        : {}),
    } as any,
    sidebarScroll: { flex: 1 },
    sidebarContent: {
      padding: D.spacing.lg,
      paddingBottom: D.spacing.sm,
    },
    sidebarBackLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginBottom: D.spacing.md,
      paddingVertical: 4,
      paddingRight: 8,
      ...(Platform.OS === 'web'
        ? ({ outlineWidth: 0, transitionDuration: '160ms', cursor: 'pointer' } as any)
        : {}),
    } as any,
    sidebarBackText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    sidebarHeader: {
      marginBottom: D.spacing.md,
      position: 'relative',
    },
    sidebarTitle: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.6,
      lineHeight: 32,
    },
    sidebarSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      marginTop: 4,
      lineHeight: 20,
    },
    sidebarFooter: {
      padding: D.spacing.lg,
      paddingTop: D.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      backgroundColor: colors.bg.surface,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 -8px 24px -12px ${colors.accent.primary}1F` } as any)
        : {}),
    } as any,

    // ── Vertical nav ───────────────────────────────────────────────────────────
    verticalNav: {
      gap: 6,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      ...(Platform.OS === 'web' ? ({ transitionDuration: '180ms' } as any) : {}),
    } as any,
    navItemHover: {
      backgroundColor: colors.bg.elevated,
    },
    navItemActive: {
      backgroundColor: colors.accent.dim,
      borderColor: colors.accent.primary + '55',
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 4px 14px -6px ${colors.accent.primary}55` } as any)
        : D.shadow.sm),
    } as any,
    navIconBox: {
      width: 34,
      height: 34,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navIconBoxActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 6px 16px -6px ${colors.accent.primary}AA` } as any)
        : D.shadow.glow),
    } as any,
    navLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: -0.1,
    },
    navLabelActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.bold,
    },
    navDesc: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
      lineHeight: 15,
    },
    navBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: colors.accent.primary + '40',
    },
    navBadgeText: {
      fontSize: 10,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.5,
    },

    // ── Panel divider ──────────────────────────────────────────────────────────
    panelDivider: {
      width: 0,
    },

    // ── Right panel ────────────────────────────────────────────────────────────
    rightPanel: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    rightPanelContent: {
      // The workspace already sits on the navbar rail; keep the preview close
      // to the sidebar instead of re-centering it with big gutters.
      paddingHorizontal: D.spacing.lg,
      paddingTop: D.spacing.lg,
      paddingBottom: D.spacing['2xl'],
      gap: D.spacing.lg,
      flexGrow: 1,
      width: '100%',
    },

    // ── Desktop hero header (top of right panel) ───────────────────────────────
    heroWrap: {
      position: 'relative',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.lg,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 16px 40px -22px ${colors.accent.primary}40` } as any)
        : D.shadow.sm),
    } as any,
    heroTitle: {
      fontSize: D.fontSize['3xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.8,
      lineHeight: 40,
    },
    heroSubtitle: {
      fontSize: D.fontSize.base,
      color: colors.text.secondary,
      marginTop: 6,
      lineHeight: 22,
      maxWidth: 620,
    },
    heroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.sm,
      marginTop: D.spacing.md,
    },
    heroMetaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: 5,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    heroMetaText: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      fontWeight: D.fontWeight.medium,
    },
    // Interactive segment control docked in the hero (top-right).
    heroSegmentDock: {
      position: 'absolute',
      top: D.spacing.lg,
      right: D.spacing.lg,
      width: 260,
      zIndex: 3,
    },
    // When the hero has a segmented control on the right, keep text from running under it.
    heroTextClamp: {
      maxWidth: '100%',
      paddingRight: 276, // 260 segment + 16 gutter
    },

    // ── Desktop sections ───────────────────────────────────────────────────────
    desktopSection: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.lg,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 2px 12px -6px ${colors.accent.primary}1F` } as any)
        : D.shadow.sm),
    } as any,
    desktopSectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: D.spacing.md,
      marginBottom: D.spacing.md,
    },
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      flex: 1,
      minWidth: 0,
    },
    sectionIconBadge: {
      width: 34,
      height: 34,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary + '33',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    desktopSectionTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    desktopSectionSub: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: 2,
      lineHeight: 20,
    },

    // ── Preview placeholder ────────────────────────────────────────────────────
    previewPlaceholder: {
      borderWidth: 1.5,
      borderColor: colors.border.subtle,
      borderStyle: 'dashed' as never,
      borderRadius: D.radius.xl,
      minHeight: isDesktop ? 360 : 280,
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
      padding: D.spacing.xl,
      backgroundColor: colors.bg.base,
      position: 'relative',
      overflow: 'hidden',
    },
    previewIconCircle: {
      width: 72,
      height: 72,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary + '44',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.sm,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 8px 24px -8px ${colors.accent.primary}66` } as any)
        : D.shadow.glow),
    } as any,
    previewEmptyTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    previewEmptyHint: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      maxWidth: 340,
      lineHeight: 20,
    },
    resultImageCard: {
      borderRadius: D.radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.accent.primary + '40',
      backgroundColor: colors.bg.base,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 20px 60px -20px ${colors.accent.primary}66` } as any)
        : D.shadow.modal),
    } as any,
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      margin: D.spacing.md,
      alignSelf: 'flex-end',
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 6px 18px -6px ${colors.accent.primary}AA` } as any)
        : D.shadow.sm),
    } as any,
    downloadBtnText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      letterSpacing: 0.3,
    },
    resultImage: {
      width: '100%',
      aspectRatio: 1,
      maxHeight: 520,
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
    mobileBackLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      paddingVertical: 6,
      paddingRight: 8,
    },
    mobileBackText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },

    // ── Segmented control ──────────────────────────────────────────────────────
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: 4,
      position: 'relative',
      height: 44,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `inset 0 1px 2px ${colors.border.subtle}` } as any)
        : {}),
    } as any,
    segmentIndicator: {
      position: 'absolute',
      top: 4,
      width: '31.33%',
      height: 36,
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.pill,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 6px 18px -6px ${colors.accent.primary}CC` } as any)
        : D.shadow.glow),
    } as any,
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    segmentLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: 0.2,
    },
    segmentLabelActive: { color: '#fff', fontWeight: D.fontWeight.bold, letterSpacing: 0.3 },

    // ── Mobile hero ────────────────────────────────────────────────────────────
    mobileHero: {
      position: 'relative',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.md + 2,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 12px 32px -18px ${colors.accent.primary}40` } as any)
        : D.shadow.sm),
    } as any,
    mobileHeroTitle: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.6,
      lineHeight: 32,
    },
    mobileHeroSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      marginTop: 4,
      lineHeight: 20,
    },

    // ── Mobile section cards ───────────────────────────────────────────────────
    mobileSection: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.md,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 2px 10px -4px ${colors.border.default}` } as any)
        : D.shadow.sm),
    } as any,
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: D.spacing.md,
    },
    sectionTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    mobileSectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      marginBottom: D.spacing.sm + 2,
    },
    mobileResultCard: {
      borderRadius: D.radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.accent.primary + '40',
      backgroundColor: colors.bg.base,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 14px 40px -16px ${colors.accent.primary}66` } as any)
        : D.shadow.modal),
    } as any,
    mobileResultImage: { width: '100%', aspectRatio: 1, maxHeight: 420 },

    // ── Shared ─────────────────────────────────────────────────────────────────
    countBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: colors.accent.primary + '40',
    },
    countBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.3,
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
    toggleLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.xs,
      flexShrink: 1,
    },
    infoButton: {
      padding: 2,
    },
    toggleHelper: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: D.spacing.xs,
      lineHeight: 16,
    },
    typeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.sm,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.pill,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
      ...(Platform.OS === 'web' ? ({ transitionDuration: '160ms' } as any) : {}),
    } as any,
    typeChipActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 4px 12px -4px ${colors.accent.primary}55` } as any)
        : {
            shadowColor: '#6366F1',
            shadowOpacity: 0.2,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
          }),
    } as any,
    typeChipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    typeChipTextActive: {
      color: colors.accent.primary,
      fontWeight: D.fontWeight.bold,
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
      backgroundColor: colors.bg.input,
      outlineStyle: 'none' as never,
      ...(Platform.OS === 'web' ? ({ transitionDuration: '160ms' } as any) : {}),
    } as any,
    jobInput: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      fontSize: D.fontSize.sm,
      height: 44,
      color: colors.text.primary,
      backgroundColor: colors.bg.input,
      outlineStyle: 'none' as never,
    },
    jobTextArea: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 10,
      fontSize: D.fontSize.sm,
      minHeight: 80,
      textAlignVertical: 'top',
      color: colors.text.primary,
      backgroundColor: colors.bg.input,
      outlineStyle: 'none' as never,
    },
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
      paddingVertical: D.spacing.xs + 1,
      borderWidth: 1,
      borderColor: colors.accent.primary + '40',
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 4px 12px -4px ${colors.accent.primary}55` } as any)
        : {
            shadowColor: '#6366F1',
            shadowOpacity: 0.2,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
          }),
    } as any,
    comingSoonText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    videoTitle: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    videoDescription: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      textAlign: 'center',
      maxWidth: 320,
      lineHeight: 22,
    },
    stepsCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: D.spacing.md + 2,
      opacity: 0.85,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: `0 2px 12px -6px ${colors.border.default}` } as any)
        : D.shadow.sm),
    } as any,
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
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.sm + 2,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      borderColor: colors.accent.primary + '55',
      backgroundColor: colors.accent.dim,
      ...(Platform.OS === 'web' ? ({ transitionDuration: '150ms' } as any) : {}),
    } as any,
    wallpaperActionText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
      letterSpacing: 0.2,
      flexShrink: 1,
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
      gap: isDesktop ? D.spacing.sm : D.spacing.md,
      paddingVertical: isDesktop ? 7 : 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    wallpaperGenCheckLabel: {
      fontSize: isDesktop ? D.fontSize.sm : D.fontSize.base,
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
