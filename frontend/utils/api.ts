import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function getApiUrl(): string {
  // Web always runs on the same machine as the dev server
  if (Platform.OS === 'web') return 'http://localhost:5257';

  // In development on a physical device, derive the host from Expo's dev server
  // so the phone hits the same machine it loaded the JS bundle from — no manual IP needed
  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const host = hostUri.split(':')[0];
      return `http://${host}:5257`;
    }
  }

  // Production (or dev fallback): use explicit env var
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5257';
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

export interface AuthResponse {
  token: string;
  refreshToken: string;
  email: string;
  userName: string;
  isShopSetupComplete: boolean;
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
}

export interface ShopProfileResponse extends ShopProfilePayload {
  id: string;
  createdAt: string;
  updatedAt: string;
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

export async function generateImage(prompt: string): Promise<GenerateImageResponse> {
  const response = await fetchWithAuth(`${API_URL}/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<GenerateImageResponse>;
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export interface GalleryItem {
  id: string;
  imageBase64: string;
  mimeType: string;
  createdAt: string;
}

export async function fetchGallery(): Promise<GalleryItem[]> {
  const response = await fetchWithAuth(`${API_URL}/gallery`, {});

  if (!response.ok) {
    throw new Error(`Failed to load gallery (${response.status})`);
  }

  return response.json() as Promise<GalleryItem[]>;
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
  imageBase64: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPayload {
  name: string;
  price: number;
  imageBase64: string | null;
}

export async function fetchProducts(): Promise<ProductItem[]> {
  const response = await fetchWithAuth(`${API_URL}/products`, {});

  if (!response.ok) {
    throw new Error(`Failed to load products (${response.status})`);
  }

  return response.json() as Promise<ProductItem[]>;
}

export async function createProduct(payload: ProductPayload): Promise<ProductItem> {
  const response = await fetchWithAuth(`${API_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to create product (${response.status})`);
  }

  return response.json() as Promise<ProductItem>;
}

export async function updateProduct(id: string, payload: ProductPayload): Promise<ProductItem> {
  const response = await fetchWithAuth(`${API_URL}/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(err || `Failed to update product (${response.status})`);
  }

  return response.json() as Promise<ProductItem>;
}

export async function deleteProduct(id: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/products/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete product (${response.status})`);
  }
}
