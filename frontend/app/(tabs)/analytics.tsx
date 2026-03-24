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
import {
  type FacebookCommentItem,
  type FacebookMediaItem,
  type FacebookPhotoDetails,
  fetchFacebookMedia,
  fetchFacebookPhotoDetails,
  getSocialStatus,
} from '@/utils/api';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1200;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.sm;

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [fbPosts, setFbPosts] = useState<FacebookMediaItem[]>([]);
  const [fbConnected, setFbConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

          const fetches: Promise<void>[] = [];
          if (status.facebookConnected) {
            fetches.push(
              fetchFacebookMedia()
                .then((data) => {
                  if (active) setFbPosts(data);
                })
                .catch(() => {})
            );
          }
          await Promise.all(fetches);
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
    return <Text style={styles.noCommentsText}>No comments yet</Text>;
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
      style={({ pressed }) => [styles.postCard, { width: cardWidth, opacity: pressed ? 0.85 : 1 }]}
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
          <Ionicons name="logo-facebook" size={12} color="#fff" />
        </View>
        <View style={styles.likesBadge}>
          <Ionicons name="heart" size={11} color="#fff" />
          <Text style={styles.likesBadgeText}>{item.likesCount}</Text>
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
          <Ionicons
            name={provider === 'Instagram' ? 'logo-instagram' : 'logo-facebook'}
            size={40}
            color={colors.accent.primary}
          />
        </View>
        <Text style={styles.emptyTitle}>{provider} not connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect your {provider} account in your profile to see your posts here
        </Text>
        <Pressable
          style={({ pressed }) => [styles.connectButton, pressed && { opacity: 0.85 }]}
          onPress={() => router.navigate('/(tabs)/profile')}
          accessibilityRole="button"
        >
          <Ionicons name="person-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.connectButtonText}>Go to Profile</Text>
        </Pressable>
      </View>
    );
  }

  function renderContent() {
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
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }
    if (!fbConnected) return renderNotConnected('Facebook');
    if (fbPosts.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="logo-facebook" size={40} color={colors.accent.primary} />
          </View>
          <Text style={styles.emptyTitle}>No Facebook photos yet</Text>
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

  return (
    <View style={styles.root}>
      <View style={styles.pageContainer}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Analytics</Text>
            <Text style={styles.pageSubtitle}>Your social media posts</Text>
          </View>
        </View>

        <View style={styles.segmentWrapper}>
          <View style={styles.segmentTrack}>
            <View style={styles.segmentIndicator} />
            <Pressable style={styles.segmentButton} accessibilityRole="button">
              <Ionicons name="logo-facebook" size={15} color="#fff" style={{ marginRight: 5 }} />
              <Text style={[styles.segmentLabel, styles.segmentLabelActive]}>Facebook</Text>
            </Pressable>
            <View style={[styles.segmentButton, styles.segmentButtonDisabled]}>
              <Ionicons
                name="logo-instagram"
                size={15}
                color={colors.text.muted}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.segmentLabel, styles.segmentLabelDisabled]}>Instagram</Text>
              <View style={styles.underConstructionBadge}>
                <Text style={styles.underConstructionBadgeText}>Under Construction</Text>
              </View>
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
                      <Ionicons name="logo-facebook" size={16} color="#1877F2" />
                      <Text style={styles.modalHeaderTitle}>Photo</Text>
                    </View>
                    <Pressable
                      style={styles.modalCloseButton}
                      onPress={closePost}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={18} color={colors.text.primary} />
                    </Pressable>
                  </View>

                  <View style={styles.modalLikesRow}>
                    <Ionicons name="heart" size={16} color="#e0245e" />
                    <Text style={styles.modalLikesText}>
                      {postDetails?.likesCount ?? selectedPost?.likesCount ?? 0} likes
                    </Text>
                  </View>

                  {selectedPost?.name ? (
                    <Text style={styles.modalCaption}>{selectedPost.name}</Text>
                  ) : null}

                  <View style={styles.modalCommentsDivider} />
                  <Text style={styles.modalCommentsTitle}>Comments</Text>

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
                      <Ionicons name="heart" size={18} color="#e0245e" />
                      <Text style={styles.modalLikesText}>
                        {postDetails?.likesCount ?? selectedPost?.likesCount ?? 0} likes
                      </Text>
                    </View>

                    {selectedPost?.name ? (
                      <Text style={styles.modalCaption}>{selectedPost.name}</Text>
                    ) : null}

                    <View style={styles.modalCommentsSection}>
                      <Text style={styles.modalCommentsTitle}>Comments</Text>
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
      left: '2%',
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
    segmentButtonDisabled: {
      opacity: 0.75,
    },
    segmentLabelDisabled: {
      color: colors.text.muted,
    },
    grid: {
      paddingHorizontal: isWeb ? WEB_H_PADDING : MOBILE_H_PADDING,
      paddingBottom: D.spacing.xl,
    },
    gridRow: {
      gap: GAP,
      marginBottom: GAP,
    },
    postCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      ...D.shadow.sm,
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
      top: D.spacing.xs,
      right: D.spacing.xs,
      width: 22,
      height: 22,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    likesBadge: {
      position: 'absolute',
      bottom: D.spacing.xs,
      left: D.spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: D.radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 3,
      gap: 3,
    },
    likesBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    postMeta: {
      padding: D.spacing.sm,
    },
    postCaption: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      lineHeight: 16,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: D.spacing.xl,
      paddingBottom: D.spacing['2xl'],
    },
    emptyIconCircle: {
      width: 80,
      height: 80,
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
    connectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 11,
      paddingHorizontal: D.spacing.lg,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    connectButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    // ── Modal ──────────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: isWeb ? 'center' : 'flex-end',
      alignItems: isWeb ? 'center' : 'stretch',
    },
    modalSheet: {
      backgroundColor: colors.bg.surface,
      overflow: 'hidden',
      ...(isWeb
        ? {
            flexDirection: 'row',
            width: '90%',
            maxWidth: 900,
            height: '80%',
            maxHeight: 640,
            borderRadius: D.radius.xl,
          }
        : {
            borderTopLeftRadius: D.radius.xl,
            borderTopRightRadius: D.radius.xl,
            maxHeight: '90%',
          }),
    },
    // Web: left image panel
    modalImagePanel: {
      width: '50%',
      backgroundColor: colors.bg.elevated,
      position: 'relative',
      overflow: 'hidden',
    },
    // Web: right details panel
    modalDetailsPanel: {
      flex: 1,
      borderLeftWidth: 1,
      borderLeftColor: colors.border.default,
      padding: D.spacing.md,
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
      borderBottomColor: colors.border.default,
      marginBottom: isWeb ? D.spacing.sm : 0,
    },
    modalHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    modalHeaderTitle: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    modalDragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.default,
      marginBottom: D.spacing.sm,
    },
    modalCloseButton: {
      width: 30,
      height: 30,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      ...(isWeb ? {} : { position: 'absolute', right: D.spacing.md, top: D.spacing.sm }),
    },
    modalImage: {
      width: '100%',
      aspectRatio: 1,
    },
    modalBody: {
      padding: D.spacing.md,
    },
    modalLikesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: D.spacing.sm,
    },
    modalLikesText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    modalCaption: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 20,
      marginBottom: D.spacing.md,
    },
    modalCommentsDivider: {
      height: 1,
      backgroundColor: colors.border.default,
      marginBottom: D.spacing.sm,
    },
    modalCommentsSection: {
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: D.spacing.md,
    },
    modalCommentsTitle: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: D.spacing.sm,
    },
    commentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: D.spacing.sm,
      marginBottom: D.spacing.sm,
    },
    commentAvatar: {
      width: 28,
      height: 28,
      borderRadius: D.radius.pill,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    commentBubble: {
      flex: 1,
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: D.spacing.xs,
    },
    commentAuthor: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
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
      padding: D.spacing.sm,
      marginTop: D.spacing.xs,
    },
    commentsUnavailableText: {
      flex: 1,
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      lineHeight: 16,
    },
    underConstructionBadge: {
      position: 'absolute',
      top: -5,
      right: -10,
      backgroundColor: colors.accent.secondary,
      borderRadius: D.radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    underConstructionBadgeText: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#fff',
    },
  });
}
