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

async function tryRefreshAccessToken(): Promise<string | null> {
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
  }
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
  if (!newToken) return response;
  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${newToken}` },
  });
}

export interface GenerateImageResponse {
  imageBase64: string;
  mimeType: string;
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
}

export interface BrandColor {
  hex: string;
  percentage: number;
}

export interface ShopProfilePayload {
  brandName: string;
  logoBase64?: string | null;
  brandColors: BrandColor[];
  slogan?: string | null;
  businessDomain: string;
  otherDomain?: string | null;
  targetAudience?: string | null;
  shopType?: string | null;
  competitors?: string | null;
  phoneNumber: string;
  email: string;
  addresses: string[];
  instagramHandle?: string | null;
  facebookHandle?: string | null;
  tikTokHandle?: string | null;
  currency: Currency;
  generationLanguage: AppLanguage;
}

export interface ShopProfileResponse extends ShopProfilePayload {
  id: string;
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

export interface SocialStatus {
  facebookConnected: boolean;
  facebookLastSyncedAt?: string | null;
}

export async function getSocialStatus(): Promise<SocialStatus> {
  const response = await fetchWithAuth(`${API_URL}/social/status`, {});
  if (!response.ok) throw new Error(`Failed to load social status (${response.status})`);
  return response.json() as Promise<SocialStatus>;
}

export async function disconnectSocial(provider: 'facebook'): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/social/disconnect?provider=${provider}`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Failed to disconnect ${provider} (${response.status})`);
}

export async function getFacebookConnectUrl(): Promise<string> {
  const response = await fetchWithAuth(`${API_URL}/facebook/connect-url`, {});
  if (!response.ok) throw new Error('Could not get Facebook connect URL.');
  const data = (await response.json()) as { url: string };
  return data.url;
}

export interface FacebookMediaItem {
  id: string;
  source: string | null;
  name: string | null;
  likesCount: number;
}

export async function fetchFacebookMedia(): Promise<FacebookMediaItem[]> {
  const response = await fetchWithAuth(`${API_URL}/facebook/media`, {});
  if (!response.ok) throw new Error(`Failed to fetch Facebook photos (${response.status})`);
  return response.json() as Promise<FacebookMediaItem[]>;
}

export interface FacebookCommentItem {
  id: string;
  message: string;
  fromName: string | null;
}

export interface FacebookPhotoDetails {
  likesCount: number;
  commentsCount: number;
  comments: FacebookCommentItem[];
}

export async function fetchFacebookPhotoDetails(photoId: string): Promise<FacebookPhotoDetails> {
  const response = await fetchWithAuth(`${API_URL}/facebook/photo/${photoId}`, {});
  if (!response.ok) throw new Error(`Failed to fetch photo details (${response.status})`);
  return response.json() as Promise<FacebookPhotoDetails>;
}

export async function syncSocialPosts(platform: 'facebook'): Promise<{ synced: number }> {
  const response = await fetchWithAuth(`${API_URL}/social/sync/${platform}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Sync failed (${response.status})`);
  return response.json() as Promise<{ synced: number }>;
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

  const data = (await response.json()) as { logoBase64: string };
  return data.logoBase64;
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
  name: string;
  price: number;
  imageBase64: string | null;
  currency?: Currency;
}

export interface GenerateCatalogImageParams {
  products: CatalogImageProduct[];
  layout: string;
  colorTheme: string;
  format: string;
  showPrices: boolean;
  brandContextFields?: string[];
  currency?: Currency;
  language?: AppLanguage;
}

export interface GenerateAnnouncementImageParams {
  postType: string;
  content: string;
  tone: string;
  format: string;
  brandContextFields?: string[];
  productImages?: string[];
  // Job Post only
  jobTitle?: string;
  jobSchedule?: string;
  jobSalary?: string;
  jobImageStyle?: 'with-person' | 'text-only';
  jobRequirements?: string[];
  language?: AppLanguage;
}

export async function generateCatalogImage(
  params: GenerateCatalogImageParams
): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image/catalog`, {
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

export async function generateAnnouncementImage(
  params: GenerateAnnouncementImageParams
): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image/announcement`, {
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

export interface GenerateWallpaperParams {
  prompt: string;
  format: string;
  includeLogo: boolean;
  brandContextFields?: string[];
  language?: AppLanguage;
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

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<GenerateImageResponse>;
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

export interface GalleryItem {
  id: string;
  mimeType: string;
  createdAt: string;
  name: string;
  generationType: GenerationType | null;
}

export interface GalleryImageBytes {
  imageBase64: string;
  mimeType: string;
}

export interface GalleryFilters {
  types?: GenerationType[];
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
}

export interface ProductDetail {
  id: string;
  name: string;
  price: number;
  currency: Currency;
  imageBase64: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImageBytes {
  imageBase64: string;
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
  category: string | null;
  imageBase64: string;
  similarity: number;
}

export interface AddReferenceImagePayload {
  name: string;
  category?: string | null;
  imageBase64: string;
}

export async function addReferenceImage(payload: AddReferenceImagePayload): Promise<{
  id: string;
  name: string;
  category: string | null;
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
    category: string | null;
    createdAt: string;
  }>;
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
