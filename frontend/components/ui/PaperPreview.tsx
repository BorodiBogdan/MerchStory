import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

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
}

export function PaperPreview({
  imageBase64,
  imageMimeType,
  paperSize,
  orientation,
  showQrBadge,
  maxWidth,
}: PaperPreviewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const ratio = PAPER_RATIOS[paperSize];
  const isLandscape = orientation === 'landscape';
  const paperW = isLandscape ? ratio.h : ratio.w;
  const paperH = isLandscape ? ratio.w : ratio.h;

  const aspectRatio = paperW / paperH;
  const previewW = Math.min(maxWidth, 320);
  const previewH = previewW / aspectRatio;

  const dataUri =
    imageBase64 && imageMimeType ? `data:${imageMimeType};base64,${imageBase64}` : null;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.paper, { width: previewW, height: previewH }]}>
        {dataUri ? (
          <Image source={{ uri: dataUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder} />
        )}
        {showQrBadge && <View style={styles.qrBadge} />}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      paddingVertical: D.spacing.md,
    },
    paper: {
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.sm,
      overflow: 'hidden',
      ...D.shadow.glow,
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
      right: 6,
      bottom: 6,
      width: 36,
      height: 36,
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.sm,
    },
  });
}
