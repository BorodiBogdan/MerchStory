import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProductImage } from '@/components/ui/ProductImage';
import { D } from '@/constants/design';
import { useTheme } from '@/context/theme';
import { useT } from '@/i18n';
import {
  type BundleFreebie,
  type CatalogOfferConfig,
  type CatalogOfferGroup,
  type CatalogOfferKind,
  type Currency,
  formatPrice,
  type FreeItemType,
  offerHasGrouping,
} from '@/utils/api';

const PRESET_PERCENTS = [10, 20, 30, 50];
const DEFAULT_OFFER_PERCENT = 10;

export interface OfferProduct {
  id: string;
  name: string;
  price: number;
  currency?: Currency;
}

/** A single setting shown on the generation-options review step. */
export interface OfferOptionSummary {
  label: string;
  value: string;
  /** Leading glyph rendered in the row's accent tile. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Toggle-style settings render their value as an On/Off status pill;
   *  'neutral' (the default) renders the value as plain emphasized text. */
  tone?: 'on' | 'off' | 'neutral';
}

interface CatalogOfferModalProps {
  visible: boolean;
  products: OfferProduct[];
  /** Step-1 heading + caption. Defaults to the catalog offer copy. */
  title?: string;
  subtitle?: string;
  /** When false, the offer/discount UI is hidden and step 1 is a plain product list. */
  allowOffer?: boolean;
  /** Settings recap shown on the final "generation options" step. */
  optionsSummary?: OfferOptionSummary[];
  /** Current "show product names" toggle; the review step renders it (and forces
   *  it off when the offer has a group/bundle). */
  showProductNames?: boolean;
  generating?: boolean;
  cost?: number;
  onCancel: () => void;
  /** priceOverrides maps productId -> in-modal base price (DB price unchanged). */
  onContinue: (offer: CatalogOfferConfig, priceOverrides: Record<string, number>) => void;
}

/** Price after applying a percentage discount, rounded to cents. */
export function discountedPrice(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== 'web') Haptics.impactAsync(style);
}

export function CatalogOfferModal({
  visible,
  products,
  title,
  subtitle,
  allowOffer = true,
  optionsSummary = [],
  showProductNames = false,
  generating = false,
  cost,
  onCancel,
  onContinue,
}: CatalogOfferModalProps) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Two-step flow: pick offer/products, then review generation options.
  const [step, setStep] = useState<'products' | 'options'>('products');
  const [offerEnabled, setOfferEnabled] = useState(false);
  const [groups, setGroups] = useState<CatalogOfferGroup[]>([]);
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  // In-modal base-price overrides (productId -> price). Not persisted to the DB;
  // used for offer math and passed back so generation uses the chosen price.
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');

  const productById = useMemo(() => {
    const map = new Map<string, OfferProduct>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Stable signature so the reset below fires on open / when the actual product
  // set changes, not on every parent re-render (the prop is a fresh array each time).
  const productKey = useMemo(() => products.map((p) => p.id).join(','), [products]);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (visible) {
      setStep('products');
      setOfferEnabled(false);
      setGroups([]);
      setSelectedForGroup(new Set());
      setPriceOverrides({});
      setEditingPriceId(null);
      setPriceDraft('');
    }
  }, [visible, productKey]);

  // Base price for a product: the in-modal override if set, else the original.
  function effectivePrice(product: OfferProduct): number {
    return priceOverrides[product.id] ?? product.price;
  }

  function startEditPrice(product: OfferProduct) {
    haptic();
    setEditingPriceId(product.id);
    setPriceDraft(String(effectivePrice(product)));
  }

  function commitPrice(product: OfferProduct) {
    const parsed = parseFloat(priceDraft.replace(',', '.').replace(/[^0-9.]/g, ''));
    setPriceOverrides((prev) => {
      const next = { ...prev };
      if (!Number.isFinite(parsed) || parsed < 0 || parsed === product.price) {
        delete next[product.id];
      } else {
        next[product.id] = Math.round(parsed * 100) / 100;
      }
      return next;
    });
    setEditingPriceId(null);
    setPriceDraft('');
  }

  // Wraps a price display with an inline editor / pencil affordance.
  function renderEditablePrice(product: OfferProduct, content: React.ReactNode) {
    if (editingPriceId === product.id) {
      return (
        <View style={styles.priceEdit}>
          <TextInput
            style={styles.priceEditInput as object}
            value={priceDraft}
            onChangeText={setPriceDraft}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            onSubmitEditing={() => commitPrice(product)}
            onBlur={() => commitPrice(product)}
            accessibilityLabel={t('studio.offer.editPrice')}
          />
          <Pressable
            onPress={() => commitPrice(product)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('studio.offer.editPrice')}
          >
            <Ionicons name="checkmark-circle" size={18} color={colors.accent.primary} />
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.priceWithEdit}>
        {content}
        <Pressable
          onPress={() => startEditPrice(product)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('studio.offer.editPrice')}
        >
          <Ionicons name="pencil" size={13} color={colors.text.muted} />
        </Pressable>
      </View>
    );
  }

  const resolvedTitle = title ?? t('studio.offer.title');
  const resolvedSubtitle =
    subtitle ?? (allowOffer ? t('studio.offer.subtitle') : t('studio.offer.subtitleNoOffer'));

  // Products not yet committed to any offer. They show a checkbox + price only;
  // their discount is set after they are turned into an offer.
  const looseProducts = useMemo(
    () => products.filter((p) => !groups.some((g) => g.productIds.includes(p.id))),
    [products, groups]
  );

  function toggleSelect(id: string) {
    haptic();
    setSelectedForGroup((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Turn the selected loose products into one offer. The shared percentage starts
  // at 0 and is set afterwards on the offer, so percentages are never set before
  // grouping. A single-item selection is always a 'group' (per-product discount).
  function createOffer(kind: CatalogOfferKind) {
    if (selectedForGroup.size < 1) return;
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    const ids = products.map((p) => p.id).filter((id) => selectedForGroup.has(id));
    if (!ids.length) return;
    const resolvedKind: CatalogOfferKind = ids.length < 2 ? 'group' : kind;
    // Groups and bundles both start at a 10% discount; it can be changed or
    // cleared afterwards (e.g. a bundle relying only on free items).
    setGroups((prev) => [
      ...prev,
      { kind: resolvedKind, productIds: ids, percent: DEFAULT_OFFER_PERCENT, freebies: [] },
    ]);
    setSelectedForGroup(new Set());
  }

  // Dissolve an offer; its products return to the loose list.
  function removeOffer(index: number) {
    haptic();
    setGroups((prev) => prev.filter((_, i) => i !== index));
  }

  // Bundle only: toggle a product as free within its bundle. New freebies default
  // to the 'item' type (a specific product); the type can then be switched.
  function toggleFree(index: number, productId: string) {
    haptic();
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== index) return g;
        const isFree = g.freebies.some((f) => f.productId === productId);
        return {
          ...g,
          freebies: isFree
            ? g.freebies.filter((f) => f.productId !== productId)
            : [...g.freebies, { productId, type: 'item' as FreeItemType }],
        };
      })
    );
  }

  // Bundle only: switch a freebie between a specific item and a product-range deal.
  function setFreeType(index: number, productId: string, type: FreeItemType) {
    haptic();
    setGroups((prev) =>
      prev.map((g, i) =>
        i === index
          ? {
              ...g,
              freebies: g.freebies.map((f) => (f.productId === productId ? { ...f, type } : f)),
            }
          : g
      )
    );
  }

  function freebieFor(group: CatalogOfferGroup, productId: string): BundleFreebie | undefined {
    return group.kind === 'bundle'
      ? group.freebies.find((f) => f.productId === productId)
      : undefined;
  }

  // Final price of a product inside an offer: 0 if free in a bundle, otherwise
  // the shared percentage applied to the (possibly overridden) base price.
  function itemFinalPrice(group: CatalogOfferGroup, product: OfferProduct): number {
    if (freebieFor(group, product.id)) return 0;
    return discountedPrice(effectivePrice(product), group.percent);
  }

  function setPercent(index: number, percent: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, percent: clamped } : g)));
  }

  // Step 1 → step 2 (review generation options).
  function handleProductsContinue() {
    haptic();
    setStep('options');
  }

  function handleBack() {
    haptic();
    setStep('products');
  }

  // Build the outgoing offer config, enriching bundles with their computed price
  // (paid items only, after percent) so the backend uses the frontend's number.
  function buildOfferConfig(): CatalogOfferConfig {
    if (!allowOffer || !offerEnabled) {
      return { isOffer: false, groups: [] };
    }
    const enriched = groups.map((g) => {
      if (g.kind !== 'bundle') {
        return g;
      }
      const paid = g.productIds
        .filter((id) => !g.freebies.some((f) => f.productId === id))
        .map((id) => productById.get(id))
        .filter((p): p is OfferProduct => Boolean(p));
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const bundleOriginalPrice = round2(paid.reduce((sum, p) => sum + effectivePrice(p), 0));
      const bundlePrice = round2(
        paid.reduce((sum, p) => sum + discountedPrice(effectivePrice(p), g.percent), 0)
      );
      return { ...g, bundlePrice, bundleOriginalPrice };
    });
    return { isOffer: true, groups: enriched };
  }

  // Step 2 → run the generation.
  function handleGenerate() {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    onContinue(buildOfferConfig(), priceOverrides);
  }

  function handleCancel() {
    haptic();
    onCancel();
  }

  function renderPercentControl(index: number, percent: number) {
    return (
      <View style={styles.percentControl}>
        <View style={styles.chipRow}>
          {PRESET_PERCENTS.map((p) => {
            const active = percent === p;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  haptic();
                  // Tapping the active chip again clears the promotion (back to 0%).
                  setPercent(index, active ? 0 : p);
                }}
                style={[styles.percentChip, active && styles.percentChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`${p}%`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.percentChipText, active && styles.percentChipTextActive]}>
                  {p}%
                </Text>
              </Pressable>
            );
          })}
          <View style={styles.customWrap}>
            <TextInput
              style={styles.customInput as object}
              value={percent === 0 ? '' : String(percent)}
              onChangeText={(text) => {
                const digits = text.replace(/[^0-9]/g, '');
                setPercent(index, digits === '' ? 0 : parseInt(digits, 10));
              }}
              keyboardType="number-pad"
              maxLength={3}
              placeholder={t('studio.offer.customPercent')}
              placeholderTextColor={colors.text.muted}
              accessibilityLabel={t('studio.offer.customPercent')}
            />
            <Text style={styles.customPercentSign}>%</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderItemPrice(group: CatalogOfferGroup, product: OfferProduct) {
    const base = effectivePrice(product);
    const isFree = Boolean(freebieFor(group, product.id));
    if (isFree) {
      return (
        <View style={styles.priceRow}>
          <Text style={styles.priceOriginal}>{formatPrice(base, product.currency)}</Text>
          <Text style={styles.freePrice}>{t('studio.offer.free')}</Text>
        </View>
      );
    }
    if (group.percent > 0) {
      return (
        <View style={styles.priceRow}>
          <Text style={styles.priceOriginal}>{formatPrice(base, product.currency)}</Text>
          <Text style={styles.priceDiscounted}>
            {formatPrice(discountedPrice(base, group.percent), product.currency)}
          </Text>
        </View>
      );
    }
    return <Text style={styles.priceCurrent}>{formatPrice(base, product.currency)}</Text>;
  }

  // Read-only product line shown when the offer toggle is OFF. Rendered as a
  // billing-style row (thumb · name · right-aligned price) grouped into one card,
  // so the list reads as an intentional summary rather than floating boxes.
  function renderSummaryItem(product: OfferProduct, first: boolean) {
    return (
      <View key={product.id} style={[styles.summaryRow, !first && styles.optionRowBorder]}>
        <ProductImage id={product.id} style={styles.thumb} />
        <Text style={styles.summaryName} numberOfLines={2}>
          {product.name}
        </Text>
        {renderEditablePrice(
          product,
          <Text style={styles.summaryPrice}>
            {formatPrice(effectivePrice(product), product.currency)}
          </Text>
        )}
      </View>
    );
  }

  // Selectable, un-committed product (no percentage yet) shown when offer is ON.
  // Selection is a Pressable around the checkbox/name only, so the editable price
  // (a sibling) does not toggle selection when tapped.
  function renderLooseItem(product: OfferProduct) {
    const checked = selectedForGroup.has(product.id);
    return (
      <View key={product.id} style={[styles.row, checked && styles.rowSelected]}>
        <View style={styles.rowTop}>
          <Pressable
            onPress={() => toggleSelect(product.id)}
            style={styles.selectArea}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`${product.name}. ${t('studio.offer.selectForBundle')}`}
          >
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={22}
              color={checked ? colors.accent.primary : colors.text.muted}
            />
            <ProductImage id={product.id} style={styles.thumb} />
            <Text style={[styles.productName, styles.selectName]} numberOfLines={1}>
              {product.name}
            </Text>
          </Pressable>
          {renderEditablePrice(
            product,
            <Text style={styles.priceCurrent}>
              {formatPrice(effectivePrice(product), product.currency)}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // A committed offer. 'group' = each item discounted separately; 'bundle' =
  // buy all together, with optional free items and a buy-all total.
  function renderOffer(group: CatalogOfferGroup, index: number) {
    const items = group.productIds
      .map((id) => productById.get(id))
      .filter((p): p is OfferProduct => Boolean(p));
    if (!items.length) return null;
    const isBundle = group.kind === 'bundle';
    const multi = items.length > 1;
    const currency = items[0].currency;
    // A free item is a bonus, not a discount, so it is excluded from the bundle
    // total entirely — the total is just the items the customer pays for.
    const paidItems = items.filter((p) => !freebieFor(group, p.id));
    const originalTotal = paidItems.reduce((sum, p) => sum + effectivePrice(p), 0);
    const finalTotal = paidItems.reduce((sum, p) => sum + itemFinalPrice(group, p), 0);

    const headerLabel = isBundle
      ? t('studio.offer.bundleLabel').replace('{count}', String(items.length))
      : multi
        ? t('studio.offer.groupLabel').replace('{count}', String(items.length))
        : t('studio.offer.discountLabel');

    return (
      <View key={`offer-${index}`} style={styles.bundle}>
        <View style={styles.bundleHeader}>
          <View style={styles.bundleBadge}>
            <Ionicons
              name={isBundle ? 'cube-outline' : 'pricetags-outline'}
              size={14}
              color={colors.accent.primary}
            />
            <Text style={styles.bundleBadgeText}>{headerLabel}</Text>
          </View>
          <Pressable
            onPress={() => removeOffer(index)}
            style={({ pressed }) => [styles.ungroupBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('studio.offer.removeOffer')}
          >
            <Ionicons name="close-circle-outline" size={16} color={colors.text.secondary} />
            <Text style={styles.ungroupText}>{t('studio.offer.removeOffer')}</Text>
          </Pressable>
        </View>

        <Text style={styles.offerHint}>
          {isBundle ? t('studio.offer.bundleHint') : t('studio.offer.groupHint')}
        </Text>

        {items.map((p) => {
          const freebie = freebieFor(group, p.id);
          const isFree = Boolean(freebie);
          return (
            <View key={p.id} style={styles.bundleItemWrap}>
              <View style={styles.bundleItem}>
                <ProductImage id={p.id} style={styles.thumbSmall} />
                <View style={styles.rowInfo}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {renderEditablePrice(p, renderItemPrice(group, p))}
                </View>
                {isBundle && (
                  <Pressable
                    onPress={() => toggleFree(index, p.id)}
                    style={[styles.freeToggle, isFree && styles.freeToggleActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isFree }}
                    accessibilityLabel={t('studio.offer.markFree')}
                  >
                    <Ionicons
                      name={isFree ? 'gift' : 'gift-outline'}
                      size={13}
                      color={isFree ? '#fff' : colors.text.secondary}
                    />
                    <Text style={[styles.freeToggleText, isFree && styles.freeToggleTextActive]}>
                      {t('studio.offer.free')}
                    </Text>
                  </Pressable>
                )}
              </View>
              {isBundle && freebie && (
                <View style={styles.freeTypeRow}>
                  {(['item', 'range'] as FreeItemType[]).map((ftype) => {
                    const active = freebie.type === ftype;
                    return (
                      <Pressable
                        key={ftype}
                        onPress={() => setFreeType(index, p.id, ftype)}
                        style={[styles.freeTypeChip, active && styles.freeTypeChipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[styles.freeTypeChipText, active && styles.freeTypeChipTextActive]}
                        >
                          {ftype === 'item'
                            ? t('studio.offer.freeTypeItem')
                            : t('studio.offer.freeTypeRange')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {renderPercentControl(index, group.percent)}

        {isBundle && (
          <View style={styles.bundleTotal}>
            <Text style={styles.bundleTotalLabel}>{t('studio.offer.bundleTotal')}</Text>
            <View style={styles.priceRow}>
              {finalTotal !== originalTotal && (
                <Text style={styles.priceOriginal}>{formatPrice(originalTotal, currency)}</Text>
              )}
              <Text style={styles.priceDiscounted}>{formatPrice(finalTotal, currency)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  // One row of the grouped "generation options" card: accent icon tile, label,
  // and either a plain emphasized value or an On/Off status pill. `note` renders
  // a small caption beneath the row (used for the names-forced explanation).
  function renderOptionRow(opt: OfferOptionSummary, first: boolean, note?: string) {
    const tone = opt.tone ?? 'neutral';
    return (
      <View key={opt.label} style={[styles.optionRow, !first && styles.optionRowBorder]}>
        <View style={styles.optionMain}>
          {opt.icon && (
            <View style={styles.optionIcon}>
              <Ionicons name={opt.icon} size={17} color={colors.accent.primary} />
            </View>
          )}
          <Text style={styles.optionLabel} numberOfLines={1}>
            {opt.label}
          </Text>
          {tone === 'neutral' ? (
            <Text style={styles.optionValue} numberOfLines={1}>
              {opt.value}
            </Text>
          ) : (
            <View style={[styles.tonePill, tone === 'on' ? styles.tonePillOn : styles.tonePillOff]}>
              <View
                style={[styles.toneDot, tone === 'on' ? styles.toneDotOn : styles.toneDotOff]}
              />
              <Text
                style={[styles.toneText, tone === 'on' ? styles.toneTextOn : styles.toneTextOff]}
              >
                {opt.value}
              </Text>
            </View>
          )}
        </View>
        {note ? <Text style={styles.optionNote}>{note}</Text> : null}
      </View>
    );
  }

  const groupableCount = selectedForGroup.size;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={generating ? undefined : onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={generating ? undefined : handleCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'options' ? t('studio.offer.optionsTitle') : resolvedTitle}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'options' ? t('studio.offer.optionsSubtitle') : resolvedSubtitle}
            </Text>
          </View>

          {step === 'products' ? (
            <>
              {allowOffer && (
                <View style={styles.offerToggleRow}>
                  <View style={styles.offerToggleLabel}>
                    <View style={styles.optionIcon}>
                      <Ionicons name="pricetag-outline" size={17} color={colors.accent.primary} />
                    </View>
                    <Text style={styles.offerToggleText}>{t('studio.offer.markAsOffer')}</Text>
                  </View>
                  <Switch
                    value={offerEnabled}
                    onValueChange={(v) => {
                      haptic();
                      setOfferEnabled(v);
                      if (!v) setSelectedForGroup(new Set());
                    }}
                    trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                    thumbColor="#fff"
                  />
                </View>
              )}

              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {!allowOffer || !offerEnabled ? (
                  <View style={styles.optionsCard}>
                    {products.map((p, i) => renderSummaryItem(p, i === 0))}
                  </View>
                ) : (
                  <>
                    {looseProducts.length > 0 && (
                      <>
                        <Text style={styles.sectionLabel}>{t('studio.offer.selectHint')}</Text>
                        {looseProducts.map((p) => renderLooseItem(p))}
                      </>
                    )}
                    {groups.length > 0 && (
                      <>
                        <Text style={styles.sectionLabel}>{t('studio.offer.offersHeader')}</Text>
                        {groups.map((g, i) => renderOffer(g, i))}
                      </>
                    )}
                  </>
                )}
              </ScrollView>

              {allowOffer && offerEnabled && groupableCount === 1 && (
                <Pressable
                  onPress={() => createOffer('group')}
                  style={({ pressed }) => [styles.groupBtn, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="pricetags-outline" size={16} color="#fff" />
                  <Text style={styles.groupBtnText}>
                    {t('studio.offer.createOffer').replace('{count}', String(groupableCount))}
                  </Text>
                </Pressable>
              )}

              {allowOffer && offerEnabled && groupableCount >= 2 && (
                <View style={styles.offerActionRow}>
                  <Pressable
                    onPress={() => createOffer('group')}
                    style={({ pressed }) => [
                      styles.groupBtn,
                      styles.groupBtnHalf,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="pricetags-outline" size={16} color="#fff" />
                    <Text style={styles.groupBtnText}>
                      {t('studio.offer.makeGroup').replace('{count}', String(groupableCount))}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => createOffer('bundle')}
                    style={({ pressed }) => [
                      styles.groupBtn,
                      styles.groupBtnHalf,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="cube-outline" size={16} color="#fff" />
                    <Text style={styles.groupBtnText}>
                      {t('studio.offer.makeBundle').replace('{count}', String(groupableCount))}
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.actions}>
                <Pressable
                  onPress={handleCancel}
                  style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleProductsContinue}
                  style={({ pressed }) => [styles.continueButton, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('studio.offer.continue')}
                >
                  <Text style={styles.continueText}>{t('studio.offer.continue')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.optionsCard}>
                  {optionsSummary.map((opt, i) => renderOptionRow(opt, i === 0))}
                  {(() => {
                    const namesForced = allowOffer && offerHasGrouping(groups);
                    const namesOn = !namesForced && showProductNames;
                    return renderOptionRow(
                      {
                        label: t('studio.offer.optNames'),
                        icon: 'text-outline',
                        value: namesOn ? t('studio.offer.optOn') : t('studio.offer.optOff'),
                        tone: namesOn ? 'on' : 'off',
                      },
                      optionsSummary.length === 0,
                      namesForced ? t('studio.offer.namesDisabledNote') : undefined
                    );
                  })()}
                </View>
              </ScrollView>

              <View style={styles.actions}>
                <Pressable
                  onPress={handleBack}
                  disabled={generating}
                  style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('studio.offer.back')}
                >
                  <Text style={styles.cancelText}>{t('studio.offer.back')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleGenerate}
                  disabled={generating}
                  style={({ pressed }) => [
                    styles.continueButton,
                    (pressed || generating) && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('studio.offer.continue')}
                >
                  {generating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.continueText}>{t('studio.offer.continue')}</Text>
                      {typeof cost === 'number' && (
                        <Text style={styles.continueCost}>· {cost}</Text>
                      )}
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: D.spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 520,
      maxHeight: '88%',
      backgroundColor: colors.bg.elevated,
      borderRadius: D.radius.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.lg,
      ...D.shadow.modal,
    },
    header: {
      marginBottom: D.spacing.md,
    },
    title: {
      fontSize: D.fontSize.lg,
      fontWeight: D.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: D.spacing.xs,
    },
    subtitle: {
      fontSize: D.fontSize.sm,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    offerToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: D.spacing.sm,
      marginBottom: D.spacing.md,
    },
    offerToggleLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
    },
    offerToggleText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    list: {
      flexGrow: 0,
    },
    listContent: {
      gap: D.spacing.sm,
      paddingBottom: D.spacing.xs,
    },
    sectionLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.muted,
      marginTop: D.spacing.xs,
    },
    row: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: D.spacing.sm,
      gap: D.spacing.sm,
    },
    rowSelected: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: D.radius.sm,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    thumbSmall: {
      width: 40,
      height: 40,
      borderRadius: D.radius.sm,
      backgroundColor: colors.bg.elevated,
    },
    rowInfo: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    selectArea: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    selectName: {
      flex: 1,
      minWidth: 0,
    },
    productName: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.primary,
    },
    priceWithEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    priceEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    priceEditInput: {
      minWidth: 72,
      borderWidth: 1,
      borderColor: colors.accent.primary,
      borderRadius: D.radius.sm,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 4,
      color: colors.text.primary,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    priceCurrent: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    priceOriginal: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
      textDecorationLine: 'line-through',
    },
    priceDiscounted: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: colors.accent.primary,
    },
    percentControl: {
      marginTop: 2,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
    },
    percentChip: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 6,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    percentChipActive: {
      borderColor: colors.accent.primary,
      backgroundColor: colors.accent.dim,
    },
    percentChipText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    percentChipTextActive: {
      color: colors.accent.secondary,
      fontWeight: D.fontWeight.semibold,
    },
    customWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: D.radius.pill,
      paddingHorizontal: D.spacing.sm,
      backgroundColor: colors.bg.input,
    },
    customInput: {
      width: 44,
      paddingVertical: 6,
      color: colors.text.primary,
      fontSize: D.fontSize.sm,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    },
    customPercentSign: {
      fontSize: D.fontSize.sm,
      color: colors.text.muted,
    },
    bundle: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.md,
      borderWidth: 1,
      borderColor: colors.accent.dim,
      padding: D.spacing.sm,
      gap: D.spacing.sm,
    },
    bundleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bundleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    bundleBadgeText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: colors.accent.secondary,
    },
    offerHint: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      marginTop: -2,
    },
    optionsCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: D.radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'hidden',
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: 10,
    },
    summaryName: {
      flex: 1,
      minWidth: 0,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    summaryPrice: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    optionRow: {
      paddingHorizontal: D.spacing.sm + 2,
      paddingVertical: 12,
    },
    optionRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    optionMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm + 2,
    },
    optionIcon: {
      width: 34,
      height: 34,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.dim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    optionValue: {
      flexShrink: 1,
      textAlign: 'right',
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.primary,
    },
    optionNote: {
      fontSize: D.fontSize.xs,
      color: colors.text.muted,
      lineHeight: 16,
      marginTop: 6,
      paddingLeft: 34 + D.spacing.sm + 2,
    },
    tonePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 9,
      paddingRight: 11,
      paddingVertical: 5,
      borderRadius: D.radius.pill,
      borderWidth: 1,
    },
    tonePillOn: {
      backgroundColor: colors.accent.dim,
      borderColor: 'transparent',
    },
    tonePillOff: {
      backgroundColor: 'transparent',
      borderColor: colors.border.default,
    },
    toneDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    toneDotOn: {
      backgroundColor: colors.accent.primary,
    },
    toneDotOff: {
      backgroundColor: colors.text.muted,
    },
    toneText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
    },
    toneTextOn: {
      color: colors.accent.secondary,
    },
    toneTextOff: {
      color: colors.text.muted,
    },
    ungroupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    ungroupText: {
      fontSize: D.fontSize.xs,
      color: colors.text.secondary,
    },
    bundleItemWrap: {
      gap: 6,
    },
    bundleItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: D.spacing.sm,
    },
    freeTypeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: D.spacing.xs,
      paddingLeft: 40 + D.spacing.sm,
    },
    freeTypeChip: {
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 5,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    freeTypeChipActive: {
      borderColor: '#34D399',
      backgroundColor: 'rgba(52,211,153,0.16)',
    },
    freeTypeChipText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    freeTypeChipTextActive: {
      color: '#34D399',
      fontWeight: D.fontWeight.semibold,
    },
    freeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: D.spacing.sm,
      paddingVertical: 5,
      borderRadius: D.radius.pill,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.elevated,
    },
    freeToggleActive: {
      borderColor: '#34D399',
      backgroundColor: '#34D399',
    },
    freeToggleText: {
      fontSize: D.fontSize.xs,
      fontWeight: D.fontWeight.semibold,
      color: colors.text.secondary,
    },
    freeToggleTextActive: {
      color: '#fff',
    },
    freePrice: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: '#34D399',
    },
    bundleTotal: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: D.spacing.sm,
    },
    bundleTotalLabel: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    groupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.accent.primary,
      borderRadius: D.radius.pill,
      paddingVertical: 10,
      paddingHorizontal: D.spacing.sm,
      marginTop: D.spacing.md,
    },
    groupBtnHalf: {
      flex: 1,
      marginTop: 0,
    },
    offerActionRow: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      marginTop: D.spacing.md,
    },
    groupBtnText: {
      fontSize: D.fontSize.sm,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
    },
    actions: {
      flexDirection: 'row',
      gap: D.spacing.sm,
      marginTop: D.spacing.md,
    },
    cancelButton: {
      flex: 1,
      height: 48,
      borderRadius: D.radius.md,
      backgroundColor: colors.bg.input,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.medium,
      color: colors.text.secondary,
    },
    continueButton: {
      flex: 1,
      height: 48,
      flexDirection: 'row',
      gap: 6,
      borderRadius: D.radius.md,
      backgroundColor: colors.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...D.shadow.sm,
    },
    continueText: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.semibold,
      color: '#fff',
      letterSpacing: 0.2,
    },
    continueCost: {
      fontSize: D.fontSize.base,
      fontWeight: D.fontWeight.bold,
      color: '#fff',
    },
  });
}
