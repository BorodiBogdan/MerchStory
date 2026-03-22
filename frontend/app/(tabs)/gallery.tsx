import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { deleteGalleryItem, fetchGallery, type GalleryItem } from '@/utils/api';

type GalleryTab = 'photos' | 'videos';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1200;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.sm;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GalleryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<GalleryTab>('photos');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Responsive column count
  const numColumns = isWeb ? (screenWidth < 600 ? 2 : screenWidth < 1024 ? 3 : 4) : 2;

  // Card width based on actual rendered container
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const effectiveWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH) - hPadding * 2;
  const cardWidth = (effectiveWidth - GAP * (numColumns - 1)) / numColumns;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setIsLoading(true);
      setError(null);
      fetchGallery()
        .then((data) => {
          if (active) setItems(data);
        })
        .catch((err: unknown) => {
          if (active) setError(err instanceof Error ? err.message : 'Failed to load gallery.');
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  function switchTab(tab: GalleryTab) {
    setActiveTab(tab);
    Animated.timing(slideAnim, {
      toValue: tab === 'photos' ? 0 : 1,
      duration: D.duration.normal,
      useNativeDriver: false,
    }).start();
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await deleteGalleryItem(id);
    } catch {
      fetchGallery()
        .then(setItems)
        .catch(() => {});
    }
  }

  const indicatorLeft = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '52%'],
  });

  const renderPhoto = ({ item }: { item: GalleryItem }) => (
    <View style={[styles.photoCard, { width: cardWidth }]}>
      <View style={[styles.photoImageArea, { height: cardWidth }]}>
        <Image
          source={{ uri: `data:${item.mimeType};base64,${item.imageBase64}` }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
          onPress={() => void handleDelete(item.id)}
          accessibilityRole="button"
          accessibilityLabel="Delete image"
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={13} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.photoMeta}>
        <Text style={styles.photoDate}>{formatDate(item.createdAt)}</Text>
      </View>
    </View>
  );

  const photosEmptyState = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="images-outline" size={48} color={colors.accent.primary} />
      </View>
      <Text style={styles.emptyTitle}>No generated images yet</Text>
      <Text style={styles.emptySubtitle}>Head to Studio to create your first AI-generated ad</Text>
      <Pressable
        style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
        onPress={() => router.navigate('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel="Go to Studio"
      >
        <Ionicons name="sparkles-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
        <Text style={styles.emptyButtonText}>Open Studio</Text>
      </Pressable>
    </View>
  );

  const videosComingSoon = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="videocam-outline" size={48} color={colors.accent.primary} />
      </View>
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonBadgeText}>In Development</Text>
      </View>
      <Text style={styles.emptyTitle}>Video Generation</Text>
      <Text style={styles.emptySubtitle}>Coming soon — AI-powered video ads are on the way</Text>
    </View>
  );

  const photosContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerFill}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color={colors.text.muted}
            style={{ marginBottom: D.spacing.sm }}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setIsLoading(true);
              setError(null);
              fetchGallery()
                .then(setItems)
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Failed to load gallery.')
                )
                .finally(() => setIsLoading(false));
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (items.length === 0) return photosEmptyState;
    return (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderPhoto}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.pageContainer}>
        {/* Page header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Gallery</Text>
            <Text style={styles.pageSubtitle}>Your generated assets</Text>
          </View>
        </View>

        {/* Segmented control */}
        <View style={styles.segmentWrapper}>
          <View style={styles.segmentTrack}>
            <Animated.View style={[styles.segmentIndicator, { left: indicatorLeft }]} />
            <Pressable
              style={styles.segmentButton}
              onPress={() => switchTab('photos')}
              accessibilityRole="button"
              accessibilityLabel="Photos tab"
            >
              <Ionicons
                name={activeTab === 'photos' ? 'images' : 'images-outline'}
                size={15}
                color={activeTab === 'photos' ? '#fff' : colors.text.secondary}
                style={{ marginRight: 5 }}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'photos' && styles.segmentLabelActive]}
              >
                Photos
              </Text>
            </Pressable>
            <Pressable
              style={styles.segmentButton}
              onPress={() => switchTab('videos')}
              accessibilityRole="button"
              accessibilityLabel="Videos tab"
            >
              <Ionicons
                name={activeTab === 'videos' ? 'videocam' : 'videocam-outline'}
                size={15}
                color={activeTab === 'videos' ? '#fff' : colors.text.secondary}
                style={{ marginRight: 5 }}
              />
              <Text
                style={[styles.segmentLabel, activeTab === 'videos' && styles.segmentLabelActive]}
              >
                Videos
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Content */}
        {activeTab === 'photos' ? photosContent() : videosComingSoon}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
      alignItems: isWeb ? 'center' : 'stretch',
    },
    pageContainer: {
      flex: 1,
      width: '100%',
      maxWidth: isWeb ? MAX_CONTENT_WIDTH : undefined,
    },
    pageHeader: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingTop: D.spacing.lg,
      paddingBottom: D.spacing.md,
    },
    pageTitle: {
      fontSize: D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    pageSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    segmentWrapper: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      marginBottom: D.spacing.md,
    },
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.pill,
      padding: 3,
      position: 'relative',
      height: 40,
      maxWidth: isWeb ? 320 : undefined,
    },
    segmentIndicator: {
      position: 'absolute',
      top: 3,
      width: '46%',
      height: 34,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      ...D.shadow.glow,
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
    segmentLabelActive: {
      color: '#fff',
      fontWeight: D.fontWeight.semibold,
    },
    grid: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingBottom: D.spacing.xl,
    },
    gridRow: {
      gap: GAP,
      marginBottom: GAP,
    },
    photoCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    photoImageArea: {
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
    },
    deleteButton: {
      position: 'absolute',
      top: D.spacing.xs,
      right: D.spacing.xs,
      width: 26,
      height: 26,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoMeta: {
      padding: D.spacing.sm,
    },
    photoDate: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: D.spacing['2xl'],
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.md,
    },
    retryButton: {
      paddingVertical: 9,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    retryText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.xl,
      paddingBottom: D.spacing['2xl'],
    },
    emptyIconCircle: {
      width: 88,
      height: 88,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    emptyTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: D.spacing.sm,
    },
    emptySubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.lg,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 11,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    emptyButtonPressed: {
      opacity: 0.85,
    },
    emptyButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    comingSoonBadge: {
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingVertical: 4,
      paddingHorizontal: D.spacing.md,
      marginBottom: D.spacing.md,
    },
    comingSoonBadgeText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.secondary,
      letterSpacing: 0.5,
    },
  });
}
