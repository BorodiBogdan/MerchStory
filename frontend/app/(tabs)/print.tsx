import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipSelector } from '@/components/ui/ChipSelector';
import { PaperPreview } from '@/components/ui/PaperPreview';
import { D } from '@/constants/design';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/context/theme';
import {
  fetchGallery,
  fetchGalleryImage,
  type GalleryItem,
  getPrintJob,
  type PaperSize,
  type PrintJobDetails,
  type PrintOrientation,
  type PrintQualityTier,
  renderPrint,
} from '@/utils/api';

const PAPER_SIZE_OPTIONS = [
  { value: 'A6', label: 'A6' },
  { value: 'A5', label: 'A5' },
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
];

const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
];

const PREMIUM_COST: Record<PaperSize, number> = {
  A6: 5,
  A5: 5,
  A4: 5,
  A3: 10,
};

export default function PrintScreen() {
  const { colors } = useTheme();
  const { coinBalance } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [previewImage, setPreviewImage] = useState<{ base64: string; mimeType: string } | null>(
    null
  );
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<PrintOrientation>('portrait');
  const [qualityTier, setQualityTier] = useState<PrintQualityTier>('standard');
  const [includeQr, setIncludeQr] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const premiumCost = PREMIUM_COST[paperSize];
  const insufficientCoins = qualityTier === 'premium' && coinBalance < premiumCost;

  useEffect(() => {
    let cancelled = false;
    setGalleryLoading(true);
    fetchGallery({ pageSize: 30 })
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

  async function handleRender() {
    if (!selectedItem) return;
    setRendering(true);
    setRenderError(null);
    try {
      const trimmedUrl = qrTargetUrl.trim();
      const job = await renderPrint({
        generatedImageId: selectedItem.id,
        paperSize,
        orientation,
        qualityTier,
        qrTargetUrl: includeQr && trimmedUrl.length > 0 ? trimmedUrl : undefined,
      });

      const ready = await waitForJob(job.jobId);
      if (ready.status !== 'ready' || !ready.pdfBase64) {
        setRenderError(ready.errorMessage ?? 'Render failed.');
        return;
      }

      await deliverPdf(ready.pdfBase64, selectedItem.name, paperSize);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Render failed.');
    } finally {
      setRendering(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + D.spacing.xl }]}
    >
      <Text style={styles.title}>Print Shop</Text>
      <Text style={styles.subtitle}>Export any generated asset as a paper-sized PDF</Text>

      <Section title="1. Pick an asset">
        {galleryLoading ? (
          <ActivityIndicator color={colors.accent.primary} />
        ) : galleryItems.length === 0 ? (
          <Text style={styles.muted}>
            You haven&apos;t generated anything yet. Head to Studio first.
          </Text>
        ) : (
          <FlatList
            data={galleryItems}
            horizontal
            keyExtractor={(it) => it.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.assetRow}
            renderItem={({ item }) => (
              <AssetCard
                item={item}
                isSelected={selectedItem?.id === item.id}
                onPress={() => setSelectedItem(item)}
              />
            )}
          />
        )}
      </Section>

      <Section title="2. Paper size">
        <ChipSelector
          options={PAPER_SIZE_OPTIONS}
          selected={paperSize}
          onSelect={(v) => setPaperSize(v as PaperSize)}
          accessibilityLabel="Paper size"
        />
      </Section>

      <Section title="3. Orientation">
        <ChipSelector
          options={ORIENTATION_OPTIONS}
          selected={orientation}
          onSelect={(v) => setOrientation(v as PrintOrientation)}
          accessibilityLabel="Orientation"
        />
      </Section>

      <Section title="4. Quality">
        <ChipSelector
          options={QUALITY_OPTIONS}
          selected={qualityTier}
          onSelect={(v) => setQualityTier(v as PrintQualityTier)}
          accessibilityLabel="Print quality"
        />
        {qualityTier === 'premium' ? (
          <Text style={[styles.muted, styles.spacedTop]}>
            Premium upscales the image for sharper prints. Costs {premiumCost} coins.
          </Text>
        ) : (
          <Text style={[styles.muted, styles.spacedTop]}>
            Standard renders the image at its native resolution. Free.
          </Text>
        )}
      </Section>

      <Section title="5. QR code">
        <View style={styles.row}>
          <Switch value={includeQr} onValueChange={setIncludeQr} />
          <Text style={styles.rowLabel}>Add a trackable QR code to the print</Text>
        </View>
        {includeQr && (
          <TextInput
            style={styles.input}
            placeholder="https://your-shop.example"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={qrTargetUrl}
            onChangeText={setQrTargetUrl}
          />
        )}
      </Section>

      <Section title="Preview">
        <PaperPreview
          imageBase64={previewImage?.base64 ?? null}
          imageMimeType={previewImage?.mimeType ?? null}
          paperSize={paperSize}
          orientation={orientation}
          showQrBadge={includeQr && qrTargetUrl.trim().length > 0}
          maxWidth={320}
        />
      </Section>

      {renderError && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.text.error} />
          <Text style={styles.errorText}>{renderError}</Text>
        </View>
      )}

      <Pressable
        onPress={handleRender}
        disabled={!selectedItem || rendering || insufficientCoins}
        style={({ pressed }) => [
          styles.renderButton,
          (!selectedItem || rendering || insufficientCoins) && styles.renderButtonDisabled,
          pressed && styles.renderButtonPressed,
        ]}
      >
        {rendering ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="print" size={20} color="#fff" />
            <Text style={styles.renderButtonText}>
              {insufficientCoins ? `Need ${premiumCost} coins` : 'Generate PDF'}
            </Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

async function waitForJob(jobId: string): Promise<PrintJobDetails> {
  const maxAttempts = 60;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function AssetCard({
  item,
  isSelected,
  onPress,
}: {
  item: GalleryItem;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGalleryImage(item.id)
      .then((res) => {
        if (!cancelled) setThumb(`data:${res.mimeType};base64,${res.imageBase64}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <Pressable onPress={onPress} style={[styles.assetCard, isSelected && styles.assetCardSelected]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.assetThumb} resizeMode="cover" />
      ) : (
        <View style={styles.assetThumbPlaceholder} />
      )}
      <Text style={styles.assetName} numberOfLines={1}>
        {item.name}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    container: {
      padding: D.spacing.lg,
    },
    title: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: D.spacing.xs,
      marginBottom: D.spacing.lg,
    },
    section: {
      marginBottom: D.spacing.lg,
    },
    sectionTitle: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.sm,
    },
    muted: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    spacedTop: {
      marginTop: D.spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    rowLabel: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
    },
    input: {
      marginTop: D.spacing.sm,
      paddingHorizontal: D.spacing.md,
      paddingVertical: D.spacing.sm,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
    },
    assetRow: {
      gap: D.spacing.sm,
      paddingVertical: D.spacing.xs,
    },
    assetCard: {
      width: 120,
      borderRadius: D.radius.md,
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
    },
    assetCardSelected: {
      borderColor: colors.accent.primary,
    },
    assetThumb: {
      width: '100%',
      aspectRatio: 1,
    },
    assetThumbPlaceholder: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: colors.bg.input,
    },
    assetName: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.xs,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
      padding: D.spacing.md,
      backgroundColor: colors.bg.input,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.error,
      marginBottom: D.spacing.md,
    },
    errorText: {
      flex: 1,
      fontSize: D.fontSize.sm,
      color: colors.text.error,
    },
    renderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
      backgroundColor: colors.accent.primary,
      paddingVertical: D.spacing.md,
      borderRadius: D.radius.pill,
    },
    renderButtonDisabled: {
      opacity: 0.5,
    },
    renderButtonPressed: {
      opacity: 0.85,
    },
    renderButtonText: {
      color: '#fff',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
    },
  });
}
