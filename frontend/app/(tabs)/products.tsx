import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  type ProductItem,
  removeBackground,
  updateProduct,
} from '@/utils/api';

const isWeb = Platform.OS === 'web';
const MAX_CONTENT_WIDTH = 1200;
const WEB_H_PADDING = 32;
const MOBILE_H_PADDING = D.spacing.md;
const GAP = D.spacing.sm;

export default function ProductsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftImageUri, setDraftImageUri] = useState<string | null>(null);
  const [draftImageBase64, setDraftImageBase64] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');

  // Image preview / background-removal step (rendered inside the same modal)
  const [showPreview, setShowPreview] = useState(false);
  const [previewOriginalUri, setPreviewOriginalUri] = useState<string | null>(null);
  const [previewOriginalB64, setPreviewOriginalB64] = useState<string | null>(null);
  const [previewProcessedB64, setPreviewProcessedB64] = useState<string | null>(null);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Responsive column count
  const numColumns = isWeb ? (screenWidth < 600 ? 2 : screenWidth < 1024 ? 3 : 4) : 2;

  // Card width based on actual rendered container
  const hPadding = isWeb ? WEB_H_PADDING : MOBILE_H_PADDING;
  const effectiveWidth = Math.min(screenWidth, MAX_CONTENT_WIDTH) - hPadding * 2;
  const cardWidth = (effectiveWidth - GAP * (numColumns - 1)) / numColumns;

  function loadProducts() {
    setIsLoading(true);
    setError(null);
    fetchProducts()
      .then(setProducts)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load products.')
      )
      .finally(() => setIsLoading(false));
  }

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [])
  );

  function openAddModal() {
    setEditingProduct(null);
    setDraftName('');
    setDraftPrice('');
    setDraftImageUri(null);
    setDraftImageBase64(null);
    setNameError('');
    setPriceError('');
    setModalVisible(true);
  }

  function openEditModal(product: ProductItem) {
    setEditingProduct(product);
    setDraftName(product.name);
    setDraftPrice(String(product.price));
    setDraftImageUri(product.imageBase64 ? `data:image/png;base64,${product.imageBase64}` : null);
    setDraftImageBase64(product.imageBase64);
    setNameError('');
    setPriceError('');
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingProduct(null);
    setShowPreview(false);
  }

  async function uriToBase64(uri: string): Promise<string> {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
    }
    return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  }

  async function openImagePreview(uri: string) {
    setPreviewOriginalUri(uri);
    setPreviewOriginalB64(null);
    setPreviewProcessedB64(null);
    setRemoveBgError(null);
    setShowPreview(true);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    await openImagePreview(result.assets[0].uri);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    await openImagePreview(result.assets[0].uri);
  }

  function showPhotoSourcePicker() {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: () => void takePhoto() },
      { text: 'Choose from Library', onPress: () => void pickImage() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleRemoveBackground() {
    if (!previewOriginalUri) return;
    setIsRemovingBg(true);
    setRemoveBgError(null);
    try {
      const b64 = previewOriginalB64 ?? (await uriToBase64(previewOriginalUri));
      if (!previewOriginalB64) setPreviewOriginalB64(b64);
      const result = await removeBackground(b64);
      setPreviewProcessedB64(result.imageBase64);
    } catch (err: unknown) {
      setRemoveBgError(err instanceof Error ? err.message : 'Background removal failed.');
    } finally {
      setIsRemovingBg(false);
    }
  }

  function confirmImageChoice(useProcessed: boolean) {
    if (useProcessed && previewProcessedB64) {
      setDraftImageUri(`data:image/png;base64,${previewProcessedB64}`);
      setDraftImageBase64(previewProcessedB64);
    } else {
      setDraftImageUri(previewOriginalUri);
      setDraftImageBase64(null);
    }
    setShowPreview(false);
  }

  function validate(): boolean {
    let valid = true;
    if (!draftName.trim()) {
      setNameError('Product name is required');
      valid = false;
    } else {
      setNameError('');
    }
    const priceNum = parseFloat(draftPrice);
    if (!draftPrice.trim() || isNaN(priceNum) || priceNum < 0) {
      setPriceError('Enter a valid price');
      valid = false;
    } else {
      setPriceError('');
    }
    return valid;
  }

  async function saveProduct() {
    if (!validate()) return;
    setIsSaving(true);
    try {
      let imageBase64 = draftImageBase64;
      if (!imageBase64 && draftImageUri && !draftImageUri.startsWith('data:')) {
        imageBase64 = await uriToBase64(draftImageUri);
      }
      const payload = {
        name: draftName.trim(),
        price: parseFloat(draftPrice),
        imageBase64,
      };
      if (editingProduct) {
        const updated = await updateProduct(editingProduct.id, payload);
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createProduct(payload);
        setProducts((prev) => [created, ...prev]);
      }
      closeModal();
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteProduct(id);
    } catch {
      fetchProducts()
        .then(setProducts)
        .catch(() => {});
    }
  }

  const renderProduct = ({ item }: { item: ProductItem }) => (
    <Pressable
      style={({ pressed }) => [
        styles.productCard,
        { width: cardWidth },
        pressed && styles.cardPressed,
      ]}
      onPress={() => openEditModal(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
    >
      <View style={[styles.productImageArea, { height: cardWidth }]}>
        {item.imageBase64 ? (
          <Image
            source={{ uri: `data:image/png;base64,${item.imageBase64}` }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="cube-outline" size={36} color={colors.text.muted} />
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
          onPress={(e) => {
            e.stopPropagation?.();
            setConfirmDeleteId(item.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={13} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
        </View>
      </View>
    </Pressable>
  );

  const listContent = () => {
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
            onPress={loadProducts}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (products.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="pricetag-outline" size={48} color={colors.accent.primary} />
          </View>
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your first product to start building your catalog
          </Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            onPress={openAddModal}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.addButtonText}>Add Product</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderProduct}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.pageContainer}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>My Products</Text>
            <Text style={styles.pageSubtitle}>
              {products.length} {products.length === 1 ? 'item' : 'items'} in catalog
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            onPress={openAddModal}
            accessibilityRole="button"
            accessibilityLabel="Add product"
          >
            <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.addButtonText}>Add Product</Text>
          </Pressable>
        </View>

        {listContent()}
      </View>

      {/* Delete confirmation */}
      <Modal
        visible={confirmDeleteId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDeleteId(null)}
      >
        <Pressable style={styles.confirmOverlay} onPress={() => setConfirmDeleteId(null)}>
          <Pressable style={styles.confirmDialog} onPress={() => {}}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="trash-outline" size={28} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>Delete product?</Text>
            <Text style={styles.confirmBody}>
              This product will be permanently removed from your catalog.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setConfirmDeleteId(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmDelete, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  if (id) void handleDelete(id);
                }}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        {/* Overlay — always centered on web, bottom sheet on native */}
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKAV}
          >
            <Pressable
              style={[styles.modalSheet, !isWeb && { paddingBottom: insets.bottom + D.spacing.md }]}
              onPress={() => {}}
            >
              {!isWeb && <View style={styles.modalHandle} />}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={!isWeb && styles.modalScrollContent}
              >
                {showPreview ? (
                  <>
                    <Text style={styles.modalTitle}>Preview Photo</Text>

                    <View style={styles.previewImageWrap}>
                      <Image
                        source={{
                          uri: previewProcessedB64
                            ? `data:image/png;base64,${previewProcessedB64}`
                            : (previewOriginalUri ?? undefined),
                        }}
                        style={styles.previewImage}
                        resizeMode="contain"
                      />
                    </View>

                    {previewProcessedB64 && (
                      <Text style={styles.previewToggleLabel}>Showing: background removed</Text>
                    )}

                    {removeBgError && (
                      <Text
                        style={[
                          styles.fieldError,
                          { textAlign: 'center', marginBottom: D.spacing.sm },
                        ]}
                      >
                        {removeBgError}
                      </Text>
                    )}

                    <Pressable
                      style={({ pressed }) => [
                        styles.removeBgButton,
                        isRemovingBg && { opacity: 0.7 },
                        pressed && !isRemovingBg && { opacity: 0.85 },
                      ]}
                      onPress={() => void handleRemoveBackground()}
                      disabled={isRemovingBg}
                    >
                      {isRemovingBg ? (
                        <ActivityIndicator size="small" color={colors.accent.primary} />
                      ) : (
                        <>
                          <Ionicons
                            name="cut-outline"
                            size={16}
                            color={colors.accent.primary}
                            style={{ marginRight: D.spacing.xs }}
                          />
                          <Text style={styles.removeBgButtonText}>
                            {previewProcessedB64 ? 'Remove Background Again' : 'Remove Background'}
                          </Text>
                        </>
                      )}
                    </Pressable>

                    <View style={styles.modalActions}>
                      <Pressable
                        style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.7 }]}
                        onPress={() => confirmImageChoice(false)}
                      >
                        <Text style={styles.cancelButtonText}>Use Original</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.saveButton,
                          !previewProcessedB64 && styles.saveButtonDisabled,
                          pressed && !!previewProcessedB64 && { opacity: 0.85 },
                        ]}
                        onPress={() => confirmImageChoice(true)}
                        disabled={!previewProcessedB64}
                      >
                        <Text style={styles.saveButtonText}>Use Processed</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.modalTitle}>
                      {editingProduct ? 'Edit Product' : 'New Product'}
                    </Text>

                    {/* Photo picker */}
                    <Pressable
                      style={({ pressed }) => [styles.imagePicker, pressed && { opacity: 0.8 }]}
                      onPress={() => (isWeb ? void pickImage() : showPhotoSourcePicker())}
                      accessibilityRole="button"
                      accessibilityLabel="Pick product photo"
                    >
                      {draftImageUri ? (
                        <Image
                          source={{ uri: draftImageUri }}
                          style={styles.imagePickerPreview}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.imagePickerPlaceholder}>
                          <Ionicons name="camera-outline" size={28} color={colors.text.muted} />
                          <Text style={styles.imagePickerLabel}>Tap to add photo</Text>
                        </View>
                      )}
                      {draftImageUri && (
                        <View style={styles.imagePickerOverlay}>
                          <Ionicons name="camera-outline" size={20} color="#fff" />
                        </View>
                      )}
                    </Pressable>

                    {/* Name */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Product Name</Text>
                      <TextInput
                        style={[styles.textInput, nameError ? styles.textInputError : null]}
                        placeholder="e.g. Artisan Coffee Blend"
                        placeholderTextColor={colors.text.muted}
                        value={draftName}
                        onChangeText={(t) => {
                          setDraftName(t);
                          if (nameError) setNameError('');
                        }}
                        autoCorrect={false}
                      />
                      {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
                    </View>

                    {/* Price */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Price (USD)</Text>
                      <View style={styles.priceInputRow}>
                        <View style={styles.priceCurrencyBadge}>
                          <Text style={styles.priceCurrencyText}>$</Text>
                        </View>
                        <TextInput
                          style={[
                            styles.textInput,
                            styles.priceInput,
                            priceError ? styles.textInputError : null,
                          ]}
                          placeholder="0.00"
                          placeholderTextColor={colors.text.muted}
                          value={draftPrice}
                          onChangeText={(t) => {
                            setDraftPrice(t);
                            if (priceError) setPriceError('');
                          }}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      {priceError ? <Text style={styles.fieldError}>{priceError}</Text> : null}
                    </View>

                    {/* Actions */}
                    <View style={styles.modalActions}>
                      <Pressable
                        style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.7 }]}
                        onPress={closeModal}
                        accessibilityRole="button"
                        disabled={isSaving}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.saveButton,
                          isSaving && { opacity: 0.7 },
                          pressed && !isSaving && { opacity: 0.85 },
                        ]}
                        onPress={() => void saveProduct()}
                        accessibilityRole="button"
                        accessibilityLabel="Save product"
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.saveButtonText}>Save Product</Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent.primary,
      paddingVertical: 9,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.pill,
      ...D.shadow.glow,
    },
    addButtonPressed: {
      opacity: 0.85,
    },
    addButtonText: {
      color: '#fff',
      fontSize: D.fontSize.sm,
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
    productCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      ...D.shadow.sm,
    },
    cardPressed: {
      opacity: 0.8,
    },
    productImageArea: {
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
    },
    productImagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
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
    productInfo: {
      padding: D.spacing.sm,
      gap: D.spacing.xs,
    },
    productName: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
      lineHeight: 18,
    },
    priceBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accent.dim,
      borderRadius: D.radius.pill,
      paddingVertical: 3,
      paddingHorizontal: D.spacing.sm,
    },
    priceText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.primary,
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
    modalScrollContent: {
      flexGrow: 1,
      paddingVertical: D.spacing.lg,
    },
    // ── Modal ────────────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: isWeb ? 'center' : 'flex-end',
      alignItems: 'center',
      padding: isWeb ? D.spacing.md : 0,
    },
    modalKAV: {
      width: '100%',
      maxWidth: isWeb ? 520 : undefined,
    },
    modalSheet: {
      backgroundColor: colors.bg.surface,
      borderRadius: isWeb ? D.radius.xl : undefined,
      borderTopLeftRadius: isWeb ? undefined : D.radius.xl,
      borderTopRightRadius: isWeb ? undefined : D.radius.xl,
      paddingHorizontal: D.spacing.md,
      paddingTop: D.spacing.sm,
      maxHeight: isWeb ? '90%' : '92%',
      width: '100%',
      ...D.shadow.modal,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: D.radius.pill,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: D.spacing.md,
    },
    modalTitle: {
      fontSize: D.fontSize.xl,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.md,
    },
    imagePicker: {
      width: '100%',
      aspectRatio: 1.6,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      marginBottom: D.spacing.md,
    },
    imagePickerPreview: {
      width: '100%',
      height: '100%',
    },
    imagePickerPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: D.spacing.sm,
    },
    imagePickerLabel: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    imagePickerOverlay: {
      position: 'absolute',
      bottom: D.spacing.sm,
      right: D.spacing.sm,
      width: 32,
      height: 32,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldGroup: {
      marginBottom: D.spacing.md,
    },
    fieldLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
      marginBottom: D.spacing.xs,
    },
    textInput: {
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.md,
      paddingHorizontal: D.spacing.md,
      paddingVertical: 12,
      fontSize: D.fontSize.base,
      color: colors.text.primary,
      flex: 1,
    },
    textInputError: {
      borderColor: colors.border.error,
    },
    fieldError: {
      fontSize: D.fontSize.xs,
      color: colors.text.error,
      marginTop: 4,
    },
    priceInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    priceCurrencyBadge: {
      width: 40,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    priceCurrencyText: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    priceInput: {
      flex: 1,
    },
    modalActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      marginTop: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 2,
      paddingVertical: 13,
      borderRadius: D.radius.pill,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      ...D.shadow.glow,
    },
    saveButtonText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    // ── Confirm delete dialog ─────────────────────────────────────────────
    confirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: D.spacing.lg,
    },
    confirmDialog: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.xl,
      padding: D.spacing.lg,
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      ...D.shadow.modal,
    },
    confirmIconWrap: {
      width: 56,
      height: 56,
      borderRadius: D.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: D.spacing.md,
    },
    confirmTitle: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.sm,
    },
    confirmBody: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: D.spacing.lg,
    },
    confirmActions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      width: '100%',
    },
    confirmCancel: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    confirmCancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    confirmDelete: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: D.radius.pill,
      backgroundColor: '#EF4444',
      alignItems: 'center',
    },
    confirmDeleteText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    // ── Image preview / background removal ───────────────────────────────
    previewSheet: {
      paddingVertical: D.spacing.lg,
      maxWidth: isWeb ? 480 : undefined,
    },
    previewImageWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: D.radius.lg,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.default,
      overflow: 'hidden',
      marginBottom: D.spacing.md,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewToggleLabel: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: D.spacing.sm,
    },
    removeBgButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      paddingHorizontal: D.spacing.md,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.accent.primary,
      marginBottom: D.spacing.md,
    },
    removeBgButtonText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.accent.primary,
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
  });
}
