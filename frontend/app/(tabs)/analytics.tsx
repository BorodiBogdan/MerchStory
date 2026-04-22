import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  type FacebookCommentItem,
  type FacebookMediaItem,
  type FacebookPhotoDetails,
  fetchFacebookMedia,
  fetchFacebookPhotoDetails,
  getSocialStatus,
  syncSocialPosts,
} from '@/utils/api';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1600;
const WEB_H_PADDING = 64;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.md;

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [fbPosts, setFbPosts] = useState<FacebookMediaItem[]>([]);
  const [fbConnected, setFbConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPost, setSelectedPost] = useState<FacebookMediaItem | null>(null);
  const [postDetails, setPostDetails] = useState<FacebookPhotoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const numColumns = isWeb ? (screenWidth < 600 ? 2 : screenWidth < 1024 ? 3 : 4) : 2;
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const effectiveWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH) - hPadding * 2;
  const cardWidth = (effectiveWidth - GAP * (numColumns - 1)) / numColumns;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setIsLoading(true);
      setError(null);

      getSocialStatus()
        .then(async (status) => {
          if (!active) return;
          setFbConnected(status.facebookConnected);

          // Always attempt to load cached posts — backend serves from DB
          // even when the token is expired/disconnected (uses FacebookUserId).
          await fetchFacebookMedia()
            .then((data) => {
              if (active) setFbPosts(data);
            })
            .catch(() => {});
        })
        .catch((err: unknown) => {
          if (active) setError(err instanceof Error ? err.message : 'Failed to load posts.');
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });

      return () => {
        active = false;
      };
    }, [])
  );

  async function handleRefresh() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncSocialPosts('facebook');
      const data = await fetchFacebookMedia();
      setFbPosts(data);
    } catch {
      // Retain stale data on failure
    } finally {
      setIsSyncing(false);
    }
  }

  function renderComments() {
    if (detailsLoading) {
      return (
        <ActivityIndicator
          size="small"
          color={colors.accent.primary}
          style={{ marginTop: D.spacing.md }}
        />
      );
    }
    if (postDetails && postDetails.comments.length > 0) {
      return postDetails.comments.map((c: FacebookCommentItem) => (
        <View key={c.id} style={styles.commentRow}>
          <View style={styles.commentAvatar}>
            <Ionicons name="person" size={13} color={colors.text.muted} />
          </View>
          <View style={styles.commentBubble}>
            {c.fromName ? <Text style={styles.commentAuthor}>{c.fromName}</Text> : null}
            <Text style={styles.commentText}>{c.message}</Text>
          </View>
        </View>
      ));
    }
    const count = postDetails?.commentsCount ?? 0;
    if (count > 0) {
      return (
        <View style={styles.commentsUnavailableBox}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.text.muted} />
          <Text style={styles.commentsUnavailableText}>
            {count} {count === 1 ? 'comment' : 'comments'} · Content not available via
            Facebook&apos;s API for personal profiles
          </Text>
        </View>
      );
    }
    return <Text style={styles.noCommentsText}>{t('analytics.noComments')}</Text>;
  }

  function openPost(item: FacebookMediaItem) {
    setSelectedPost(item);
    setPostDetails(null);
    setDetailsLoading(true);
    fetchFacebookPhotoDetails(item.id)
      .then((details) => setPostDetails(details))
      .catch(() => setPostDetails({ likesCount: item.likesCount, commentsCount: 0, comments: [] }))
      .finally(() => setDetailsLoading(false));
  }

  function closePost() {
    setSelectedPost(null);
    setPostDetails(null);
  }

  const renderFacebookPost = ({ item }: { item: FacebookMediaItem }) => (
    <Pressable
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.postCard,
        { width: cardWidth },
        hovered && styles.postCardHovered,
        pressed && styles.postCardPressed,
      ]}
      onPress={() => openPost(item)}
      accessibilityRole="button"
    >
      <View style={[styles.postImageArea, { height: cardWidth }]}>
        {item.source ? (
          <Image source={{ uri: item.source }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={colors.text.muted} />
          </View>
        )}
        <View style={styles.mediaTypeBadge}>
          <Ionicons name="logo-facebook" size={11} color="#fff" />
        </View>
        <View style={styles.likesBadge}>
          <Ionicons name="heart" size={11} color="#ff5577" />
          <Text style={styles.likesBadgeText}>{item.likesCount}</Text>
        </View>
        <View style={styles.viewHint}>
          <Ionicons name="expand-outline" size={12} color="#fff" />
        </View>
      </View>
      {item.name ? (
        <View style={styles.postMeta}>
          <Text style={styles.postCaption} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  function renderNotConnected(provider: 'Instagram' | 'Facebook') {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconCircle}>
          <View style={styles.emptyIconInner}>
            <Ionicons
              name={provider === 'Instagram' ? 'logo-instagram' : 'logo-facebook'}
              size={38}
              color={colors.accent.primary}
            />
          </View>
        </View>
        <Text style={styles.emptyTitle}>{provider} not connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect your {provider} account in your profile to see your posts here
        </Text>
        <Pressable
          style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
          onPress={() => router.navigate('/(tabs)/profile')}
          accessibilityRole="button"
        >
          <Ionicons name="person-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.connectButtonText}>{t('analytics.goToProfile')}</Text>
        </Pressable>
      </View>
    );
  }

  function renderContent() {
    if (isLoading) {
      return (
        <View style={styles.centerFill}>
          <View style={styles.loaderHalo}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
          <Text style={[styles.emptySubtitle, { marginTop: D.spacing.md }]}>Loading posts…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconCircle}>
            <View style={styles.emptyIconInner}>
              <Ionicons name="cloud-offline-outline" size={36} color={colors.accent.primary} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>Couldn&apos;t load posts</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }
    if (!fbConnected && fbPosts.length === 0) return renderNotConnected('Facebook');
    if (fbPosts.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <View style={styles.emptyIconInner}>
              <Ionicons name="logo-facebook" size={38} color={colors.accent.primary} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>{t('analytics.noPhotos')}</Text>
          <Text style={styles.emptySubtitle}>
            Share a post on Facebook and it will appear here.
          </Text>
        </View>
      );
    }
    return (
      <FlatList
        data={fbPosts}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderFacebookPost}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  const postsCount = fbPosts.length;

  return (
    <View style={styles.root}>
      {/* Ambient accent glows (behind content) */}
      <View pointerEvents="none" style={styles.ambientGlow} />
      <View pointerEvents="none" style={styles.ambientGlow2} />

      <View style={styles.pageContainer}>
        <View style={styles.pageHeader}>
          <View style={styles.headerTextBlock}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>Analytics</Text>
            </View>
            <Text style={styles.pageTitle}>{t('analytics.pageTitle')}</Text>
            <View style={styles.subtitleRow}>
              {postsCount > 0 ? (
                <View style={styles.countChip}>
                  <Ionicons name="heart-outline" size={12} color={colors.accent.primary} />
                  <Text style={styles.countChipText}>
                    {postsCount} {postsCount === 1 ? 'post' : 'posts'}
                  </Text>
                </View>
              ) : null}
              {fbConnected === true ? (
                <View style={[styles.countChip, styles.countChipSuccess]}>
                  <View style={styles.connectedDot} />
                  <Text style={[styles.countChipText, { color: colors.accent.secondary }]}>
                    Connected
                  </Text>
                </View>
              ) : fbConnected === false && fbPosts.length > 0 ? (
                <View style={[styles.countChip, styles.countChipMuted]}>
                  <Ionicons name="cloud-offline-outline" size={12} color={colors.text.muted} />
                  <Text style={[styles.countChipText, { color: colors.text.muted }]}>Cached</Text>
                </View>
              ) : null}
              <Text style={styles.pageSubtitle}>{t('analytics.pageSubtitle')}</Text>
            </View>
            {fbConnected === false && fbPosts.length > 0 ? (
              <Text style={styles.cachedDataNote}>{t('analytics.cachedNote')}</Text>
            ) : null}
          </View>

          {fbConnected ? (
            <Pressable
              onPress={() => void handleRefresh()}
              disabled={isSyncing || isLoading}
              style={({ pressed }) => [
                styles.refreshButton,
                (isSyncing || isLoading) && { opacity: 0.5 },
                pressed && styles.refreshButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('analytics.refresh')}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="refresh-outline" size={18} color="#fff" />
              )}
            </Pressable>
          ) : null}
        </View>

        {/* Facebook / Instagram segmented switcher */}
        <View style={styles.segmentWrapper}>
          <View style={styles.segmentTrack}>
            <View style={styles.segmentIndicator} />
            <Pressable style={styles.segmentButton} accessibilityRole="button">
              <Ionicons name="logo-facebook" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={[styles.segmentLabel, styles.segmentLabelActive]}>
                {t('analytics.tabFacebook')}
              </Text>
            </Pressable>
            <View style={[styles.segmentButton, styles.segmentButtonDisabled]}>
              <Ionicons
                name="logo-instagram"
                size={15}
                color={colors.text.muted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.segmentLabel, styles.segmentLabelDisabled]}>
                {t('analytics.tabInstagram')}
              </Text>
              <View style={styles.segmentSoonDot} />
            </View>
          </View>
        </View>

        {renderContent()}
      </View>

      {/* Photo detail modal */}
      <Modal
        visible={selectedPost !== null}
        animationType={isWeb ? 'fade' : 'slide'}
        transparent
        onRequestClose={closePost}
      >
        <Pressable style={styles.modalOverlay} onPress={closePost}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            {isWeb ? (
              // ── Web: side-by-side dialog ──────────────────────────────────
              <>
                {/* Left: image */}
                <View style={styles.modalImagePanel}>
                  {selectedPost?.source ? (
                    <Image
                      source={{ uri: selectedPost.source }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.noImagePlaceholder}>
                      <Ionicons name="image-outline" size={48} color={colors.text.muted} />
                    </View>
                  )}
                </View>

                {/* Right: details */}
                <View style={styles.modalDetailsPanel}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderLeft}>
                      <View style={styles.modalHeaderIcon}>
                        <Ionicons name="logo-facebook" size={14} color="#1877F2" />
                      </View>
                      <Text style={styles.modalHeaderTitle}>Post</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.modalCloseButton,
                        pressed && { opacity: 0.75 },
                      ]}
                      onPress={closePost}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={18} color={colors.text.primary} />
                    </Pressable>
                  </View>

                  <View style={styles.modalLikesRow}>
                    <View style={styles.modalLikesBadge}>
                      <Ionicons name="heart" size={14} color="#ff5577" />
                      <Text style={styles.modalLikesText}>
                        {postDetails?.likesCount ?? selectedPost?.likesCount ?? 0}
                      </Text>
                    </View>
                    <Text style={styles.modalLikesSuffix}>{t('analytics.likesSuffix')}</Text>
                  </View>

                  {selectedPost?.name ? (
                    <Text style={styles.modalCaption}>{selectedPost.name}</Text>
                  ) : null}

                  <View style={styles.modalCommentsDivider} />
                  <Text style={styles.modalCommentsTitle}>{t('analytics.comments')}</Text>

                  <ScrollView
                    style={styles.modalCommentsScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    {renderComments()}
                  </ScrollView>
                </View>
              </>
            ) : (
              // ── Mobile: bottom sheet ──────────────────────────────────────
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalDragHandle} />
                  <Pressable
                    style={styles.modalCloseButton}
                    onPress={closePost}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color={colors.text.primary} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} bounces>
                  {selectedPost?.source ? (
                    <Image
                      source={{ uri: selectedPost.source }}
                      style={styles.modalImage}
                      resizeMode="cover"
                    />
                  ) : null}

                  <View style={styles.modalBody}>
                    <View style={styles.modalLikesRow}>
                      <View style={styles.modalLikesBadge}>
                        <Ionicons name="heart" size={14} color="#ff5577" />
                        <Text style={styles.modalLikesText}>
                          {postDetails?.likesCount ?? selectedPost?.likesCount ?? 0}
                        </Text>
                      </View>
                      <Text style={styles.modalLikesSuffix}>{t('analytics.likesSuffix')}</Text>
                    </View>

                    {selectedPost?.name ? (
                      <Text style={styles.modalCaption}>{selectedPost.name}</Text>
                    ) : null}

                    <View style={styles.modalCommentsSection}>
                      <Text style={styles.modalCommentsTitle}>{t('analytics.comments')}</Text>
                      {renderComments()}
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    ambientGlow: {
      position: 'absolute',
      top: -140,
      right: -80,
      width: 360,
      height: 360,
      borderRadius: 360,
      backgroundColor: colors.accent.primary,
      opacity: 0.08,
    },
    ambientGlow2: {
      position: 'absolute',
      top: 120,
      left: -120,
      width: 280,
      height: 280,
      borderRadius: 280,
      backgroundColor: colors.accent.secondary,
      opacity: 0.05,
    },
    pageContainer: {
      flex: 1,
      width: '100%',
      maxWidth: isWeb ? MAX_CONTENT_WIDTH : undefined,
    },

    // ── Header ───────────────────────────────────────────────────────────
    pageHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingTop: D.spacing.xl,
      paddingBottom: D.spacing.md,
      gap: D.spacing.md,
    },
    headerTextBlock: {
      flex: 1,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 220,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    eyebrowDot: {
      width: 6,
      height: 6,
      borderRadius: 6,
      backgroundColor: colors.accent.primary,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    pageTitle: {
      fontSize: isWeb ? D.fontSize['3xl'] : D.fontSize['2xl'],
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.8,
      marginBottom: 6,
    },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    countChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    countChipSuccess: {
      backgroundColor: 'transparent',
      borderColor: colors.accent.secondary,
    },
    countChipMuted: {
      backgroundColor: 'transparent',
    },
    countChipText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
    },
    connectedDot: {
      width: 7,
      height: 7,
      borderRadius: 7,
      backgroundColor: colors.accent.secondary,
    },
    pageSubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    cachedDataNote: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: 6,
      fontStyle: 'italic',
    },

    // ── Refresh button ───────────────────────────────────────────────────
    refreshButton: {
      width: 42,
      height: 42,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.glow,
    },
    refreshButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.96 }],
    },

    // ── Segmented switcher ───────────────────────────────────────────────
    segmentWrapper: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      marginBottom: D.spacing.md,
    },
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.pill,
      padding: 4,
      position: 'relative',
      height: 42,
      width: 260,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...D.shadow.sm,
    },
    segmentIndicator: {
      position: 'absolute',
      top: 4,
      left: '1%',
      width: '48%',
      height: 32,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      ...D.shadow.glow,
    },
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    segmentButtonDisabled: {
      opacity: 0.75,
    },
    segmentLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
      letterSpacing: 0.2,
    },
    segmentLabelActive: {
      color: '#fff',
      fontWeight: D.fontWeight.bold,
    },
    segmentLabelDisabled: {
      color: colors.text.muted,
    },
    segmentSoonDot: {
      marginLeft: 5,
      width: 6,
      height: 6,
      borderRadius: 6,
      backgroundColor: colors.accent.secondary,
    },

    // ── Grid ─────────────────────────────────────────────────────────────
    grid: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingTop: D.spacing.sm,
      paddingBottom: D.spacing.xl,
    },
    gridRow: {
      gap: GAP,
      marginBottom: GAP,
    },

    // ── Post card ────────────────────────────────────────────────────────
    postCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    postCardHovered: {
      borderColor: colors.accent.primary,
      transform: [{ translateY: -2 }],
      ...D.shadow.glow,
    },
    postCardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.985 }],
    },
    postImageArea: {
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
    },
    noImagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaTypeBadge: {
      position: 'absolute',
      top: D.spacing.sm,
      right: D.spacing.sm,
      width: 26,
      height: 26,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    likesBadge: {
      position: 'absolute',
      bottom: D.spacing.sm,
      left: D.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.72)',
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      gap: 5,
    },
    likesBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: D.fontWeight.bold,
      letterSpacing: 0.2,
    },
    viewHint: {
      position: 'absolute',
      top: D.spacing.sm,
      left: D.spacing.sm,
      width: 26,
      height: 26,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    postMeta: {
      padding: D.spacing.md,
    },
    postCaption: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 18,
    },

    // ── Loading / error / empty ──────────────────────────────────────────
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.xl,
      paddingBottom: D.spacing['2xl'],
    },
    loaderHalo: {
      width: 84,
      height: 84,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      maxWidth: 360,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.xl,
      paddingBottom: D.spacing['2xl'],
    },
    emptyIconCircle: {
      width: 104,
      height: 104,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    emptyIconInner: {
      width: 76,
      height: 76,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: D.spacing.xs,
      letterSpacing: -0.3,
    },
    emptySubtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.lg,
      maxWidth: 360,
    },
    connectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 12,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.accent.secondary,
      ...D.shadow.glow,
    },
    connectButtonPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    connectButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      letterSpacing: 0.2,
    },

    // ── Modal ────────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: isWeb ? 'center' : 'flex-end',
      alignItems: isWeb ? 'center' : 'stretch',
    },
    modalSheet: {
      backgroundColor: colors.bg.surface,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...(isWeb
        ? {
            flexDirection: 'row',
            width: '90%',
            maxWidth: 900,
            height: '80%',
            maxHeight: 640,
            borderRadius: D.radius.xl,
            ...D.shadow.modal,
          }
        : {
            borderTopLeftRadius: D.radius.xl,
            borderTopRightRadius: D.radius.xl,
            borderBottomWidth: 0,
            maxHeight: '90%',
          }),
    },
    modalImagePanel: {
      width: '50%',
      backgroundColor: colors.bg.elevated,
      position: 'relative',
      overflow: 'hidden',
    },
    modalDetailsPanel: {
      flex: 1,
      borderLeftWidth: 1,
      borderLeftColor: colors.border.subtle,
      padding: D.spacing.lg,
      overflow: 'hidden',
    },
    modalCommentsScroll: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: isWeb ? 'space-between' : 'center',
      paddingTop: isWeb ? 0 : D.spacing.sm,
      paddingBottom: D.spacing.sm,
      borderBottomWidth: isWeb ? 1 : 0,
      borderBottomColor: colors.border.subtle,
      marginBottom: isWeb ? D.spacing.md : 0,
    },
    modalHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalHeaderIcon: {
      width: 28,
      height: 28,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeaderTitle: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    modalDragHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.default,
      marginBottom: D.spacing.sm,
    },
    modalCloseButton: {
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      ...(isWeb ? {} : { position: 'absolute', right: D.spacing.md, top: D.spacing.sm }),
    },
    modalImage: {
      width: '100%',
      aspectRatio: 1,
    },
    modalBody: {
      padding: D.spacing.lg,
    },
    modalLikesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: D.spacing.sm,
    },
    modalLikesBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(255, 85, 119, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255, 85, 119, 0.3)',
    },
    modalLikesText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
    },
    modalLikesSuffix: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      fontWeight: D.fontWeight.medium,
    },
    modalCaption: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 20,
      marginBottom: D.spacing.md,
    },
    modalCommentsDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginBottom: D.spacing.md,
    },
    modalCommentsSection: {
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: D.spacing.md,
      marginTop: D.spacing.sm,
    },
    modalCommentsTitle: {
      fontSize: 11,
      fontWeight: D.fontWeight.bold,
      color: colors.text.muted,
      marginBottom: D.spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    commentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.sm,
      marginBottom: D.spacing.sm,
    },
    commentAvatar: {
      width: 30,
      height: 30,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    commentBubble: {
      flex: 1,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.xs,
    },
    commentAuthor: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: 2,
    },
    commentText: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
      lineHeight: 16,
    },
    noCommentsText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      paddingVertical: D.spacing.md,
    },
    commentsUnavailableBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.sm,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.md,
      marginTop: D.spacing.xs,
    },
    commentsUnavailableText: {
      flex: 1,
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      lineHeight: 16,
    },
  });
}
