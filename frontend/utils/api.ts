import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ── Gallery ──────────────────────────────────────────────────────────────────
import type { GenerationType } from '@/constants/generationTypes';

function getApiUrl(): string {
  // In production, always use the explicit env var regardless of platform
  if (!__DEV__) {
    return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5257';
  }

  // Dev on web: use localhost
  if (Platform.OS === 'web') return 'http://localhost:5257';

  // Dev on a physical device: derive the host from Expo's dev server
  // so the phone hits the same machine it loaded the JS bundle from — no manual IP needed
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:5257`;
  }

  return 'http://localhost:5257';
}

const API_URL = getApiUrl();

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(REFRESH_TOKEN_KEY);
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function saveRefreshToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    return;
  }
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

// Called when a refresh definitively fails (refresh token expired/revoked) so the
// app can clear its session and route back to login. Registered by AuthProvider.
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

// Single-flight guard: when many requests 401 at once (e.g. the dashboard mounts
// with an expired JWT), they must NOT each POST /auth/refresh with the same
// single-use refresh token — the first call revokes it and the rest fail. Instead
// all callers await the one in-flight refresh and share its result.
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as AuthResponse;
      await saveToken(data.token);
      await saveRefreshToken(data.refreshToken);
      return data.token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
  const token = await getToken();
  const headers = {
    ...(init.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(url, { ...init, headers });
  if (response.status !== 401) return response;

  // Token expired — attempt refresh and retry once
  const newToken = await tryRefreshAccessToken();
  if (!newToken) {
    // Refresh token is gone/expired/revoked: the session is dead. Tell the app to
    // sign out so it routes to login instead of leaving a broken logged-in shell.
    if (token) onSessionExpired?.();
    return response;
  }
  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${newToken}` },
  });
}

export interface GenerateImageResponse {
  imageBase64: string;
  mimeType: string;
  warning?: string;
  missingProducts?: string[];
  balance?: number | null;
}

export interface WalletTransaction {
  id: number;
  amount: number;
  balanceAfter: number;
  description: string | null;
  relatedGeneratedImageId: string | null;
  createdAt: string;
}

export interface WalletSummary {
  balance: number;
  recentTransactions: WalletTransaction[];
}

export interface WalletTransactionPage {
  items: WalletTransaction[];
  total: number;
}

export interface AdminUserLookup {
  id: string;
  email: string;
  userName: string;
  isAdmin: boolean;
  creditBalance: number;
}

export interface GrantCreditsResponse {
  userId: string;
  userEmail: string;
  balance: number;
  transaction: WalletTransaction;
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Insufficient credits');
    this.name = 'InsufficientCreditsError';
  }
}

export type Currency = 'USD' | 'EUR' | 'RON';
export type AppLanguage = 'EN' | 'RO';

export interface AuthResponse {
  token: string;
  refreshToken: string;
  email: string;
  userName: string;
  isShopSetupComplete: boolean;
  isAdmin: boolean;
  preferredLanguage: AppLanguage;
  creditBalance: number;
}

export interface BrandColor {
  hex: string;
  percentage: number;
}

export interface ShopProfilePayload {
  brandName: string;
  // Inline base64 logo on first save (before /shop/logo upload exists). The
  // backend uploads it to blob and never persists the base64.
  logoBase64?: string | null;
  brandColors: BrandColor[];
  slogan?: string | null;
  businessDomain: string;
  otherDomain?: string | null;
  targetAudience?: string | null;
  shopType?: string | null;
  competitors?: string | null;
  city?: string | null;
  countryCode?: string | null;
  phoneNumber: string;
  email: string;
  addresses: string[];
  instagramHandle?: string | null;
  facebookHandle?: string | null;
  tikTokHandle?: string | null;
  currency: Currency;
  generationLanguage: AppLanguage;
}

// `logoBase64` from the request payload is replaced with `logoUrl` on the
// response — the backend now serves logos as short-lived SAS URLs.
export interface ShopProfileResponse extends Omit<ShopProfilePayload, 'logoBase64'> {
  id: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function updateAppLanguage(language: AppLanguage): Promise<{ language: AppLanguage }> {
  const response = await fetchWithAuth(`${API_URL}/auth/language`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
  if (!response.ok) throw new Error(`Failed to update language (${response.status})`);
  return response.json() as Promise<{ language: AppLanguage }>;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Invalid email or password.');
  }

  return response.json() as Promise<AuthResponse>;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errors = await response.json().catch(() => []);
    const message =
      Array.isArray(errors) && errors.length > 0
        ? (errors as string[]).join(' ')
        : 'Registration failed.';
    throw new Error(message);
  }

  return response.json() as Promise<AuthResponse>;
}

export async function submitShopProfile(payload: ShopProfilePayload): Promise<ShopProfileResponse> {
  const response = await fetchWithAuth(`${API_URL}/shop/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Shop profile submission failed (${response.status})`);
  }

  return response.json() as Promise<ShopProfileResponse>;
}

export async function uploadShopLogo(imageUri: string, mimeType = 'image/jpeg'): Promise<string> {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    formData.append('logo', blob, 'logo.jpg');
  } else {
    formData.append('logo', { uri: imageUri, name: 'logo.jpg', type: mimeType } as unknown as Blob);
  }

  const response = await fetchWithAuth(`${API_URL}/shop/logo`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Logo upload failed.');
  }

  const data = (await response.json()) as { logoUrl: string };
  return data.logoUrl;
}

export async function getShopProfile(): Promise<ShopProfileResponse | null> {
  const response = await fetchWithAuth(`${API_URL}/shop/profile`, {});

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Failed to load shop profile (${response.status})`);
  }

  return response.json() as Promise<ShopProfileResponse>;
}

export async function updateShopProfile(payload: ShopProfilePayload): Promise<ShopProfileResponse> {
  const response = await fetchWithAuth(`${API_URL}/shop/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Update failed (${response.status})`);
  }

  return response.json() as Promise<ShopProfileResponse>;
}

// ── Image generation ─────────────────────────────────────────────────────────

export interface CatalogImageProduct {
  id: string;
  name: string;
  price: number;
  currency?: Currency;
}

// ── Catalog offers ───────────────────────────────────────────────────────────
// Shared offer contract used by the offer modal, StudioCanvas, and the backend
// request. Lives here (not in the modal) so utils stays the single source of the
// API shape and the modal can import it without a circular dependency.

/**
 * 'group'  = category-style discount: each product is sold separately at the
 *            same percentage off (e.g. any Lays at 30%).
 * 'bundle' = buy-all deal: the customer takes every product together; some can
 *            be marked free (e.g. buy 2 get 1 free).
 */
export type CatalogOfferKind = 'group' | 'bundle';

/**
 * 'item'  = a specific known product is the freebie (e.g. buy glasses + shorts,
 *           get THIS t-shirt free).
 * 'range' = the freebie comes from a product range / same item (e.g. buy 2 of
 *           these chips, get one more free).
 */
export type FreeItemType = 'item' | 'range';

export interface BundleFreebie {
  productId: string;
  type: FreeItemType;
}

export interface CatalogOfferGroup {
  kind: CatalogOfferKind;
  productIds: string[];
  percent: number;
  /** Bundle only: products given away free within the bundle, each tagged by type. */
  freebies: BundleFreebie[];
  /**
   * Bundle only, computed by the frontend when the config is submitted: the price
   * the customer pays = sum of the PAID (non-free) items, each after `percent`.
   * A free item is a bonus and is NOT subtracted from this, so it is never framed
   * as a discount. `bundleOriginalPrice` is the same paid items at full price
   * (differs only when `percent > 0`).
   */
  bundlePrice?: number;
  bundleOriginalPrice?: number;
}

export interface CatalogOfferConfig {
  isOffer: boolean;
  groups: CatalogOfferGroup[];
}

/**
 * True when the offer contains a real group (2+ products) or any bundle — the
 * cases where per-product name labels are hidden for the whole catalog.
 */
export function offerHasGrouping(groups: CatalogOfferGroup[]): boolean {
  return groups.some(
    (g) => g.kind === 'bundle' || (g.kind === 'group' && g.productIds.length >= 2)
  );
}

export interface GenerateCatalogImageParams {
  products: CatalogImageProduct[];
  colorTheme: string;
  format: string;
  showPrices: boolean;
  showProductNames?: boolean;
  backgroundStyle?: 'Realistic' | 'SocialPost';
  preserveProductImages?: boolean;
  brandContextFields?: string[];
  currency?: Currency;
  language?: AppLanguage;
  offer?: CatalogOfferConfig;
  // Which image model generates the catalog: 'gemini' (nano banana, default) | 'openai'.
  imageModel?: 'gemini' | 'openai';
}

export interface GenerateAnnouncementImageParams {
  postType: string;
  content: string;
  tone: string;
  format: string;
  brandContextFields?: string[];
  productImageIds?: string[];
  // Job Post only
  jobTitle?: string;
  jobSchedule?: string;
  jobSalary?: string;
  jobImageStyle?: 'with-person' | 'text-only';
  jobRequirements?: string[];
  language?: AppLanguage;
  imageModel?: 'gemini' | 'openai';
}

async function parseGenerationResponse(response: Response): Promise<GenerateImageResponse> {
  if (response.status === 402) {
    throw new InsufficientCreditsError();
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<GenerateImageResponse>;
}

export async function generateCatalogImage(
  params: GenerateCatalogImageParams
): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseGenerationResponse(response);
}

export async function generateAnnouncementImage(
  params: GenerateAnnouncementImageParams
): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image/announcement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseGenerationResponse(response);
}

export interface GenerateWallpaperParams {
  prompt: string;
  format: string;
  includeLogo: boolean;
  brandContextFields?: string[];
  language?: AppLanguage;
  // Which image model generates the wallpaper: 'gemini' (nano banana, default) | 'openai'.
  imageModel?: 'gemini' | 'openai';
}

export interface TextStyleOptions {
  fontFamily?: string; // Modern | Elegant | Bold | Friendly
  fontSize?: string; // Small | Medium | Large
  nameColor?: string; // hex color
  priceColor?: string | null;
  colorMode?: string; // Solid | Gradient | Rainbow
  gradientEndColor?: string;
  textEffect?: string; // None | Shadow | Outline
  priceBadge?: string; // None | Pill
}

export interface PlacementZone {
  x: number; // 0.0–1.0 fraction of canvas width
  y: number; // 0.0–1.0 fraction of canvas height
  width: number; // 0.0–1.0 fraction of canvas width
  height: number; // 0.0–1.0 fraction of canvas height
}

export interface GenerateCatalogOnWallpaperParams {
  products: CatalogImageProduct[];
  wallpaperBase64: string;
  layout: string;
  showPrices: boolean;
  showProductNames: boolean;
  textStyle?: TextStyleOptions;
  placementZone?: PlacementZone;
}

export async function generateWallpaper(
  params: GenerateWallpaperParams
): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image/wallpaper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseGenerationResponse(response);
}

export async function generateCatalogOnWallpaper(
  params: GenerateCatalogOnWallpaperParams
): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image/catalog-on-wallpaper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<GenerateImageResponse>;
}

export type GalleryAssetType = 'Photo' | 'Video' | 'Pdf';

export interface GalleryItem {
  id: string;
  mimeType: string;
  createdAt: string;
  name: string;
  generationType: GenerationType | null;
  assetType: GalleryAssetType;
  paperSize: string | null;
}

export interface GalleryImageBytes {
  imageUrl: string | null;
  mimeType: string;
}

export interface GalleryImageRaw {
  imageBase64: string;
  mimeType: string;
}

export interface GalleryFilters {
  types?: GenerationType[];
  assetType?: GalleryAssetType;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function coercePaged<T>(body: unknown, reqPage?: number, reqPageSize?: number): Paged<T> {
  if (Array.isArray(body)) {
    const arr = body as T[];
    return {
      items: arr,
      total: arr.length,
      page: reqPage ?? 1,
      pageSize: reqPageSize ?? arr.length,
    };
  }
  if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
    const paged = body as Paged<T>;
    return {
      items: paged.items ?? [],
      total: typeof paged.total === 'number' ? paged.total : (paged.items?.length ?? 0),
      page: typeof paged.page === 'number' ? paged.page : (reqPage ?? 1),
      pageSize:
        typeof paged.pageSize === 'number'
          ? paged.pageSize
          : (reqPageSize ?? paged.items?.length ?? 0),
    };
  }
  return { items: [], total: 0, page: reqPage ?? 1, pageSize: reqPageSize ?? 0 };
}

export class GalleryNameConflictError extends Error {
  constructor(message = 'You already have an image with that name.') {
    super(message);
    this.name = 'GalleryNameConflictError';
  }
}

export async function saveToGallery(
  imageBase64: string,
  mimeType: string,
  generationType: GenerationType,
  name: string
): Promise<GalleryItem> {
  const response = await fetchWithAuth(`${API_URL}/gallery/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, generationType, name }),
  });

  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new GalleryNameConflictError(body.detail);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Failed to save image (${response.status})`);
  }

  return response.json() as Promise<GalleryItem>;
}

export async function fetchGallery(filters: GalleryFilters = {}): Promise<Paged<GalleryItem>> {
  const params = new URLSearchParams();
  if (filters.types && filters.types.length > 0) {
    params.set('type', filters.types.join(','));
  }
  if (filters.assetType) params.set('assetType', filters.assetType);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.search && filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.page && filters.page > 0) params.set('page', String(filters.page));
  if (filters.pageSize && filters.pageSize > 0) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  const url = qs ? `${API_URL}/gallery?${qs}` : `${API_URL}/gallery`;
  const response = await fetchWithAuth(url, {});

  if (!response.ok) {
    throw new Error(`Failed to load gallery (${response.status})`);
  }

  const body = (await response.json()) as unknown;
  return coercePaged<GalleryItem>(body, filters.page, filters.pageSize);
}

export async function updateGalleryItemName(id: string, name: string): Promise<GalleryItem> {
  const response = await fetchWithAuth(`${API_URL}/gallery/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new GalleryNameConflictError(body.detail);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Failed to rename image (${response.status})`);
  }

  return response.json() as Promise<GalleryItem>;
}

export async function fetchGalleryImage(id: string): Promise<GalleryImageBytes> {
  const response = await fetchWithAuth(`${API_URL}/gallery/${id}/image`, {});
  if (!response.ok) {
    throw new Error(`Failed to load image (${response.status})`);
  }
  return response.json() as Promise<GalleryImageBytes>;
}

// Fetches the raw image bytes as base64 through our own API rather than the blob
// SAS URL. Used when the caller needs the bytes in-process (e.g. inlining a saved
// wallpaper into a catalog request): a direct browser fetch of the SAS URL is
// CORS-blocked, but this authenticated endpoint reads the blob server-side.
export async function fetchGalleryImageBase64(id: string): Promise<GalleryImageRaw> {
  const response = await fetchWithAuth(`${API_URL}/gallery/${id}/image/raw`, {});
  if (!response.ok) {
    throw new Error(`Failed to load image (${response.status})`);
  }
  return response.json() as Promise<GalleryImageRaw>;
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/gallery/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete image (${response.status})`);
  }
}

// ── Products ─────────────────────────────────────────────────────────────────

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  currency: Currency;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  mimeType: string;
  // Short-lived SAS URL for the product image. Null if the product has no image.
  imageUrl: string | null;
}

export interface ProductDetail {
  id: string;
  name: string;
  price: number;
  currency: Currency;
  imageUrl: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImageBytes {
  imageUrl: string | null;
  mimeType: string;
}

export interface ProductPayload {
  name: string;
  price: number;
  currency?: Currency;
  imageBase64: string | null;
  category: string | null;
}

export function currencySymbol(currency: Currency | string | null | undefined): string {
  switch ((currency ?? 'USD').toUpperCase()) {
    case 'EUR':
      return '€';
    case 'RON':
      return 'lei';
    default:
      return '$';
  }
}

export function formatPrice(
  amount: number,
  currency: Currency | string | null | undefined
): string {
  const normalized = (currency ?? 'USD').toUpperCase();
  const symbol = currencySymbol(normalized);
  if (normalized === 'RON') {
    return `${amount.toFixed(2)} ${symbol}`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

export interface ProductFilters {
  search?: string;
  categories?: string[];
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Paged<ProductItem>> {
  const params = new URLSearchParams();
  if (filters.search && filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.categories && filters.categories.length > 0) {
    params.set(
      'categories',
      filters.categories
        .map((c) => c.trim())
        .filter(Boolean)
        .join(',')
    );
  }
  if (filters.minPrice !== undefined && !Number.isNaN(filters.minPrice)) {
    params.set('minPrice', String(filters.minPrice));
  }
  if (filters.maxPrice !== undefined && !Number.isNaN(filters.maxPrice)) {
    params.set('maxPrice', String(filters.maxPrice));
  }
  if (filters.page && filters.page > 0) params.set('page', String(filters.page));
  if (filters.pageSize && filters.pageSize > 0) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  const url = qs ? `${API_URL}/products?${qs}` : `${API_URL}/products`;
  const response = await fetchWithAuth(url, {});

  if (!response.ok) {
    throw new Error(`Failed to load products (${response.status})`);
  }

  const body = (await response.json()) as unknown;
  return coercePaged<ProductItem>(body, filters.page, filters.pageSize);
}

export async function fetchProductImage(id: string): Promise<ProductImageBytes> {
  const response = await fetchWithAuth(`${API_URL}/products/${id}/image`, {});
  if (!response.ok) {
    throw new Error(`Failed to load image (${response.status})`);
  }
  return response.json() as Promise<ProductImageBytes>;
}

export async function fetchProductCategories(): Promise<string[]> {
  const response = await fetchWithAuth(`${API_URL}/products/categories`, {});

  if (!response.ok) {
    throw new Error(`Failed to load product categories (${response.status})`);
  }

  return response.json() as Promise<string[]>;
}

export async function createProduct(payload: ProductPayload): Promise<ProductDetail> {
  const response = await fetchWithAuth(`${API_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to create product (${response.status})`);
  }

  return response.json() as Promise<ProductDetail>;
}

export async function updateProduct(id: string, payload: ProductPayload): Promise<ProductDetail> {
  const response = await fetchWithAuth(`${API_URL}/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to update product (${response.status})`);
  }

  return response.json() as Promise<ProductDetail>;
}

export async function deleteProduct(id: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/products/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete product (${response.status})`);
  }
}

export interface RemoveBackgroundResponse {
  imageBase64: string;
  mimeType: string;
}

// ── Reference image similarity search ────────────────────────────────────────

export interface ReferenceImage {
  id: string;
  name: string;
  categoryPath: string | null;
  imageUrl: string | null;
  similarity: number;
}

export interface AddReferenceImagePayload {
  name: string;
  categoryPath?: string | null;
  imageBase64: string;
}

export async function addReferenceImage(payload: AddReferenceImagePayload): Promise<{
  id: string;
  name: string;
  categoryPath: string | null;
  createdAt: string;
}> {
  const response = await fetchWithAuth(`${API_URL}/reference-images/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to add reference image (${response.status})`);
  }
  return response.json() as Promise<{
    id: string;
    name: string;
    categoryPath: string | null;
    createdAt: string;
  }>;
}

export interface ReferenceCategoryNode {
  name: string;
  children: ReferenceCategoryNode[];
}

export async function fetchReferenceCategories(): Promise<ReferenceCategoryNode[]> {
  const response = await fetchWithAuth(`${API_URL}/reference-images/categories`, { method: 'GET' });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to load categories (${response.status})`);
  }
  return response.json() as Promise<ReferenceCategoryNode[]>;
}

export interface ImportReferenceZipResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function importReferenceZip(file: File | Blob): Promise<ImportReferenceZipResult> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetchWithAuth(`${API_URL}/reference-images/import-zip`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Zip import failed (${response.status})`);
  }
  return response.json() as Promise<ImportReferenceZipResult>;
}

export async function searchReferenceImages(
  imageBase64: string,
  topK = 10
): Promise<ReferenceImage[]> {
  const response = await fetchWithAuth(`${API_URL}/reference-images/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, topK }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Similarity search failed (${response.status})`);
  }
  return response.json() as Promise<ReferenceImage[]>;
}

export async function searchReferenceImagesByText(
  query: string,
  topK = 10
): Promise<ReferenceImage[]> {
  const response = await fetchWithAuth(`${API_URL}/reference-images/search-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Text search failed (${response.status})`);
  }
  return response.json() as Promise<ReferenceImage[]>;
}

// Fetch a reference image's bytes through the API (server reads blob storage).
// Used when picking a reference for a product: fetching the blob SAS URL directly
// from the browser fails CORS, so we proxy the bytes through our own origin.
export async function fetchReferenceImageData(
  id: string
): Promise<{ imageBase64: string; mimeType: string }> {
  const response = await fetchWithAuth(`${API_URL}/reference-images/${id}/image`, {
    method: 'GET',
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to load reference image (${response.status})`);
  }
  return response.json() as Promise<{ imageBase64: string; mimeType: string }>;
}

export async function removeBackground(imageBase64: string): Promise<RemoveBackgroundResponse> {
  const response = await fetchWithAuth(`${API_URL}/products/remove-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Background removal failed (${response.status})`);
  }

  return response.json() as Promise<RemoveBackgroundResponse>;
}

// ── Recommendations ──────────────────────────────────────────────────────────

export type IdeaTone = 'weather' | 'holiday' | 'news' | 'trend';
export type IdeaType = 'announcement' | 'promotion';

export interface IdeaItem {
  id: string;
  tone: IdeaTone;
  title: string;
  meta: string;
  body: string;
  suggestedPost: string;
  type: IdeaType;
  imagePrompt: string;
}

// Discriminated response shape — Phase 3 introduces async job semantics.
// Mock provider responds with "ready" inline; LLM provider responds with
// "generating" + jobId and the frontend polls via /recommendations/jobs/{jobId}.
// `feedback` maps ideaId → the user's current thumb on that idea, so the UI can
// rehydrate likes/dislikes after a remount (tab switch, re-login). Ideas the
// user hasn't thumbed are simply absent from the map.
export type IdeaThumb = 'thumbs_up' | 'thumbs_down';

export type RecommendationResponse =
  | {
      status: 'ready';
      id: string;
      generatedAtUtc: string;
      ideas: IdeaItem[];
      feedback: Record<string, IdeaThumb>;
    }
  | { status: 'generating'; jobId: string }
  | { status: 'failed'; error: string };

interface RawIdeaItem {
  id: string;
  tone: IdeaTone;
  title: string;
  meta: string;
  body: string;
  suggestedPost: string;
  type?: IdeaType | string | null;
  imagePrompt?: string | null;
}

interface RawRecommendationResponse {
  status: 'ready' | 'generating' | 'failed';
  jobId?: string | null;
  id?: string | null;
  generatedAtUtc?: string | null;
  ideas?: RawIdeaItem[] | null;
  error?: string | null;
  feedback?: Record<string, string> | null;
}

function normalizeIdea(raw: RawIdeaItem): IdeaItem {
  const type: IdeaType = raw.type === 'promotion' ? 'promotion' : 'announcement';
  return {
    id: raw.id,
    tone: raw.tone,
    title: raw.title,
    meta: raw.meta,
    body: raw.body,
    suggestedPost: raw.suggestedPost,
    type,
    imagePrompt: raw.imagePrompt ?? '',
  };
}

function normalizeFeedback(
  raw: Record<string, string> | null | undefined
): Record<string, IdeaThumb> {
  const out: Record<string, IdeaThumb> = {};
  if (!raw) return out;
  for (const [id, action] of Object.entries(raw)) {
    if (action === 'thumbs_up' || action === 'thumbs_down') {
      out[id] = action;
    }
  }
  return out;
}

function normalizeRecommendationResponse(raw: RawRecommendationResponse): RecommendationResponse {
  if (raw.status === 'ready') {
    return {
      status: 'ready',
      id: raw.id ?? '',
      generatedAtUtc: raw.generatedAtUtc ?? '',
      ideas: (raw.ideas ?? []).map(normalizeIdea),
      feedback: normalizeFeedback(raw.feedback),
    };
  }
  if (raw.status === 'generating') {
    return { status: 'generating', jobId: raw.jobId ?? '' };
  }
  return { status: 'failed', error: raw.error ?? 'Unknown error' };
}

// Recommendation endpoints accept an optional ?lang= query param so the
// backend can project idea text in the user's currently-active app language —
// the frontend's useI18n() value is the source of truth. EN/RO are the only
// supported codes; anything else falls back to AppUser.PreferredLanguage.
function langQuery(lang?: AppLanguage): string {
  return lang ? `?lang=${lang.toLowerCase()}` : '';
}

export async function fetchIdeas(lang?: AppLanguage): Promise<RecommendationResponse> {
  const response = await fetchWithAuth(`${API_URL}/recommendations/today${langQuery(lang)}`, {});
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to load ideas (${response.status})`);
  }
  return normalizeRecommendationResponse(
    await (response.json() as Promise<RawRecommendationResponse>)
  );
}

// refreshIdeas always kicks off a new generation (returns "generating" + jobId).
// No lang param needed — the follow-up pollIdeasJob carries the language.
export async function refreshIdeas(): Promise<RecommendationResponse> {
  const response = await fetchWithAuth(`${API_URL}/recommendations/refresh`, {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to refresh ideas (${response.status})`);
  }
  return normalizeRecommendationResponse(
    await (response.json() as Promise<RawRecommendationResponse>)
  );
}

export async function pollIdeasJob(
  jobId: string,
  lang?: AppLanguage
): Promise<RecommendationResponse> {
  const response = await fetchWithAuth(
    `${API_URL}/recommendations/jobs/${jobId}${langQuery(lang)}`,
    {}
  );
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to poll job (${response.status})`);
  }
  return normalizeRecommendationResponse(
    await (response.json() as Promise<RawRecommendationResponse>)
  );
}

export type IdeaFeedbackAction =
  | 'viewed'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'dismissed'
  | 'generated_from';

export async function submitIdeaFeedback(
  recommendationId: string,
  ideaId: string,
  action: IdeaFeedbackAction
): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/recommendations/${recommendationId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideaId, action }),
  });
  // Best-effort: log + swallow non-2xx so feedback failures don't disrupt the user flow.
  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.warn('Idea feedback submission failed', response.status);
  }
}

export async function getWallet(): Promise<WalletSummary> {
  const response = await fetchWithAuth(`${API_URL}/wallet/`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load wallet (${response.status})`);
  }
  return response.json() as Promise<WalletSummary>;
}

export async function getWalletTransactions(skip = 0, take = 50): Promise<WalletTransactionPage> {
  const response = await fetchWithAuth(`${API_URL}/wallet/transactions?skip=${skip}&take=${take}`, {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(`Failed to load transactions (${response.status})`);
  }
  return response.json() as Promise<WalletTransactionPage>;
}

export async function lookupAdminUsers(query: string): Promise<AdminUserLookup[]> {
  const response = await fetchWithAuth(
    `${API_URL}/wallet/admin/users?query=${encodeURIComponent(query)}`,
    { method: 'GET' }
  );
  if (!response.ok) {
    throw new Error(`User lookup failed (${response.status})`);
  }
  return response.json() as Promise<AdminUserLookup[]>;
}

export async function grantCredits(
  userEmail: string,
  amount: number,
  note?: string
): Promise<GrantCreditsResponse> {
  const response = await fetchWithAuth(`${API_URL}/wallet/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail, amount, note }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Grant failed with status ${response.status}`
    );
  }
  return response.json() as Promise<GrantCreditsResponse>;
}

// ── Print Shop ───────────────────────────────────────────────────────────────
export type PaperSize = 'A6' | 'A5' | 'A4' | 'A3';
export type PrintOrientation = 'portrait' | 'landscape';
export type PrintJobStatus = 'pending' | 'rendering' | 'ready' | 'failed';
export type QrSize = 'S' | 'M' | 'L';
export type QrBackground = 'transparent' | 'white';

export interface RenderPrintRequest {
  generatedImageId: string;
  paperSize: PaperSize;
  qrTargetUrl?: string;
  qrX?: number;
  qrY?: number;
  qrSize?: QrSize;
  qrBackground?: QrBackground;
}

export interface RenderPrintResponse {
  jobId: string;
  status: PrintJobStatus;
  qrSlug: string | null;
  newBalance: number | null;
  upscaled: boolean;
  pdfUrl: string | null;
}

export interface PrintJobDetails {
  id: string;
  status: PrintJobStatus;
  paperSize: string;
  orientation: string;
  qualityTier: string;
  pdfUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function renderPrint(req: RenderPrintRequest): Promise<RenderPrintResponse> {
  const response = await fetchWithAuth(`${API_URL}/print/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Print render failed (${response.status})`
    );
  }
  return response.json() as Promise<RenderPrintResponse>;
}

export async function getPrintJob(jobId: string): Promise<PrintJobDetails> {
  const response = await fetchWithAuth(`${API_URL}/print/${jobId}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load print job (${response.status})`);
  }
  return response.json() as Promise<PrintJobDetails>;
}
