import QrCreator from 'qrcode';
import { useMemo } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import type { PaperSize, PrintOrientation } from '@/utils/api';

const PAPER_RATIOS: Record<PaperSize, { w: number; h: number }> = {
  A6: { w: 105, h: 148 },
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

// Paper dimensions in PDF points, mirroring QuestPDF's PageSizes used by the
// backend renderer. Lets us scale the preview QR badge so it occupies the
// same fraction of the page as the real QR does in the generated PDF.
const PAPER_WIDTH_PT: Record<PaperSize, number> = {
  A6: 298,
  A5: 420,
  A4: 595,
  A3: 842,
};
const PAPER_HEIGHT_PT: Record<PaperSize, number> = {
  A6: 420,
  A5: 595,
  A4: 842,
  A3: 1191,
};

// Match PdfRenderer.cs: 80pt QR image with 6pt internal padding (white card)
// and 8pt margin from the page edge. The QRCoder PNG embedded in that 80pt
// image bakes a 4-module quiet zone INSIDE the image, so the matrix itself
// only fills 80 * N/(N+8) of the image. We mirror that here via the
// react-native-qrcode-svg `quietZone` prop so the preview matrix occupies
// the same fraction of the white card as it does in the rendered PDF.
const PDF_QR_IMAGE_PT = 80;
const PDF_QR_CARD_PT = PDF_QR_IMAGE_PT + 6 * 2;
const PDF_QR_INNER_PADDING_PT = 6;
const PDF_QR_EDGE_MARGIN_PT = 8;
const PDF_QR_QUIET_MODULES = 4;

interface PaperPreviewProps {
  imageBase64: string | null;
  imageMimeType: string | null;
  paperSize: PaperSize;
  orientation: PrintOrientation;
  showQrBadge: boolean;
  qrTargetUrl: string | null;
  maxWidth: number;
  caption?: string;
}

export function PaperPreview({
  imageBase64,
  imageMimeType,
  paperSize,
  orientation,
  showQrBadge,
  qrTargetUrl,
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

  const pageWidthPt = isLandscape ? PAPER_HEIGHT_PT[paperSize] : PAPER_WIDTH_PT[paperSize];
  const ptToPx = previewW / pageWidthPt;
  const cardSize = PDF_QR_CARD_PT * ptToPx;
  const innerPadding = PDF_QR_INNER_PADDING_PT * ptToPx;
  const edgeOffset = PDF_QR_EDGE_MARGIN_PT * ptToPx;
  const qrImageSize = Math.max(1, PDF_QR_IMAGE_PT * ptToPx);

  const renderQr = !!(showQrBadge && qrTargetUrl && qrTargetUrl.length > 0);

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
            <View
              style={[
                styles.qrCard,
                {
                  right: edgeOffset,
                  bottom: edgeOffset,
                  width: cardSize,
                  height: cardSize,
                  padding: innerPadding,
                },
              ]}
            >
              <QRCode
                value={qrTargetUrl}
                size={qrImageSize}
                quietZone={qrQuietZone}
                ecl="Q"
                color="#000000"
                backgroundColor="#FFFFFF"
              />
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
    qrCard: {
      position: 'absolute',
      backgroundColor: '#FFFFFF',
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
