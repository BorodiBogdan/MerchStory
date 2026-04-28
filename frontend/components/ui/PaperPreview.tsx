import { useMemo } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import type { PaperSize, PrintOrientation } from '@/utils/api';

const PAPER_RATIOS: Record<PaperSize, { w: number; h: number }> = {
  A6: { w: 105, h: 148 },
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

interface PaperPreviewProps {
  imageBase64: string | null;
  imageMimeType: string | null;
  paperSize: PaperSize;
  orientation: PrintOrientation;
  showQrBadge: boolean;
  maxWidth: number;
  caption?: string;
}

export function PaperPreview({
  imageBase64,
  imageMimeType,
  paperSize,
  orientation,
  showQrBadge,
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

  const dataUri =
    imageBase64 && imageMimeType ? `data:${imageMimeType};base64,${imageBase64}` : null;

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
          {showQrBadge && (
            <View style={styles.qrBadge}>
              <View style={styles.qrCorner} />
              <View style={[styles.qrCorner, styles.qrCornerTR]} />
              <View style={[styles.qrCorner, styles.qrCornerBL]} />
              <View style={styles.qrCenter} />
            </View>
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
    qrBadge: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: 40,
      height: 40,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.2)',
      borderRadius: 4,
      padding: 4,
    },
    qrCorner: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: 9,
      height: 9,
      borderWidth: 2,
      borderColor: '#0B0E14',
      borderRadius: 1,
    },
    qrCornerTR: {
      left: undefined,
      right: 4,
    },
    qrCornerBL: {
      top: undefined,
      bottom: 4,
    },
    qrCenter: {
      position: 'absolute',
      right: 5,
      bottom: 5,
      width: 6,
      height: 6,
      backgroundColor: '#0B0E14',
      borderRadius: 1,
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
