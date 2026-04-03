import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import {
  fetchProducts,
  fetchWallpapers,
  type GalleryItem,
  generateAnnouncementImage,
  generateCatalogImage,
  generateCatalogOnWallpaper,
  type GenerateImageResponse,
  generateWallpaper,
  getShopProfile,
  type ProductItem,
  type ShopProfileResponse,
  type TextStyleOptions,
} from '@/utils/api';

const isWeb = Platform.OS === 'web';
const SIDEBAR_WIDTH = 320;
const DESKTOP_BREAKPOINT = 860;

type StudioTab = 'catalog' | 'announcements' | 'video';
type CatalogMode = 'generate' | 'on-wallpaper';
type WallpaperStage = 'none' | 'generating' | 'preview' | 'confirmed';
type PostType = 'Announcement' | 'Job Post' | 'Info' | 'Promotion';
type ContextItem = { key: string; label: string };

// ─── Text style preset swatches ────────────────────────────────────────────────
const TEXT_SWATCHES = [
  '#FFFFFF',
  '#1e1e1e',
  '#475569',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
  '#14B8A6',
  '#F43F5E',
  '#22C55E',
  '#FEF9C3',
];
const FONT_OPTIONS = [
  { value: 'Modern', label: 'Modern' },
  { value: 'Elegant', label: 'Elegant' },
  { value: 'Bold', label: 'Bold' },
  { value: 'Friendly', label: 'Friendly' },
];
const FONT_SIZE_OPTIONS = [
  { value: 'Small', label: 'Small' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Large', label: 'Large' },
];
const COLOR_MODE_OPTIONS = [
  { value: 'Solid', label: 'Solid' },
  { value: 'Gradient', label: 'Gradient' },
  { value: 'Rainbow', label: 'Rainbow' },
];
const TEXT_EFFECT_OPTIONS = [
  { value: 'None', label: 'None' },
  { value: 'Shadow', label: 'Shadow' },
  { value: 'Outline', label: 'Outline' },
];

function SwatchRow({
  label,
  selected,
  onSelect,
  colors,
}: {
  label: string;
  selected: string;
  onSelect: (c: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{ marginBottom: D.spacing.sm }}>
      <Text
        style={{
          fontSize: D.fontSize.xs,
          color: colors.text.muted,
          marginBottom: 6,
          fontWeight: '500' as const,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {TEXT_SWATCHES.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => onSelect(hex)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: hex,
              borderWidth: selected === hex ? 2.5 : 1,
              borderColor: selected === hex ? colors.accent.primary : colors.border.default,
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === hex }}
          />
        ))}
      </View>
    </View>
  );
}

function TextStyleControls({
  textStyle,
  setTextStyle,
  colors,
}: {
  textStyle: TextStyleOptions;
  setTextStyle: React.Dispatch<React.SetStateAction<TextStyleOptions>>;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <>
      <SectionLabel label="Text Style" />
      <OptionLabel label="Font" />
      <ChipSelector
        options={FONT_OPTIONS}
        selected={textStyle.fontFamily ?? 'Modern'}
        onSelect={(v) => setTextStyle((p) => ({ ...p, fontFamily: v }))}
        accessibilityLabel="Font family"
      />
      <OptionLabel label="Size" />
      <ChipSelector
        options={FONT_SIZE_OPTIONS}
        selected={textStyle.fontSize ?? 'Medium'}
        onSelect={(v) => setTextStyle((p) => ({ ...p, fontSize: v }))}
        accessibilityLabel="Font size"
      />
      <OptionLabel label="Color Mode" />
      <ChipSelector
        options={COLOR_MODE_OPTIONS}
        selected={textStyle.colorMode ?? 'Solid'}
        onSelect={(v) => setTextStyle((p) => ({ ...p, colorMode: v }))}
        accessibilityLabel="Color mode"
      />
      {textStyle.colorMode !== 'Rainbow' && (
        <SwatchRow
          label={textStyle.colorMode === 'Gradient' ? 'Gradient Start' : 'Text Color'}
          selected={textStyle.nameColor ?? '#1e1e1e'}
          onSelect={(c) => setTextStyle((p) => ({ ...p, nameColor: c }))}
          colors={colors}
        />
      )}
      {textStyle.colorMode === 'Gradient' && (
        <SwatchRow
          label="Gradient End"
          selected={textStyle.gradientEndColor ?? '#6366F1'}
          onSelect={(c) => setTextStyle((p) => ({ ...p, gradientEndColor: c }))}
          colors={colors}
        />
      )}
      <OptionLabel label="Effect" />
      <ChipSelector
        options={TEXT_EFFECT_OPTIONS}
        selected={textStyle.textEffect ?? 'Shadow'}
        onSelect={(v) => setTextStyle((p) => ({ ...p, textEffect: v }))}
        accessibilityLabel="Text effect"
      />
    </>
  );
}

// ─── Static data ───────────────────────────────────────────────────────────────
const LAYOUT_OPTIONS = [
  { value: 'Grid', label: 'Grid' },
  { value: 'Showcase', label: 'Showcase' },
  { value: 'Minimal', label: 'Minimal' },
  { value: 'Story', label: 'Story' },
];
const COLOR_OPTIONS = [
  { value: 'Brand Colors', label: 'Brand Colors' },
  { value: 'Vibrant', label: 'Vibrant' },
  { value: 'Monochrome', label: 'Monochrome' },
  { value: 'Dark', label: 'Dark' },
];
const FORMAT_OPTIONS = [
  { value: 'Square', label: 'Square (1:1)' },
  { value: 'Portrait', label: 'Portrait (4:5)' },
  { value: 'Story', label: 'Story (9:16)' },
];
const POST_TYPES: {
  type: PostType;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  placeholder: string;
}[] = [
  {
    type: 'Announcement',
    icon: 'megaphone-outline',
    placeholder: "e.g. We're open this Sunday from 9am to 6pm…",
  },
  {
    type: 'Job Post',
    icon: 'briefcase-outline',
    placeholder: 'e.g. Looking for a part-time cashier, 3 days/week…',
  },
  {
    type: 'Info',
    icon: 'information-circle-outline',
    placeholder: 'e.g. Did you know we offer free gift wrapping?',
  },
  {
    type: 'Promotion',
    icon: 'pricetag-outline',
    placeholder: 'e.g. 20% off all clothing this weekend only!',
  },
];
const TONE_OPTIONS = [
  { value: 'Professional', label: 'Professional' },
  { value: 'Friendly', label: 'Friendly' },
  { value: 'Bold', label: 'Bold' },
  { value: 'Playful', label: 'Playful' },
];
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
function deriveContextItems(profile: ShopProfileResponse): ContextItem[] {
  const items: ContextItem[] = [];
  if (profile.brandName) items.push({ key: 'brandName', label: 'Brand Name' });
  if (profile.slogan) items.push({ key: 'slogan', label: 'Slogan' });
  if (profile.brandColors?.length > 0) items.push({ key: 'brandColors', label: 'Brand Colors' });
  if (profile.businessDomain) items.push({ key: 'businessDomain', label: 'Business Domain' });
  if (profile.shopType) items.push({ key: 'shopType', label: 'Shop Type' });
  if (profile.targetAudience) items.push({ key: 'targetAudience', label: 'Target Audience' });
  if (profile.competitors) items.push({ key: 'competitors', label: 'Competitors' });
  if (profile.phoneNumber) items.push({ key: 'phoneNumber', label: 'Phone' });
  if (profile.email) items.push({ key: 'email', label: 'Email' });
  if (profile.addresses?.length > 0) items.push({ key: 'addresses', label: 'Address' });
  if (profile.instagramHandle) items.push({ key: 'instagramHandle', label: 'Instagram' });
  if (profile.facebookHandle) items.push({ key: 'facebookHandle', label: 'Facebook' });
  if (profile.tikTokHandle) items.push({ key: 'tikTokHandle', label: 'TikTok' });
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
  if (items.length === 0) return null;
  return (
    <>
      <SectionLabel label="Brand Context" />
      <Text
        style={{
          fontSize: D.fontSize.xs,
          color: colors.text.muted,
          marginBottom: D.spacing.sm,
        }}
      >
        Choose which brand info to include in the AI prompt
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

function ResultPreviewPanel({
  result,
  generating,
  error,
  emptyTitle,
  emptyHint,
  colors,
  styles,
}: {
  result: GenerateImageResponse | null;
  generating: boolean;
  error: string | null;
  emptyTitle: string;
  emptyHint: string;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof makeStyles>;
}) {
  if (generating) {
    return (
      <View style={styles.previewPlaceholder}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.previewEmptyTitle}>Generating…</Text>
        <Text style={styles.previewEmptyHint}>This usually takes a few seconds</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.previewPlaceholder}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.text.error} />
        <Text style={[styles.previewEmptyTitle, { color: colors.text.error }]}>
          Generation failed
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
          accessibilityLabel="Generated image"
        />
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
}: {
  product: ProductItem;
  selected: boolean;
  onToggle: () => void;
  cardWidth: DimensionValue;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof makeStyles>;
}) {
  const imageUri = product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : null;
  return (
    <Pressable
      style={[styles.productCard, { width: cardWidth }, selected && styles.productCardSelected]}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <View style={styles.productImageBox}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="image-outline" size={24} color={colors.text.muted} />
          </View>
        )}
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
        <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function StudioScreen() {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = isWeb && screenWidth >= DESKTOP_BREAKPOINT;
  const styles = useMemo(() => makeStyles(colors, isDesktop), [colors, isDesktop]);

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
  const [showWallpaperPrompt, setShowWallpaperPrompt] = useState(false);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [wallpaperOnGenerating, setWallpaperOnGenerating] = useState(false);
  const [wallpaperOnResult, setWallpaperOnResult] = useState<GenerateImageResponse | null>(null);
  const [wallpaperOnError, setWallpaperOnError] = useState<string | null>(null);

  // ── Wallpaper picker (choose from saved wallpapers) ──────────────────────────
  const [wallpaperPickerVisible, setWallpaperPickerVisible] = useState(false);
  const [wallpaperPickerItems, setWallpaperPickerItems] = useState<GalleryItem[]>([]);
  const [wallpaperPickerLoading, setWallpaperPickerLoading] = useState(false);

  // ── Text style state ─────────────────────────────────────────────────────────
  const [textStyle, setTextStyle] = useState<TextStyleOptions>({
    fontFamily: 'Modern',
    fontSize: 'Medium',
    nameColor: '#1e1e1e',
    priceColor: null,
    colorMode: 'Solid',
    gradientEndColor: '#6366F1',
    textEffect: 'Shadow',
  });

  // ── Catalog state ────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState('Grid');
  const [colorTheme, setColorTheme] = useState('Brand Colors');
  const [catalogFormat, setCatalogFormat] = useState('Square');
  const [showPrices, setShowPrices] = useState(true);
  const [catalogGenerating, setCatalogGenerating] = useState(false);
  const [catalogResult, setCatalogResult] = useState<GenerateImageResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoadingProducts(true);
      fetchProducts()
        .then(setProducts)
        .catch(() => {})
        .finally(() => setLoadingProducts(false));

      getShopProfile()
        .then((profile) => {
          setShopProfile(profile);
          if (profile) {
            const allKeys = deriveContextItems(profile).map((i) => i.key);
            setCatalogContextFields(allKeys);
            setAnnoContextFields(allKeys);
          }
        })
        .catch(() => {});
    }, [])
  );

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
    try {
      setCatalogResult(
        await generateCatalogImage({
          products: chosen.map((p) => ({
            name: p.name,
            price: p.price,
            imageBase64: p.imageBase64,
          })),
          layout,
          colorTheme,
          format: catalogFormat,
          showPrices,
          brandContextFields: catalogContextFields.length > 0 ? catalogContextFields : undefined,
        })
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCatalogGenerating(false);
    }
  }

  async function handleGenerateWallpaper() {
    if (!wallpaperPrompt.trim()) return;
    setWallpaperStage('generating');
    setWallpaperError(null);
    setWallpaperPreview(null);
    try {
      const res = await generateWallpaper({ prompt: wallpaperPrompt.trim() });
      setWallpaperPreview(res.imageBase64);
      setWallpaperStage('preview');
    } catch (err) {
      setWallpaperError(err instanceof Error ? err.message : 'Failed to generate wallpaper.');
      setWallpaperStage('none');
    }
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
    }
  }

  async function handleWallpaperOnGenerate() {
    const chosen = products.filter((p) => selected.has(p.id));
    if (!chosen.length || !wallpaperBase64) return;
    setWallpaperOnGenerating(true);
    setWallpaperOnError(null);
    setWallpaperOnResult(null);
    try {
      setWallpaperOnResult(
        await generateCatalogOnWallpaper({
          products: chosen.map((p) => ({
            name: p.name,
            price: p.price,
            imageBase64: p.imageBase64,
          })),
          wallpaperBase64,
          layout,
          format: catalogFormat,
          showPrices,
          textStyle,
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
    fetchWallpapers()
      .then(setWallpaperPickerItems)
      .catch(() => setWallpaperPickerItems([]))
      .finally(() => setWallpaperPickerLoading(false));
  }

  function pickWallpaperFromLibrary(item: GalleryItem) {
    setWallpaperBase64(item.imageBase64);
    setWallpaperStage('confirmed');
    setWallpaperOnResult(null);
    setWallpaperOnError(null);
    setWallpaperPickerVisible(false);
  }

  // ── Announcements state ──────────────────────────────────────────────────────
  const [postType, setPostType] = useState<PostType>('Announcement');
  const [content, setContent] = useState('');
  const [tone, setTone] = useState('Professional');
  const [annoFormat, setAnnoFormat] = useState('Square');
  const [annoGenerating, setAnnoGenerating] = useState(false);
  const [annoResult, setAnnoResult] = useState<GenerateImageResponse | null>(null);
  const [annoError, setAnnoError] = useState<string | null>(null);

  // ── Brand context state ──────────────────────────────────────────────────────
  const [shopProfile, setShopProfile] = useState<ShopProfileResponse | null>(null);
  const [catalogContextFields, setCatalogContextFields] = useState<string[]>([]);
  const [annoContextFields, setAnnoContextFields] = useState<string[]>([]);

  const contextItems = useMemo(
    () => (shopProfile ? deriveContextItems(shopProfile) : []),
    [shopProfile]
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

  async function handleAnnoGenerate() {
    if (!content.trim()) return;
    setAnnoGenerating(true);
    setAnnoError(null);
    setAnnoResult(null);
    try {
      setAnnoResult(
        await generateAnnouncementImage({
          postType,
          content: content.trim(),
          tone,
          format: annoFormat,
          brandContextFields: annoContextFields.length > 0 ? annoContextFields : undefined,
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
  // Desktop right panel inner width ≈ screenWidth - SIDEBAR_WIDTH - 1 (divider) - 64 (padding)
  // Mobile: 2 cols with pixel-accurate width for centering last row
  const desktopPanelInner = screenWidth - SIDEBAR_WIDTH - 1 - 64;
  const desktopCardCols = desktopPanelInner > 600 ? 5 : desktopPanelInner > 420 ? 4 : 3;
  const desktopCardWidth = Math.floor(
    (desktopPanelInner - D.spacing.sm * (desktopCardCols - 1)) / desktopCardCols
  );
  const mobileCardCols = 2;
  const mobileCardWidth = Math.floor(
    (screenWidth - D.spacing.md * 2 - D.spacing.sm) / mobileCardCols
  );
  const productCardWidth: DimensionValue = isDesktop ? desktopCardWidth : mobileCardWidth;
  const gridCols = isDesktop ? desktopCardCols : mobileCardCols;

  // ────────────────────────────────────────────────────────────────────────────
  // DESKTOP LAYOUT
  // ────────────────────────────────────────────────────────────────────────────
  if (isDesktop) {
    // ── Sidebar options per tab ──────────────────────────────────────────────
    const sidebarOptions =
      activeTab === 'catalog' ? (
        catalogMode === 'generate' ? (
          <>
            <SectionLabel label="Generation Options" />
            <OptionLabel label="Layout" />
            <SidebarOptionGroup options={LAYOUT_OPTIONS} selected={layout} onSelect={setLayout} />
            <OptionLabel label="Color Theme" />
            <SidebarOptionGroup
              options={COLOR_OPTIONS}
              selected={colorTheme}
              onSelect={setColorTheme}
            />
            <OptionLabel label="Format" />
            <SidebarOptionGroup
              options={FORMAT_OPTIONS}
              selected={catalogFormat}
              onSelect={setCatalogFormat}
            />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show Prices</Text>
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
            <SectionLabel label="Placement Options" />
            <OptionLabel label="Layout" />
            <SidebarOptionGroup options={LAYOUT_OPTIONS} selected={layout} onSelect={setLayout} />
            <OptionLabel label="Format" />
            <SidebarOptionGroup
              options={FORMAT_OPTIONS}
              selected={catalogFormat}
              onSelect={setCatalogFormat}
            />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show Prices</Text>
              <Switch
                value={showPrices}
                onValueChange={setShowPrices}
                thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                trackColor={{ false: colors.border.default, true: colors.accent.dim }}
              />
            </View>
            <TextStyleControls textStyle={textStyle} setTextStyle={setTextStyle} colors={colors} />
          </>
        )
      ) : activeTab === 'announcements' ? (
        <>
          <SectionLabel label="Style Options" />
          <OptionLabel label="Tone" />
          <SidebarOptionGroup options={TONE_OPTIONS} selected={tone} onSelect={setTone} />
          <OptionLabel label="Format" />
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
            label={selectedCount === 0 ? 'Select products first' : 'Generate Catalog'}
            onPress={handleCatalogGenerate}
          />
        ) : (
          <GenerateButton
            loading={wallpaperOnGenerating}
            disabled={selectedCount === 0 || wallpaperBase64 === null}
            label={
              wallpaperBase64 === null
                ? 'Pick a wallpaper first'
                : selectedCount === 0
                  ? 'Select products first'
                  : 'Place on Wallpaper'
            }
            onPress={handleWallpaperOnGenerate}
          />
        )
      ) : activeTab === 'announcements' ? (
        <GenerateButton
          loading={annoGenerating}
          disabled={!content.trim()}
          label="Generate Graphic"
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
                      {mode === 'generate' ? 'Generate' : 'On Wallpaper'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {catalogMode === 'generate' ? (
            <>
              {/* Product picker */}
              <View style={styles.desktopSection}>
                <View style={styles.desktopSectionHeader}>
                  <View>
                    <Text style={styles.desktopSectionTitle}>Choose Products</Text>
                    <Text style={styles.desktopSectionSub}>
                      Select products to include in your catalog
                    </Text>
                  </View>
                  {selectedCount > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{selectedCount} selected</Text>
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
                    <Text style={styles.emptyText}>
                      No products yet. Add some in the Products tab.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: D.spacing.sm }}>
                    {chunkArray(products, gridCols).map((row, rowIdx) => (
                      <View
                        key={rowIdx}
                        style={{
                          flexDirection: 'row',
                          gap: D.spacing.sm,
                          justifyContent: row.length < gridCols ? 'center' : 'flex-start',
                        }}
                      >
                        {row.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            selected={selected.has(p.id)}
                            onToggle={() => toggleProduct(p.id)}
                            cardWidth={productCardWidth}
                            colors={colors}
                            styles={styles}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Preview */}
              <View style={styles.desktopSection}>
                <Text style={styles.desktopSectionTitle}>Preview</Text>
                <Text style={styles.desktopSectionSub}>
                  Your generated catalog will appear here
                </Text>
                <View style={{ marginTop: D.spacing.md }}>
                  <ResultPreviewPanel
                    result={catalogResult}
                    generating={catalogGenerating}
                    error={catalogError}
                    emptyTitle="Your catalog will appear here"
                    emptyHint="Select products on the left, configure options, then hit Generate."
                    colors={colors}
                    styles={styles}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Wallpaper picker */}
              <View style={styles.desktopSection}>
                <Text style={styles.desktopSectionTitle}>Background Wallpaper</Text>
                <Text style={styles.desktopSectionSub}>
                  Import from device or generate with AI — your wallpaper stays unchanged
                </Text>

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
                    <Text style={styles.wallpaperActionText}>Import</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.wallpaperActionBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => setShowWallpaperPrompt((v) => !v)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="sparkles-outline" size={16} color={colors.accent.primary} />
                    <Text style={styles.wallpaperActionText}>Generate</Text>
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
                    <Text style={styles.wallpaperActionText}>My Wallpapers</Text>
                  </Pressable>
                </View>

                {showWallpaperPrompt && (
                  <View style={{ marginTop: D.spacing.md, gap: D.spacing.sm }}>
                    <TextInput
                      style={styles.textArea}
                      placeholder="Describe the wallpaper (e.g. warm sunset market scene, soft bokeh lights…)"
                      placeholderTextColor={colors.text.muted}
                      value={wallpaperPrompt}
                      onChangeText={setWallpaperPrompt}
                      multiline
                      editable={wallpaperStage !== 'generating'}
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.wallpaperGenBtn,
                        (wallpaperStage === 'generating' || !wallpaperPrompt.trim()) && {
                          opacity: 0.45,
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={handleGenerateWallpaper}
                      disabled={wallpaperStage === 'generating' || !wallpaperPrompt.trim()}
                      accessibilityRole="button"
                    >
                      {wallpaperStage === 'generating' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="sparkles-outline" size={15} color="#fff" />
                      )}
                      <Text style={styles.wallpaperGenBtnText}>
                        {wallpaperStage === 'generating' ? 'Generating…' : 'Generate Wallpaper'}
                      </Text>
                    </Pressable>
                  </View>
                )}

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
                      accessibilityLabel="Generated wallpaper preview"
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
                        }}
                        accessibilityRole="button"
                      >
                        <Ionicons name="checkmark" size={15} color="#fff" />
                        <Text style={styles.wallpaperConfirmBtnText}>Keep</Text>
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
                      accessibilityLabel="Selected wallpaper"
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
              </View>

              {/* Product picker */}
              <View style={styles.desktopSection}>
                <View style={styles.desktopSectionHeader}>
                  <View>
                    <Text style={styles.desktopSectionTitle}>Choose Products</Text>
                    <Text style={styles.desktopSectionSub}>
                      Select products to place on your wallpaper
                    </Text>
                  </View>
                  {selectedCount > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{selectedCount} selected</Text>
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
                    <Text style={styles.emptyText}>
                      No products yet. Add some in the Products tab.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: D.spacing.sm }}>
                    {chunkArray(products, gridCols).map((row, rowIdx) => (
                      <View
                        key={rowIdx}
                        style={{
                          flexDirection: 'row',
                          gap: D.spacing.sm,
                          justifyContent: row.length < gridCols ? 'center' : 'flex-start',
                        }}
                      >
                        {row.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            selected={selected.has(p.id)}
                            onToggle={() => toggleProduct(p.id)}
                            cardWidth={productCardWidth}
                            colors={colors}
                            styles={styles}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Result */}
              <View style={styles.desktopSection}>
                <Text style={styles.desktopSectionTitle}>Result</Text>
                <Text style={styles.desktopSectionSub}>
                  Your products composited onto the wallpaper
                </Text>
                <View style={{ marginTop: D.spacing.md }}>
                  <ResultPreviewPanel
                    result={wallpaperOnResult}
                    generating={wallpaperOnGenerating}
                    error={wallpaperOnError}
                    emptyTitle="Result will appear here"
                    emptyHint="Pick a wallpaper, select products, configure options, then hit Place on Wallpaper."
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
            <Text style={styles.desktopSectionTitle}>Post Type</Text>
            <Text style={styles.desktopSectionSub}>What kind of graphic do you need?</Text>
            <View style={[styles.typeRow, { marginTop: D.spacing.md }]}>
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
                      size={15}
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

          <View style={styles.desktopSection}>
            <Text style={styles.desktopSectionTitle}>Content</Text>
            <Text style={styles.desktopSectionSub}>Describe what you want to communicate</Text>
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

          {/* Preview */}
          <View style={styles.desktopSection}>
            <Text style={styles.desktopSectionTitle}>Preview</Text>
            <Text style={styles.desktopSectionSub}>Your generated graphic will appear here</Text>
            <View style={{ marginTop: D.spacing.md }}>
              <ResultPreviewPanel
                result={annoResult}
                generating={annoGenerating}
                error={annoError}
                emptyTitle="Your graphic will appear here"
                emptyHint="Fill in the content and style options, then hit Generate."
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
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
          <Text style={styles.videoTitle}>Video Ads</Text>
          <Text style={styles.videoDescription}>
            Generate professional short-form video ads powered by AI. Currently in development.
          </Text>
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>{"What's coming"}</Text>
            {(
              [
                { icon: 'film-outline', label: 'Storyboard your concept' },
                { icon: 'sparkles-outline', label: 'AI generates visuals' },
                { icon: 'cloud-upload-outline', label: 'Export & share' },
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
                <Text style={styles.sidebarTitle}>Studio</Text>
                <Text style={styles.sidebarSubtitle}>AI-powered ad creation</Text>
              </View>

              {/* Vertical tab nav */}
              <SectionLabel label="Tools" />
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
                          {tab.label}
                        </Text>
                        <Text style={styles.navDesc}>{tab.desc}</Text>
                      </View>
                      {tab.comingSoon && (
                        <View style={styles.navBadge}>
                          <Text style={styles.navBadgeText}>Soon</Text>
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

        {/* Wallpaper picker modal (desktop) */}
        <Modal
          visible={wallpaperPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setWallpaperPickerVisible(false)}
        >
          <Pressable style={styles.pickerOverlay} onPress={() => setWallpaperPickerVisible(false)}>
            <Pressable style={styles.pickerSheet} onPress={() => {}}>
              <View style={styles.pickerHandle} />
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>My Wallpapers</Text>
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
                    const thumbSize = (screenWidth - D.spacing.md * 2 - D.spacing.sm) / 2;
                    return (
                      <Pressable
                        style={({ pressed }) => ({
                          width: thumbSize,
                          height: thumbSize,
                          borderRadius: D.radius.md,
                          overflow: 'hidden',
                          opacity: pressed ? 0.8 : 1,
                          borderWidth: 2,
                          borderColor: colors.border.default,
                        })}
                        onPress={() => pickWallpaperFromLibrary(item)}
                      >
                        <Image
                          source={{ uri: `data:${item.mimeType};base64,${item.imageBase64}` }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    );
                  }}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>
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
                    {tab === 'catalog' ? 'Catalog' : tab === 'announcements' ? 'Posts' : 'Video'}
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
                        {mode === 'generate' ? 'Generate' : 'On Wallpaper'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {catalogMode === 'generate' ? (
                <>
                  <View style={styles.mobileSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Choose Products</Text>
                      {selectedCount > 0 && (
                        <View style={styles.countBadge}>
                          <Text style={styles.countBadgeText}>{selectedCount} selected</Text>
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
                        <Text style={styles.emptyText}>
                          No products yet. Add some in the Products tab.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.productGrid}>
                        {products.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            selected={selected.has(p.id)}
                            onToggle={() => toggleProduct(p.id)}
                            cardWidth={productCardWidth}
                            colors={colors}
                            styles={styles}
                          />
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.mobileSection}>
                    <Text style={styles.sectionTitle}>Generation Options</Text>
                    <OptionLabel label="Layout" />
                    <ChipSelector
                      options={LAYOUT_OPTIONS}
                      selected={layout}
                      onSelect={setLayout}
                      accessibilityLabel="Layout"
                    />
                    <OptionLabel label="Color Theme" />
                    <ChipSelector
                      options={COLOR_OPTIONS}
                      selected={colorTheme}
                      onSelect={setColorTheme}
                      accessibilityLabel="Color theme"
                    />
                    <OptionLabel label="Format" />
                    <ChipSelector
                      options={FORMAT_OPTIONS}
                      selected={catalogFormat}
                      onSelect={setCatalogFormat}
                      accessibilityLabel="Format"
                    />
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Show Prices</Text>
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
                    label={selectedCount === 0 ? 'Select products to generate' : 'Generate Catalog'}
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
                    </View>
                  )}
                </>
              ) : (
                <>
                  {/* Wallpaper picker */}
                  <View style={styles.mobileSection}>
                    <Text style={styles.sectionTitle}>Background Wallpaper</Text>
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
                        <Text style={styles.wallpaperActionText}>Import</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.wallpaperActionBtn,
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={() => setShowWallpaperPrompt((v) => !v)}
                        accessibilityRole="button"
                      >
                        <Ionicons name="sparkles-outline" size={15} color={colors.accent.primary} />
                        <Text style={styles.wallpaperActionText}>Generate</Text>
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
                        <Text style={styles.wallpaperActionText}>My Wallpapers</Text>
                      </Pressable>
                    </View>

                    {showWallpaperPrompt && (
                      <View style={{ marginTop: D.spacing.sm, gap: D.spacing.sm }}>
                        <TextInput
                          style={styles.textArea}
                          placeholder="Describe the wallpaper…"
                          placeholderTextColor={colors.text.muted}
                          value={wallpaperPrompt}
                          onChangeText={setWallpaperPrompt}
                          multiline
                          editable={wallpaperStage !== 'generating'}
                        />
                        <Pressable
                          style={({ pressed }) => [
                            styles.wallpaperGenBtn,
                            (wallpaperStage === 'generating' || !wallpaperPrompt.trim()) && {
                              opacity: 0.45,
                            },
                            pressed && { opacity: 0.8 },
                          ]}
                          onPress={handleGenerateWallpaper}
                          disabled={wallpaperStage === 'generating' || !wallpaperPrompt.trim()}
                          accessibilityRole="button"
                        >
                          {wallpaperStage === 'generating' ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Ionicons name="sparkles-outline" size={14} color="#fff" />
                          )}
                          <Text style={styles.wallpaperGenBtnText}>
                            {wallpaperStage === 'generating' ? 'Generating…' : 'Generate Wallpaper'}
                          </Text>
                        </Pressable>
                      </View>
                    )}

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
                          accessibilityLabel="Generated wallpaper preview"
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
                            }}
                            accessibilityRole="button"
                          >
                            <Ionicons name="checkmark" size={14} color="#fff" />
                            <Text style={styles.wallpaperConfirmBtnText}>Keep</Text>
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
                          accessibilityLabel="Selected wallpaper"
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
                  </View>

                  {/* Products */}
                  <View style={styles.mobileSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Choose Products</Text>
                      {selectedCount > 0 && (
                        <View style={styles.countBadge}>
                          <Text style={styles.countBadgeText}>{selectedCount} selected</Text>
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
                        <Text style={styles.emptyText}>
                          No products yet. Add some in the Products tab.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.productGrid}>
                        {products.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            selected={selected.has(p.id)}
                            onToggle={() => toggleProduct(p.id)}
                            cardWidth={productCardWidth}
                            colors={colors}
                            styles={styles}
                          />
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Placement options */}
                  <View style={styles.mobileSection}>
                    <Text style={styles.sectionTitle}>Placement Options</Text>
                    <OptionLabel label="Layout" />
                    <ChipSelector
                      options={LAYOUT_OPTIONS}
                      selected={layout}
                      onSelect={setLayout}
                      accessibilityLabel="Layout"
                    />
                    <OptionLabel label="Format" />
                    <ChipSelector
                      options={FORMAT_OPTIONS}
                      selected={catalogFormat}
                      onSelect={setCatalogFormat}
                      accessibilityLabel="Format"
                    />
                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Show Prices</Text>
                      <Switch
                        value={showPrices}
                        onValueChange={setShowPrices}
                        thumbColor={showPrices ? colors.accent.primary : colors.text.muted}
                        trackColor={{ false: colors.border.default, true: colors.accent.dim }}
                      />
                    </View>
                    <TextStyleControls
                      textStyle={textStyle}
                      setTextStyle={setTextStyle}
                      colors={colors}
                    />
                  </View>

                  <GenerateButton
                    loading={wallpaperOnGenerating}
                    disabled={selectedCount === 0 || wallpaperBase64 === null}
                    label={
                      wallpaperBase64 === null
                        ? 'Pick a wallpaper first'
                        : selectedCount === 0
                          ? 'Select products first'
                          : 'Place on Wallpaper'
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
                <Text style={styles.sectionTitle}>Post Type</Text>
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

              <View style={styles.mobileSection}>
                <Text style={styles.sectionTitle}>Content</Text>
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

              <View style={styles.mobileSection}>
                <Text style={styles.sectionTitle}>Style</Text>
                <OptionLabel label="Tone" />
                <ChipSelector
                  options={TONE_OPTIONS}
                  selected={tone}
                  onSelect={setTone}
                  accessibilityLabel="Tone"
                />
                <OptionLabel label="Format" />
                <ChipSelector
                  options={FORMAT_OPTIONS}
                  selected={annoFormat}
                  onSelect={setAnnoFormat}
                  accessibilityLabel="Format"
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

              <GenerateButton
                loading={annoGenerating}
                disabled={!content.trim()}
                label="Generate Graphic"
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
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
              <Text style={styles.videoTitle}>Video Ads</Text>
              <Text style={styles.videoDescription}>
                Generate professional short-form video ads powered by AI. Currently in development.
              </Text>
              <View style={styles.stepsCard}>
                <Text style={styles.stepsTitle}>{"What's coming"}</Text>
                {(
                  [
                    { icon: 'film-outline', label: 'Storyboard your concept' },
                    { icon: 'sparkles-outline', label: 'AI generates visuals' },
                    { icon: 'cloud-upload-outline', label: 'Export & share' },
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

      {/* Wallpaper picker modal */}
      <Modal
        visible={wallpaperPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWallpaperPickerVisible(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setWallpaperPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>My Wallpapers</Text>
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
                  const thumbSize = (screenWidth - D.spacing.md * 2 - D.spacing.sm) / 2;
                  return (
                    <Pressable
                      style={({ pressed }) => ({
                        width: thumbSize,
                        height: thumbSize,
                        borderRadius: D.radius.md,
                        overflow: 'hidden',
                        opacity: pressed ? 0.8 : 1,
                        borderWidth: 2,
                        borderColor: colors.border.default,
                      })}
                      onPress={() => pickWallpaperFromLibrary(item)}
                    >
                      <Image
                        source={{ uri: `data:${item.mimeType};base64,${item.imageBase64}` }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useTheme>['colors'], isDesktop: boolean) {
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
    resultImage: {
      width: '100%',
      aspectRatio: 1,
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
    mobileResultImage: { width: '100%', aspectRatio: 1 },

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
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      backgroundColor: colors.bg.surface,
      borderTopLeftRadius: D.radius.xl,
      borderTopRightRadius: D.radius.xl,
      maxHeight: '80%' as DimensionValue,
      paddingBottom: D.spacing.xl,
    },
    pickerHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginTop: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: D.spacing.lg,
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
  });
}
