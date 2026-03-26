import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type DimensionValue,
  Image,
  KeyboardAvoidingView,
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
  generateImage,
  type GenerateImageResponse,
  type ProductItem,
} from '@/utils/api';

const isWeb = Platform.OS === 'web';
const SIDEBAR_WIDTH = 320;
const DESKTOP_BREAKPOINT = 860;

type StudioTab = 'catalog' | 'announcements' | 'video';
type PostType = 'Announcement' | 'Job Post' | 'Info' | 'Promotion';

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

// ─── Prompt builders ───────────────────────────────────────────────────────────
function buildCatalogPrompt(
  products: ProductItem[],
  layout: string,
  colorTheme: string,
  format: string,
  showPrices: boolean
): string {
  const names = products.map((p) => `${p.name} ($${p.price.toFixed(2)})`).join(', ');
  return (
    `Create a professional product catalog ad image in ${format} format. ` +
    `Layout style: ${layout}. Color theme: ${colorTheme}. Products: ${names}. ` +
    (showPrices ? 'Display prices prominently.' : 'Do not show prices.') +
    ' Make it look like a high-quality retail advertisement.'
  );
}
function buildAnnouncementPrompt(
  postType: PostType,
  content: string,
  tone: string,
  format: string
): string {
  return (
    `Create a ${tone.toLowerCase()} ${postType.toLowerCase()} social media graphic ` +
    `in ${format} format. Content: "${content}". ` +
    `Style: clean, modern, suitable for a small retail shop. ` +
    `Make it visually striking and easy to read at a glance.`
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
        await generateImage(
          buildCatalogPrompt(chosen, layout, colorTheme, catalogFormat, showPrices)
        )
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCatalogGenerating(false);
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

  async function handleAnnoGenerate() {
    if (!content.trim()) return;
    setAnnoGenerating(true);
    setAnnoError(null);
    setAnnoResult(null);
    try {
      setAnnoResult(
        await generateImage(buildAnnouncementPrompt(postType, content.trim(), tone, annoFormat))
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
  // Mobile: 2 cols via '47%'
  const desktopPanelInner = screenWidth - SIDEBAR_WIDTH - 1 - 64;
  const desktopCardCols = desktopPanelInner > 600 ? 5 : desktopPanelInner > 420 ? 4 : 3;
  const desktopCardWidth = Math.floor(
    (desktopPanelInner - D.spacing.sm * (desktopCardCols - 1)) / desktopCardCols
  );
  const productCardWidth: DimensionValue = isDesktop ? desktopCardWidth : '47%';

  // ────────────────────────────────────────────────────────────────────────────
  // DESKTOP LAYOUT
  // ────────────────────────────────────────────────────────────────────────────
  if (isDesktop) {
    // ── Sidebar options per tab ──────────────────────────────────────────────
    const sidebarOptions =
      activeTab === 'catalog' ? (
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
        </>
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
        </>
      ) : null;

    const sidebarFooter =
      activeTab === 'catalog' ? (
        <GenerateButton
          loading={catalogGenerating}
          disabled={selectedCount === 0}
          label={selectedCount === 0 ? 'Select products first' : `Generate Catalog`}
          onPress={handleCatalogGenerate}
        />
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
                <Text style={styles.emptyText}>No products yet. Add some in the Products tab.</Text>
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

          {/* Preview */}
          <View style={styles.desktopSection}>
            <Text style={styles.desktopSectionTitle}>Preview</Text>
            <Text style={styles.desktopSectionSub}>Your generated catalog will appear here</Text>
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
  });
}
