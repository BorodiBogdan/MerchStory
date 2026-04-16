import React, { useRef } from 'react';
import { Image, PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import type { PlacementZone } from '@/utils/api';

interface PlacementZoneEditorProps {
  wallpaperBase64: string;
  outputAspectRatio: number;
  zone: PlacementZone;
  onChange: (zone: PlacementZone) => void;
}

const MIN_ZONE_HEIGHT = 0.1;

export function PlacementZoneEditor({
  wallpaperBase64,
  outputAspectRatio,
  zone,
  onChange,
}: PlacementZoneEditorProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const previewWidth = Math.min(screenWidth - D.spacing.lg * 2, 480);
  const previewHeight = previewWidth / outputAspectRatio;

  // Keep a ref to the latest zone so gesture callbacks don't close over stale values
  const zoneRef = useRef(zone);
  zoneRef.current = zone;

  // Snapshot of zone at the start of each gesture
  const dragStart = useRef({ y: 0, height: 0 });

  const topHandle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = { y: zoneRef.current.y, height: zoneRef.current.height };
      },
      onPanResponderMove: (_, gestureState) => {
        const deltaFrac = gestureState.dy / previewHeight;
        const bottomEdge = dragStart.current.y + dragStart.current.height;
        const newY = Math.max(
          0,
          Math.min(dragStart.current.y + deltaFrac, bottomEdge - MIN_ZONE_HEIGHT)
        );
        const newHeight = bottomEdge - newY;
        onChange({ ...zoneRef.current, y: newY, height: newHeight });
      },
    })
  ).current;

  const bottomHandle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = { y: zoneRef.current.y, height: zoneRef.current.height };
      },
      onPanResponderMove: (_, gestureState) => {
        const deltaFrac = gestureState.dy / previewHeight;
        const newBottom = Math.max(
          dragStart.current.y + MIN_ZONE_HEIGHT,
          Math.min(1.0, dragStart.current.y + dragStart.current.height + deltaFrac)
        );
        const newHeight = newBottom - dragStart.current.y;
        onChange({ ...zoneRef.current, y: dragStart.current.y, height: newHeight });
      },
    })
  ).current;

  const wallpaperUri = wallpaperBase64.startsWith('data:')
    ? wallpaperBase64
    : `data:image/png;base64,${wallpaperBase64}`;

  const zoneTop = zone.y * previewHeight;
  const zoneHeight = zone.height * previewHeight;

  const topBlockedPct = Math.round(zone.y * 100);
  const bottomBlockedPct = Math.round((1 - (zone.y + zone.height)) * 100);

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Placement Zone</Text>
      <Text style={styles.hint}>Drag the handles to define where products will be placed</Text>

      <View style={[styles.preview, { width: previewWidth, height: previewHeight }]}>
        {/* Wallpaper — resizeMode="contain" matches ResizeMode.Pad on the backend */}
        <Image
          source={{ uri: wallpaperUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityLabel="Wallpaper preview"
        />

        {/* Dim: above zone */}
        {zoneTop > 0 && <View style={[styles.dimOverlay, { top: 0, height: zoneTop }]} />}

        {/* Zone rectangle */}
        <View style={[styles.zoneRect, { top: zoneTop, height: zoneHeight, left: 0, right: 0 }]} />

        {/* Dim: below zone */}
        {zoneTop + zoneHeight < previewHeight && (
          <View style={[styles.dimOverlay, { top: zoneTop + zoneHeight, bottom: 0 }]} />
        )}

        {/* Top edge handle */}
        <View {...topHandle.panHandlers} style={[styles.handle, { top: zoneTop - 22 }]}>
          <View style={styles.handlePill} />
        </View>

        {/* Bottom edge handle */}
        <View
          {...bottomHandle.panHandlers}
          style={[styles.handle, { top: zoneTop + zoneHeight - 22 }]}
        >
          <View style={styles.handlePill} />
        </View>
      </View>

      <Text style={styles.readout}>
        Top blocked: {topBlockedPct}% · Bottom blocked: {bottomBlockedPct}%
      </Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      marginTop: D.spacing.md,
    },
    label: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    hint: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      marginBottom: D.spacing.sm,
    },
    preview: {
      borderRadius: D.radius.md,
      overflow: 'hidden',
      backgroundColor: '#000',
    },
    dimOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    zoneRect: {
      position: 'absolute',
      backgroundColor: 'rgba(99,102,241,0.12)',
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderColor: '#6366F1',
    },
    handle: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    handlePill: {
      width: 36,
      height: 5,
      borderRadius: D.radius.pill,
      backgroundColor: '#6366F1',
    },
    readout: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      marginTop: D.spacing.sm,
      textAlign: 'center',
    },
  });
}
