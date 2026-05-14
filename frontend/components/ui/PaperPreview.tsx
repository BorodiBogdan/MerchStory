import QrCreator from 'qrcode';
import { useMemo } from 'react';
import { Image, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import type { PaperSize, PrintOrientation, QrBackground, QrSize } from '@/utils/api';

const PAPER_RATIOS: Record<PaperSize, { w: number; h: number }> = {
  A6: { w: 105, h: 148 },
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

// QR badge size as a fraction of the page short edge. Mirrors backend
// PrintRoutes/PdfRenderer so the preview occupies the same on-paper proportion
// as the rendered PDF — and stays constant across A6..A3.
const QR_FRAC_BY_SIZE: Record<QrSize, number> = {
  S: 0.108,
  M: 0.134,
  L: 0.188,
};

// QRCoder bakes a 4-module quiet zone INSIDE the rendered PNG, so the
// matrix fills N/(N+8) of the image. Mirror that via react-native-qrcode-svg's
// `quietZone` prop so the preview matrix occupies the same fraction of the
// QR area as it does in the rendered PDF.
const PDF_QR_QUIET_MODULES = 4;

interface PaperPreviewProps {
  imageUri: string | null;
  paperSize: PaperSize;
  orientation: PrintOrientation;
  showQrBadge: boolean;
  qrTargetUrl: string | null;
  qrX: number;
  qrY: number;
  qrSize: QrSize;
  qrBackground: QrBackground;
  onQrPositionChange?: (x: number, y: number) => void;
  maxWidth: number;
  caption?: string;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function PaperPreview({
  imageUri,
  paperSize,
  orientation,
  showQrBadge,
  qrTargetUrl,
  qrX,
  qrY,
  qrSize,
  qrBackground,
  onQrPositionChange,
  maxWidth,
  caption,
}: PaperPreviewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const ratio = PAPER_RATIOS[paperSize];
  const isLandscape = orientation === 'landscape';
  const paperW = isLandscape ? ratio.h : ratio.w;
  const paperH = isLandscape ? ratio.w : ratio.h;

  const aspectRatio = paperW / paperH;
  const previewW = Math.min(maxWidth, 360);
  const previewH = previewW / aspectRatio;

  // Image source can now be either a data URI (for fresh generations passed in
  // by the caller as base64) or a SAS URL pointing at blob storage.
  const dataUri = imageUri ?? null;

  const cardSize = QR_FRAC_BY_SIZE[qrSize] * Math.min(previewW, previewH);
  const qrImageSize = Math.max(1, cardSize);

  const maxLeft = Math.max(0, previewW - cardSize);
  const maxTop = Math.max(0, previewH - cardSize);
  const baseLeft = clamp(qrX, 0, 1) * maxLeft;
  const baseTop = clamp(qrY, 0, 1) * maxTop;

  const renderQr = !!(showQrBadge && qrTargetUrl && qrTargetUrl.length > 0);
  const draggable = !!onQrPositionChange;

  // Match the 4-module quiet zone QRCoder bakes into the PDF's QR PNG. The
  // module count depends on URL length + ECL; if generation fails we fall
  // back to a no-quiet-zone render rather than crashing the preview.
  const qrQuietZone = useMemo(() => {
    if (!renderQr || !qrTargetUrl) return 0;
    try {
      const moduleCount = QrCreator.create(qrTargetUrl, { errorCorrectionLevel: 'Q' }).modules.size;
      return (PDF_QR_QUIET_MODULES * qrImageSize) / (moduleCount + PDF_QR_QUIET_MODULES * 2);
    } catch {
      return 0;
    }
  }, [renderQr, qrTargetUrl, qrImageSize]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }],
  }));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => draggable,
        onMoveShouldSetPanResponder: () => draggable,
        onPanResponderGrant: () => {
          dragX.value = 0;
          dragY.value = 0;
        },
        onPanResponderMove: (_, g) => {
          const nextLeft = clamp(baseLeft + g.dx, 0, maxLeft);
          const nextTop = clamp(baseTop + g.dy, 0, maxTop);
          dragX.value = nextLeft - baseLeft;
          dragY.value = nextTop - baseTop;
        },
        onPanResponderRelease: (_, g) => {
          const nextLeft = clamp(baseLeft + g.dx, 0, maxLeft);
          const nextTop = clamp(baseTop + g.dy, 0, maxTop);
          dragX.value = 0;
          dragY.value = 0;
          const nx = maxLeft > 0 ? nextLeft / maxLeft : 0;
          const ny = maxTop > 0 ? nextTop / maxTop : 0;
          onQrPositionChange?.(nx, ny);
        },
        onPanResponderTerminate: () => {
          dragX.value = 0;
          dragY.value = 0;
        },
      }),
    [draggable, baseLeft, baseTop, maxLeft, maxTop, onQrPositionChange, dragX, dragY]
  );

  return (
    <View style={styles.wrapper}>
      <View style={[styles.stage, { width: previewW + 48, height: previewH + 48 }]}>
        <View
          pointerEvents="none"
          style={[styles.halo, { width: previewW + 48, height: previewH + 48 }]}
        />
        <View style={[styles.paper, { width: previewW, height: previewH }]}>
          {dataUri ? (
            <Image source={{ uri: dataUri }} style={styles.image} resizeMode="stretch" />
          ) : (
            <View style={styles.placeholder} />
          )}
          {renderQr && (
            <Animated.View
              {...(draggable ? panResponder.panHandlers : {})}
              style={[
                styles.qrCard,
                {
                  left: baseLeft,
                  top: baseTop,
                  width: cardSize,
                  height: cardSize,
                  backgroundColor: qrBackground === 'white' ? '#FFFFFF' : 'transparent',
                  ...(Platform.OS === 'web' && draggable
                    ? ({ cursor: 'grab', touchAction: 'none' } as object)
                    : {}),
                },
                animStyle,
              ]}
            >
              <QRCode
                value={qrTargetUrl}
                size={qrImageSize}
                quietZone={qrQuietZone}
                ecl="Q"
                color="#000000"
                backgroundColor={qrBackground === 'white' ? '#FFFFFF' : 'transparent'}
              />
            </Animated.View>
          )}
        </View>
      </View>
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      paddingVertical: D.spacing.md,
    },
    stage: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    halo: {
      position: 'absolute',
      borderRadius: D.radius.xl,
      backgroundColor: colors.accent.primary,
      opacity: 0.18,
      ...(Platform.OS === 'web' ? ({ filter: 'blur(36px)' } as object) : { ...D.shadow.glow }),
    },
    paper: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: D.radius.sm,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
      elevation: 12,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      flex: 1,
      backgroundColor: colors.bg.input,
    },
    qrCard: {
      position: 'absolute',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    caption: {
      marginTop: D.spacing.md,
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.text.muted,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
  });
}
