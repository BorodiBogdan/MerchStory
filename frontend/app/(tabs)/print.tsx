import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  FlatList,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipSelector } from '@/components/ui/ChipSelector';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { PaperPreview } from '@/components/ui/PaperPreview';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  fetchGallery,
  fetchGalleryImage,
  type GalleryItem,
  getPrintJob,
  type PaperSize,
  type PrintJobDetails,
  type QrBackground,
  type QrSize,
  renderPrint,
} from '@/utils/api';
import * as galleryCache from '@/utils/galleryCache';

const DESKTOP_BREAKPOINT = 900;

const PAPER_SIZE_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: 'A6', label: 'A6' },
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
];

const QR_SIZE_OPTIONS: { value: QrSize; label: string }[] = [
  { value: 'S', label: 'Small' },
  { value: 'M', label: 'Medium' },
  { value: 'L', label: 'Large' },
];

const QR_BG_OPTIONS: { value: QrBackground; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'transparent', label: 'Transparent' },
];

const PRINT_COST = 1;

// Pixel dimensions (short × long edge) needed for 300 DPI print quality.
// Mirrors backend RequiredPixels300Dpi in PrintRoutes.cs.
const REQUIRED_PIXELS_300DPI: Record<PaperSize, [number, number]> = {
  A6: [1240, 1748],
  A5: [1748, 2480],
  A4: [2480, 3508],
  A3: [3508, 4961],
};

function hasEnoughResolution(
  dims: { width: number; height: number } | null,
  paperSize: PaperSize
): boolean {
  if (!dims) return false;
  const [needShort, needLong] = REQUIRED_PIXELS_300DPI[paperSize];
  const shortEdge = Math.min(dims.width, dims.height);
  const longEdge = Math.max(dims.width, dims.height);
  return shortEdge >= needShort && longEdge >= needLong;
}

export default function PrintScreen() {
  const { colors } = useTheme();
  const { coinBalance, setCoinBalance } = useAuth();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const styles = useMemo(() => makeStyles(colors, isDesktop), [colors, isDesktop]);

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [previewImage, setPreviewImage] = useState<{ base64: string; mimeType: string } | null>(
    null
  );
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [includeQr, setIncludeQr] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState('');
  const [qrX, setQrX] = useState(1);
  const [qrY, setQrY] = useState(1);
  const [qrSize, setQrSize] = useState<QrSize>('M');
  const [qrBackground, setQrBackground] = useState<QrBackground>('white');
  const [rendering, setRendering] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);

  const isPrintReady = hasEnoughResolution(imageDims, paperSize);
  const estimatedCost = isPrintReady ? 0 : PRINT_COST;
  const insufficientCoins = coinBalance < estimatedCost;
  const showQrBadge = includeQr && qrTargetUrl.trim().length > 0;
  const previewCaption = paperSize;

  useEffect(() => {
    let cancelled = false;
    setGalleryLoading(true);
    fetchGallery({ pageSize: 100 })
      .then((res) => {
        if (cancelled) return;
        setGalleryItems(res.items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setGalleryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      setPreviewImage(null);
      setImageDims(null);
      return;
    }
    let cancelled = false;
    fetchGalleryImage(selectedItem.id)
      .then((res) => {
        if (!cancelled) {
          setPreviewImage({ base64: res.imageBase64, mimeType: res.mimeType });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  useEffect(() => {
    if (!previewImage) {
      setImageDims(null);
      return;
    }
    let cancelled = false;
    const uri = `data:${previewImage.mimeType};base64,${previewImage.base64}`;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled) setImageDims({ width, height });
      },
      () => {
        if (!cancelled) setImageDims(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [previewImage]);

  async function handleRender() {
    if (!selectedItem) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setRendering(true);
    setRenderError(null);
    setRenderNotice(null);
    try {
      const trimmedUrl = qrTargetUrl.trim();
      const sendQr = includeQr && trimmedUrl.length > 0;
      const job = await renderPrint({
        generatedImageId: selectedItem.id,
        paperSize,
        qrTargetUrl: sendQr ? trimmedUrl : undefined,
        qrX: sendQr ? qrX : undefined,
        qrY: sendQr ? qrY : undefined,
        qrSize: sendQr ? qrSize : undefined,
        qrBackground: sendQr ? qrBackground : undefined,
      });

      const ready = await waitForJob(job.jobId);
      if (ready.status !== 'ready' || !ready.pdfBase64) {
        setRenderError(ready.errorMessage ?? t('print.error.generic'));
        return;
      }

      await deliverPdf(ready.pdfBase64, selectedItem.name, paperSize);
      galleryCache.invalidate('Pdf');
      if (typeof job.newBalance === 'number') {
        void setCoinBalance(job.newBalance);
      }
      setRenderNotice(
        job.upscaled
          ? `${t('print.notice.upscaled')} ${PRINT_COST} ${t('print.coinsLabel')}.`
          : t('print.notice.printReady')
      );
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : t('print.error.generic'));
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    if (!rendering) {
      setProgressStep(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressStep((s) => (s + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, [rendering]);

  const progressMessage = [
    t('print.progress.step1'),
    t('print.progress.step2'),
    t('print.progress.step3'),
  ][progressStep];

  const renderDisabled = !selectedItem || rendering || insufficientCoins;
  const renderLabel = rendering
    ? t('print.button.rendering')
    : !selectedItem
      ? t('print.button.pickFirst')
      : insufficientCoins
        ? `${t('print.button.needCoinsPrefix')} ${estimatedCost} ${t('print.coinsLabel')}`
        : t('print.button.generate');

  const configColumn = (
    <View style={styles.configColumn}>
      <SectionHeader
        eyebrow={t('print.section.assetEyebrow')}
        title={t('print.section.assetTitle')}
        helper={t('print.section.assetHelper')}
      />
      {galleryLoading ? (
        <View style={styles.assetLoading}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : galleryItems.length === 0 ? (
        <EmptyAssetsCard onOpenStudio={() => router.push('/')} />
      ) : (
        <SelectedAssetCard
          item={selectedItem}
          previewBase64={previewImage?.base64 ?? null}
          previewMimeType={previewImage?.mimeType ?? null}
          onOpen={() => setPickerOpen(true)}
        />
      )}

      <View style={styles.sectionGap} />
      <SectionHeader
        eyebrow={t('print.section.sizeEyebrow')}
        title={t('print.section.sizeTitle')}
      />
      <ChipSelector
        options={PAPER_SIZE_OPTIONS}
        selected={paperSize}
        onSelect={(v) => setPaperSize(v as PaperSize)}
        accessibilityLabel={t('print.section.sizeTitle')}
      />

      <CostInfo
        cost={estimatedCost}
        isFree={isPrintReady}
        insufficientCoins={insufficientCoins}
        onTopUp={() => router.push('/(tabs)/wallet')}
      />

      <View style={styles.sectionGap} />
      <SectionHeader eyebrow={t('print.section.qrEyebrow')} title={t('print.section.qrTitle')} />
      <QrToggleCard
        includeQr={includeQr}
        onToggle={setIncludeQr}
        title={t('print.qr.toggleTitle')}
        helper={t('print.qr.toggleHelper')}
      />
      {includeQr && (
        <View style={styles.qrInputWrap}>
          <FloatingInput
            label={t('print.qr.urlLabel')}
            value={qrTargetUrl}
            onChangeText={setQrTargetUrl}
            leftIcon="link-outline"
            keyboardType="url"
            autoCapitalize="none"
            accessibilityLabel={t('print.qr.urlLabel')}
          />
          <View style={styles.qrSizeWrap}>
            <ChipSelector
              options={QR_SIZE_OPTIONS}
              selected={qrSize}
              onSelect={(v) => setQrSize(v as QrSize)}
              accessibilityLabel="QR size"
            />
            <ChipSelector
              options={QR_BG_OPTIONS}
              selected={qrBackground}
              onSelect={(v) => setQrBackground(v as QrBackground)}
              accessibilityLabel="QR background"
            />
            <Text style={styles.qrDragHint}>Drag the QR on the preview to reposition it.</Text>
          </View>
        </View>
      )}

      {renderError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.text.error} />
          <Text style={styles.errorText} numberOfLines={3}>
            {renderError}
          </Text>
        </View>
      )}

      {renderNotice && (
        <View style={styles.noticeBanner}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent.primary} />
          <Text style={styles.noticeText} numberOfLines={3}>
            {renderNotice}
          </Text>
        </View>
      )}

      <Pressable
        onPress={handleRender}
        disabled={renderDisabled}
        accessibilityRole="button"
        accessibilityLabel={rendering ? progressMessage : renderLabel}
        accessibilityState={{ disabled: renderDisabled, busy: rendering }}
        style={({ pressed }) => [
          styles.renderButton,
          renderDisabled && styles.renderButtonDisabled,
          pressed && !renderDisabled && styles.renderButtonPressed,
        ]}
      >
        {rendering ? (
          <>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.renderButtonText}>{progressMessage}</Text>
          </>
        ) : (
          <>
            <Ionicons name="print" size={18} color="#FFFFFF" />
            <Text style={styles.renderButtonText}>{renderLabel}</Text>
          </>
        )}
      </Pressable>
      {rendering && (
        <Text style={styles.progressHint} numberOfLines={2}>
          {t('print.progress.takeAWhile')}
        </Text>
      )}
    </View>
  );

  const previewColumn = (
    <View style={styles.previewColumn}>
      <View style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>{t('print.preview.eyebrow')}</Text>
          </View>
          <Text style={styles.previewTitle}>{t('print.preview.title')}</Text>
        </View>
        <PaperPreview
          imageBase64={previewImage?.base64 ?? null}
          imageMimeType={previewImage?.mimeType ?? null}
          paperSize={paperSize}
          orientation="portrait"
          showQrBadge={showQrBadge}
          qrTargetUrl={qrTargetUrl.trim() || null}
          qrX={qrX}
          qrY={qrY}
          qrSize={qrSize}
          qrBackground={qrBackground}
          onQrPositionChange={(x, y) => {
            setQrX(x);
            setQrY(y);
          }}
          maxWidth={isDesktop ? 320 : 300}
          caption={previewCaption}
        />
        <View style={styles.summaryRow}>
          <SummaryChip icon="resize-outline" label={paperSize} />
          <SummaryChip
            icon="qr-code-outline"
            label={showQrBadge ? t('print.preview.qrOn') : t('print.preview.qrOff')}
            muted={!showQrBadge}
          />
        </View>
      </View>
    </View>
  );

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg.base }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + D.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.ambientGlow} pointerEvents="none" />
          <View style={styles.ambientGlow2} pointerEvents="none" />

          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>{t('print.title')}</Text>
            <Text style={styles.heroSubtitle}>{t('print.subtitle')}</Text>
          </View>

          {isDesktop ? (
            <View style={styles.twoCol}>
              {configColumn}
              {previewColumn}
            </View>
          ) : (
            <View style={styles.oneCol}>
              {configColumn}
              {previewColumn}
            </View>
          )}
        </View>
      </ScrollView>
      <AssetPickerModal
        visible={pickerOpen}
        items={galleryItems}
        selectedId={selectedItem?.id ?? null}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          if (Platform.OS !== 'web') {
            Haptics.selectionAsync().catch(() => {});
          }
          setSelectedItem(item);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

// ─── Section header ──────────────────────────────────────────────────────
function SectionHeader({
  eyebrow,
  title,
  helper,
}: {
  eyebrow: string;
  title: string;
  helper?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeSectionHeaderStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <View style={styles.eyebrow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.eyebrowText}>{eyebrow}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────
function EmptyAssetsCard({ onOpenStudio }: { onOpenStudio: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeEmptyStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={styles.iconTile}>
        <Ionicons name="images-outline" size={26} color={colors.accent.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{t('print.empty.title')}</Text>
        <Text style={styles.bodyText}>{t('print.empty.body')}</Text>
      </View>
      <Pressable
        onPress={onOpenStudio}
        accessibilityRole="button"
        accessibilityLabel={t('print.empty.cta')}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.ctaText}>{t('print.empty.cta')}</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.accent.primary} />
      </Pressable>
    </View>
  );
}

// ─── Selected-asset card (inline trigger) ────────────────────────────────
function SelectedAssetCard({
  item,
  previewBase64,
  previewMimeType,
  onOpen,
}: {
  item: GalleryItem | null;
  previewBase64: string | null;
  previewMimeType: string | null;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeSelectedAssetStyles(colors, !!item), [colors, item]);

  const thumbUri =
    item && previewBase64 && previewMimeType
      ? `data:${previewMimeType};base64,${previewBase64}`
      : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={item ? t('print.picker.change') : t('print.picker.browse')}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.thumbWrap}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name="images-outline" size={28} color={colors.accent.primary} />
          </View>
        )}
      </View>
      <View style={styles.body}>
        {item ? (
          <>
            <Text style={styles.eyebrow}>{t('print.picker.selectedLabel')}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {item.name}
            </Text>
          </>
        ) : (
          <Text style={styles.title}>{t('print.picker.browse')}</Text>
        )}
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>
          {item ? t('print.picker.change') : t('print.picker.browse')}
        </Text>
        <Ionicons name="arrow-forward" size={14} color={colors.accent.primary} />
      </View>
    </Pressable>
  );
}

// ─── Asset thumbnail (loads its own bytes) ───────────────────────────────
function AssetThumb({ id, style }: { id: string; style?: object }) {
  const { colors } = useTheme();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGalleryImage(id)
      .then((res) => {
        if (!cancelled) setUri(`data:${res.mimeType};base64,${res.imageBase64}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!uri) {
    return <View style={[{ backgroundColor: colors.bg.input }, style]} />;
  }
  return <Image source={{ uri }} style={style as object} resizeMode="cover" />;
}

// ─── Asset picker modal (search + grid) ──────────────────────────────────
function AssetPickerModal({
  visible,
  items,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  items: GalleryItem[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (item: GalleryItem) => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= DESKTOP_BREAKPOINT;
  const styles = useMemo(() => makePickerStyles(colors), [colors]);

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, search]);

  const DIALOG_MAX = 880;
  const dialogWidth = Math.min(screenWidth - 96, DIALOG_MAX);
  const COLS_DESKTOP = 4;
  const COLS_MOBILE = 2;
  const cols = isDesktop ? COLS_DESKTOP : COLS_MOBILE;
  const padding = D.spacing.lg;
  const gap = D.spacing.sm;
  const containerWidth = isDesktop ? dialogWidth : screenWidth;
  const thumbWidth = Math.floor((containerWidth - padding * 2 - gap * (cols - 1)) / cols);

  const isFiltered = search.trim().length > 0;
  const resultLabel = `${filtered.length} ${
    filtered.length === 1 ? t('print.picker.resultsOne') : t('print.picker.resultsOther')
  }`;

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{t('print.picker.title')}</Text>
        <Text style={styles.subtitle}>{t('print.picker.subtitle')}</Text>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        style={({ pressed }: { pressed: boolean }) => [
          styles.closeBtn,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="close" size={18} color={colors.text.secondary} />
      </Pressable>
    </View>
  );

  const searchBar = (
    <View style={[styles.searchWrap, { paddingHorizontal: padding }]}>
      <View style={styles.searchInputBox}>
        <Ionicons name="search" size={16} color={colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('print.picker.searchPlaceholder')}
          placeholderTextColor={colors.text.muted}
          style={[
            styles.searchInput,
            Platform.OS === 'web' ? ({ outlineWidth: 0 } as object) : null,
          ]}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('print.picker.searchPlaceholder')}
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch('')}
            accessibilityRole="button"
            accessibilityLabel={t('print.picker.clearSearch')}
            hitSlop={6}
          >
            <Ionicons name="close-circle" size={16} color={colors.text.muted} />
          </Pressable>
        )}
      </View>
      <Text style={styles.resultText}>{resultLabel}</Text>
    </View>
  );

  const body = (
    <>
      {searchBar}
      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="images-outline" size={32} color={colors.text.muted} />
          <Text style={styles.emptyText}>
            {isFiltered ? t('print.picker.filteredEmpty') : t('print.picker.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          numColumns={cols}
          key={cols}
          contentContainerStyle={{ padding, gap }}
          columnWrapperStyle={{ gap }}
          renderItem={({ item }) => {
            const isSel = selectedId === item.id;
            return (
              <Pressable
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: isSel }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.gridItem,
                  {
                    width: thumbWidth,
                    borderColor: isSel
                      ? colors.accent.primary
                      : hovered
                        ? colors.border.focus
                        : colors.border.subtle,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.gridThumbWrap}>
                  <AssetThumb id={item.id} style={styles.gridThumb} />
                  {isSel && (
                    <View style={styles.gridCheckBadge}>
                      <Ionicons name="checkmark" size={14} color={colors.accent.primary} />
                    </View>
                  )}
                </View>
                <View style={styles.gridNameRow}>
                  <Text style={styles.gridName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent={isDesktop}
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      {isDesktop ? (
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.dialog, { width: dialogWidth, maxHeight: '90%' as DimensionValue }]}
            onPress={() => {}}
          >
            {header}
            {body}
          </Pressable>
        </Pressable>
      ) : (
        <View style={[styles.fullscreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {header}
          {body}
        </View>
      )}
    </Modal>
  );
}

// ─── Cost info block ─────────────────────────────────────────────────────
function CostInfo({
  cost,
  isFree,
  insufficientCoins,
  onTopUp,
}: {
  cost: number;
  isFree: boolean;
  insufficientCoins: boolean;
  onTopUp: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(
    () => makeCostStyles(colors, insufficientCoins),
    [colors, insufficientCoins]
  );

  return (
    <View style={styles.card}>
      <View style={styles.iconTile}>
        <Ionicons
          name={isFree ? 'checkmark-circle' : 'sparkles'}
          size={18}
          color={colors.accent.primary}
        />
      </View>
      <View style={styles.body}>
        {isFree ? (
          <Text style={styles.helper}>{t('print.cost.free')}</Text>
        ) : (
          <View style={styles.costRow}>
            <Text style={styles.costPrefix}>{t('print.cost.label')}</Text>
            <CoinIcon size={14} />
            <Text style={styles.costNumber}>{cost}</Text>
            <Text style={styles.costSuffix}>{t('print.coinsLabel')}</Text>
          </View>
        )}
        {insufficientCoins && (
          <View style={styles.warningRow}>
            <Text style={styles.warningText}>{t('print.cost.notEnoughCoins')}</Text>
            <Pressable
              onPress={onTopUp}
              accessibilityRole="link"
              accessibilityLabel={t('print.cost.topUp')}
              hitSlop={6}
            >
              <Text style={styles.topUpText}>{t('print.cost.topUp')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── QR toggle card ──────────────────────────────────────────────────────
function QrToggleCard({
  includeQr,
  onToggle,
  title,
  helper,
}: {
  includeQr: boolean;
  onToggle: (v: boolean) => void;
  title: string;
  helper: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeQrStyles(colors, includeQr), [colors, includeQr]);
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') {
          Haptics.selectionAsync().catch(() => {});
        }
        onToggle(!includeQr);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: includeQr }}
      accessibilityLabel={title}
      style={styles.card}
    >
      <View style={styles.iconTile}>
        <Ionicons
          name="qr-code-outline"
          size={20}
          color={includeQr ? colors.accent.primary : colors.text.muted}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.helper}>{helper}</Text>
      </View>
      <Switch
        value={includeQr}
        onValueChange={onToggle}
        trackColor={{ false: colors.bg.input, true: colors.accent.dim }}
        thumbColor={includeQr ? colors.accent.primary : colors.text.muted}
        ios_backgroundColor={colors.bg.input}
      />
    </Pressable>
  );
}

// ─── Summary chip ────────────────────────────────────────────────────────
function SummaryChip({
  icon,
  label,
  muted,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeSummaryStyles(colors, !!muted), [colors, muted]);
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color={muted ? colors.text.muted : colors.text.secondary} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

// ─── Job polling and PDF delivery (unchanged) ────────────────────────────
async function waitForJob(jobId: string): Promise<PrintJobDetails> {
  // 3 min cap — Real-ESRGAN inference for A3 (4×) can take 30-60s on CPU,
  // and Lanczos fallback is near-instant, so the higher ceiling only ever
  // bites when the AI upscaler is actually running.
  const maxAttempts = 180;
  for (let i = 0; i < maxAttempts; i++) {
    const job = await getPrintJob(jobId);
    if (job.status === 'ready' || job.status === 'failed') return job;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Render timed out.');
}

async function deliverPdf(base64: string, baseName: string, paperSize: string) {
  const filename = `${slugify(baseName) || 'print'}-${paperSize}.pdf`;
  if (Platform.OS === 'web') {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const targetUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(targetUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ─── Styles ──────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useTheme>['colors'], isDesktop: boolean) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: isDesktop ? D.spacing.xl : D.spacing.md,
      paddingTop: isDesktop ? D.spacing.lg : D.spacing.md,
      paddingBottom: isDesktop ? D.spacing.xl : D.spacing.lg,
    },
    container: {
      width: '100%',
      maxWidth: 1120,
      position: 'relative',
    },
    ambientGlow: {
      position: 'absolute',
      top: -120,
      left: -120,
      width: 360,
      height: 360,
      borderRadius: 360,
      backgroundColor: colors.accent.dim,
      opacity: 0.45,
      ...(Platform.OS === 'web' ? ({ filter: 'blur(72px)' } as object) : {}),
    },
    ambientGlow2: {
      position: 'absolute',
      bottom: -160,
      right: -120,
      width: 320,
      height: 320,
      borderRadius: 320,
      backgroundColor: colors.accent.dim,
      opacity: 0.3,
      ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as object) : {}),
    },
    heroRow: {
      flexDirection: isDesktop ? 'row' : 'column',
      alignItems: isDesktop ? 'baseline' : 'flex-start',
      gap: isDesktop ? D.spacing.md : 4,
      paddingBottom: D.spacing.xs,
    },
    heroTitle: {
      fontSize: isDesktop ? D.fontSize.xl : D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.6,
      lineHeight: isDesktop ? 28 : 36,
    },
    heroSubtitle: {
      flex: isDesktop ? 1 : undefined,
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    twoCol: {
      flexDirection: 'row',
      gap: D.spacing.xl,
      alignItems: 'flex-start',
      marginTop: D.spacing.md,
    },
    oneCol: {
      flexDirection: 'column',
      gap: D.spacing.lg,
      marginTop: D.spacing.sm,
    },
    configColumn: {
      flex: isDesktop ? 1 : undefined,
      minWidth: 0,
      width: isDesktop ? undefined : '100%',
    },
    previewColumn: {
      width: isDesktop ? 400 : '100%',
      ...(isDesktop && Platform.OS === 'web' ? ({ position: 'sticky', top: 24 } as object) : {}),
    },
    previewCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: isDesktop ? D.spacing.lg : D.spacing.md,
      gap: D.spacing.md,
    },
    previewHeader: {
      gap: 4,
    },
    eyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    eyebrowDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent.primary,
    },
    eyebrowText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    previewTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
      marginTop: D.spacing.xs,
    },
    sectionGap: {
      height: D.spacing.lg,
    },
    assetRow: {
      gap: D.spacing.sm,
      paddingVertical: D.spacing.xs,
      paddingHorizontal: 2,
    },
    assetLoading: {
      height: 168,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrInputWrap: {
      marginTop: D.spacing.sm,
    },
    qrSizeWrap: {
      marginTop: D.spacing.sm,
      gap: 4,
    },
    qrDragHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      paddingHorizontal: 2,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      padding: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.error,
      borderLeftWidth: 3,
      borderLeftColor: colors.text.error,
      marginTop: D.spacing.lg,
    },
    errorText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.error,
      lineHeight: 19,
    },
    noticeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      padding: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.focus,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent.primary,
      marginTop: D.spacing.lg,
    },
    noticeText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 19,
    },
    renderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
      height: 52,
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.md,
      marginTop: D.spacing.lg,
      ...D.shadow.glow,
      ...(Platform.OS === 'web'
        ? ({ cursor: 'pointer', transitionDuration: '180ms' } as object)
        : {}),
    },
    renderButtonDisabled: {
      opacity: 0.55,
      ...(Platform.OS === 'web' ? ({ cursor: 'not-allowed' } as object) : {}),
    },
    renderButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    renderButtonText: {
      color: '#FFFFFF',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      letterSpacing: 0.3,
    },
    progressHint: {
      marginTop: D.spacing.sm,
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
}

function makeSectionHeaderStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      marginBottom: D.spacing.sm,
    },
    eyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    eyebrowDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent.primary,
    },
    eyebrowText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    helper: {
      marginTop: 2,
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 19,
    },
  });
}

function makeEmptyStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.md,
    },
    iconTile: {
      width: 48,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    bodyText: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 19,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    ctaText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.3,
    },
  });
}

function makeSelectedAssetStyles(colors: ReturnType<typeof useTheme>['colors'], hasItem: boolean) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: hasItem ? colors.accent.primary : colors.border.subtle,
      borderRadius: D.radius.lg,
      padding: D.spacing.md,
      ...(Platform.OS === 'web'
        ? ({ cursor: 'pointer', transitionDuration: '180ms' } as object)
        : {}),
    },
    cardHovered: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.bg.elevated,
    },
    cardPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.995 }],
    },
    thumbWrap: {
      width: 64,
      height: 64,
      borderRadius: D.radius.md,
      overflow: 'hidden',
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    thumbPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    helper: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 18,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.accent.primary,
    },
    ctaText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      letterSpacing: 0.3,
    },
  });
}

function makePickerStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.lg,
    },
    dialog: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.modal,
    },
    fullscreen: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.spacing.lg,
      paddingVertical: D.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: D.spacing.sm,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.elevated,
    },
    searchWrap: {
      paddingTop: D.spacing.md,
      paddingBottom: D.spacing.sm,
      gap: 6,
    },
    searchInputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      height: 44,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    searchInput: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.primary,
      paddingVertical: 0,
      backgroundColor: 'transparent',
    },
    resultText: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      paddingLeft: 4,
    },
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: D.spacing['2xl'],
      gap: D.spacing.sm,
    },
    emptyText: {
      color: colors.text.muted,
      fontSize: D.fontSize.sm,
    },
    gridItem: {
      backgroundColor: colors.bg.base,
      borderRadius: D.radius.md,
      borderWidth: 1.5,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({ cursor: 'pointer', transitionDuration: '180ms' } as object)
        : {}),
    },
    gridThumbWrap: {
      width: '100%',
      aspectRatio: 1,
      position: 'relative',
    },
    gridThumb: {
      width: '100%',
      height: '100%',
    },
    gridCheckBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderWidth: 1,
      borderColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridNameRow: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 6,
      backgroundColor: colors.bg.elevated,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    gridName: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
  });
}

function makeCostStyles(colors: ReturnType<typeof useTheme>['colors'], insufficient: boolean) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.md,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: insufficient ? colors.border.error : colors.border.subtle,
      padding: D.spacing.md,
      marginTop: D.spacing.sm,
    },
    iconTile: {
      width: 32,
      height: 32,
      borderRadius: D.radius.sm,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.focus,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: 6,
    },
    helper: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 19,
    },
    costRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    costPrefix: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    costNumber: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    costSuffix: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
    },
    warningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    warningText: {
      fontSize: D.fontSize.xs,
      color: colors.text.error,
    },
    topUpText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      textDecorationLine: 'underline',
    },
  });
}

function makeQrStyles(colors: ReturnType<typeof useTheme>['colors'], on: boolean) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.md,
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: on ? colors.accent.primary : colors.border.subtle,
      padding: D.spacing.md,
      ...(Platform.OS === 'web'
        ? ({ cursor: 'pointer', transitionDuration: '180ms' } as object)
        : {}),
    },
    iconTile: {
      width: 40,
      height: 40,
      borderRadius: D.radius.sm,
      backgroundColor: on ? colors.accent.dim : colors.bg.elevated,
      borderWidth: 1,
      borderColor: on ? colors.border.focus : colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    helper: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      lineHeight: 19,
    },
  });
}

function makeSummaryStyles(colors: ReturnType<typeof useTheme>['colors'], muted: boolean) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      opacity: muted ? 0.6 : 1,
    },
    text: {
      fontSize: 11,
      fontWeight: D.fontWeight.bold,
      color: muted ? colors.text.muted : colors.text.secondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
  });
}
