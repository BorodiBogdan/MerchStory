import { expect, type Route, test as base } from '@playwright/test';

// 1x1 transparent PNG, used wherever a journey needs image bytes to render.
export const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG}`;

// API base the web build always targets on localhost (utils/api.ts getApiUrl).
const API_GLOB = '**/localhost:5257/**';

// Deterministic clock: tests must not depend on wall-clock time, so timestamps are derived
// from a fixed base plus a monotonic counter.
const BASE_TIME = Date.parse('2026-06-10T08:00:00.000Z');

export interface LedgerEntry {
  id: number;
  amount: number;
  balanceAfter: number;
  description: string;
  relatedGeneratedImageId: string | null;
  createdAt: string;
}

export interface MockState {
  user: {
    email: string;
    userName: string;
    isAdmin: boolean;
    isShopSetupComplete: boolean;
    canViewRecommendations: boolean;
  };
  startBalance: number;
  balance: number;
  ledger: LedgerEntry[];
  products: Record<string, unknown>[];
  gallery: Record<string, unknown>[];
}

// The mock owns a small simulated server. Every charged operation routes through debit(), so the
// wallet balance always equals startBalance + sum(ledger amounts); specs assert that invariant.
export class MockServer {
  readonly state: MockState;
  /** Every intercepted call as "METHOD /path", so specs can assert a journey hit an endpoint. */
  readonly calls: string[] = [];
  private seq = 0;

  private readonly oneTime401 = new Set<string>();

  /** True if any recorded call matches "METHOD /path". */
  called(method: string, path: string): boolean {
    return this.calls.includes(`${method} ${path}`);
  }

  /** Force the next call to "METHOD /path" to return 401 once (to exercise the refresh-retry path). */
  expireOnce(method: string, path: string): void {
    this.oneTime401.add(`${method} ${path}`);
  }

  /** Pre-populate the product library so studio screens have something to select. */
  seedProduct(name: string): Record<string, unknown> {
    const product = {
      id: `prod-${this.state.products.length + 1}`,
      name,
      price: 9.99,
      currency: 'USD',
      category: null,
      imageUrl: TINY_PNG_DATA_URI,
      mimeType: 'image/png',
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.state.products.push(product);
    return product;
  }

  /** Pre-populate the gallery so the print picker has an asset to choose. */
  seedGallery(name: string): Record<string, unknown> {
    const item = {
      id: `gal-${this.state.gallery.length + 1}`,
      mimeType: 'image/png',
      createdAt: this.now(),
      name,
      generationType: 'catalog',
      assetType: 'Photo',
      paperSize: null,
    };
    this.state.gallery.push(item);
    return item;
  }

  constructor(opts?: {
    startBalance?: number;
    isAdmin?: boolean;
    isShopSetupComplete?: boolean;
    canViewRecommendations?: boolean;
  }) {
    this.state = {
      user: {
        email: 'e2e@test.com',
        userName: 'e2e@test.com',
        isAdmin: opts?.isAdmin ?? false,
        isShopSetupComplete: opts?.isShopSetupComplete ?? false,
        canViewRecommendations: opts?.canViewRecommendations ?? false,
      },
      startBalance: opts?.startBalance ?? 50,
      balance: opts?.startBalance ?? 50,
      ledger: [],
      products: [],
      gallery: [],
    };
  }

  /** Sum invariant helper: startBalance + sum(ledger) must equal balance at all times. */
  ledgerSum(): number {
    return this.state.ledger.reduce((s, t) => s + t.amount, 0);
  }

  private now(): string {
    this.seq += 1;
    return new Date(BASE_TIME + this.seq * 60_000).toISOString();
  }

  private debit(
    amount: number,
    description: string,
    relatedGeneratedImageId: string | null = null
  ) {
    this.state.balance -= amount;
    this.state.ledger.push({
      id: this.state.ledger.length + 1,
      amount: -amount,
      balanceAfter: this.state.balance,
      description,
      relatedGeneratedImageId,
      createdAt: this.now(),
    });
  }

  private grant(amount: number, description: string) {
    this.state.balance += amount;
    this.state.ledger.push({
      id: this.state.ledger.length + 1,
      amount,
      balanceAfter: this.state.balance,
      description,
      relatedGeneratedImageId: null,
      createdAt: this.now(),
    });
  }

  private authResponse() {
    return {
      token: 'fake.jwt.token',
      refreshToken: 'fake.refresh.token',
      email: this.state.user.email,
      userName: this.state.user.userName,
      isShopSetupComplete: this.state.user.isShopSetupComplete,
      isAdmin: this.state.user.isAdmin,
      canViewRecommendations: this.state.user.canViewRecommendations,
      preferredLanguage: 'EN',
      creditBalance: this.state.balance,
    };
  }

  // Routes one intercepted request. Returns the JSON body (any) or a Response-like via route.
  async handle(route: Route): Promise<void> {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname.replace(/\/$/, '') || '/';
    const key = `${method} ${path}`;
    this.calls.push(key);

    if (this.oneTime401.has(key)) {
      this.oneTime401.delete(key);
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    }

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    // --- Auth ---
    if (key === 'POST /auth/register' || key === 'POST /auth/login') {
      return json(this.authResponse());
    }
    if (key === 'POST /auth/refresh') {
      return json({
        ...this.authResponse(),
        token: 'fake.jwt.token.2',
        refreshToken: 'fake.refresh.2',
      });
    }
    if (key === 'PUT /auth/language') {
      return json({});
    }

    // --- Shop profile ---
    if (path === '/shop/profile' && method === 'GET') {
      return this.state.user.isShopSetupComplete
        ? json(this.shopProfile())
        : route.fulfill({ status: 204, body: '' });
    }
    if (path === '/shop/profile' && method === 'POST') {
      this.state.user.isShopSetupComplete = true;
      return json(this.shopProfile());
    }
    if (path === '/shop/logo' && method === 'POST') {
      return json({ logoUrl: 'inmem://logo.png' });
    }

    // --- Products ---
    if (path === '/products' && method === 'GET') {
      return json({
        items: this.state.products,
        total: this.state.products.length,
        page: 1,
        pageSize: 20,
      });
    }
    if (path === '/products' && method === 'POST') {
      const body = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
      const product = {
        id: `prod-${this.state.products.length + 1}`,
        name: (body.name as string) ?? 'Product',
        price: (body.price as number) ?? 0,
        currency: (body.currency as string) ?? 'USD',
        category: (body.category as string) ?? null,
        imageUrl: TINY_PNG_DATA_URI,
        mimeType: 'image/png',
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      this.state.products.push(product);
      return json(product);
    }
    if (path === '/products/categories' && method === 'GET') {
      return json([]);
    }
    if (path.startsWith('/products/') && path.endsWith('/image') && method === 'GET') {
      return json({ imageUrl: TINY_PNG_DATA_URI, mimeType: 'image/png' });
    }
    if (path.startsWith('/products/') && method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/products/remove-background' && method === 'POST') {
      return json({ imageBase64: TINY_PNG, mimeType: 'image/png' });
    }

    // --- Reference search (search-by-photo) ---
    if (path === '/reference-images/search' || path === '/reference-images/search-text') {
      return json([
        {
          id: 'ref-1',
          name: 'Matched product',
          categoryPath: 'Apparel/Shirts',
          imageUrl: TINY_PNG_DATA_URI,
          similarity: 0.93,
        },
      ]);
    }
    if (path === '/reference-images/categories' && method === 'GET') {
      return json([]);
    }

    // --- Image generation (charged endpoints route through debit) ---
    if (path === '/generate-image/catalog' && method === 'POST') {
      this.debit(1, 'Catalog generation');
      return json({ imageBase64: TINY_PNG, mimeType: 'image/png', balance: this.state.balance });
    }
    if (path === '/generate-image/announcement' && method === 'POST') {
      this.debit(1, 'Announcement generation');
      return json({ imageBase64: TINY_PNG, mimeType: 'image/png', balance: this.state.balance });
    }
    if (path === '/generate-image/wallpaper' && method === 'POST') {
      this.debit(1, 'Wallpaper generation');
      return json({ imageBase64: TINY_PNG, mimeType: 'image/png', balance: this.state.balance });
    }
    if (path === '/generate-image/catalog-on-wallpaper' && method === 'POST') {
      // This endpoint does not charge (matches the backend).
      return json({ imageBase64: TINY_PNG, mimeType: 'image/png', balance: this.state.balance });
    }

    // --- Gallery ---
    if (path === '/gallery/save' && method === 'POST') {
      const body = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
      const item = {
        id: `gal-${this.state.gallery.length + 1}`,
        mimeType: 'image/png',
        createdAt: this.now(),
        name: (body.name as string) ?? 'Asset',
        generationType: (body.generationType as string) ?? 'catalog',
        assetType: 'Photo',
        paperSize: null,
      };
      this.state.gallery.push(item);
      return json(item);
    }
    if (path === '/gallery' && method === 'GET') {
      return json({
        items: this.state.gallery,
        total: this.state.gallery.length,
        page: 1,
        pageSize: 20,
      });
    }
    if (path.startsWith('/gallery/') && path.endsWith('/image/raw') && method === 'GET') {
      return json({ imageBase64: TINY_PNG, mimeType: 'image/png' });
    }
    if (path.startsWith('/gallery/') && path.endsWith('/image') && method === 'GET') {
      return json({ imageUrl: TINY_PNG_DATA_URI, mimeType: 'image/png' });
    }

    // --- Recommendations (read path returns a ready idea inline) ---
    if (path === '/recommendations/today' && method === 'GET') {
      return json({
        status: 'ready',
        id: 'rec-1',
        generatedAtUtc: this.now(),
        ideas: [
          {
            id: 'idea-1',
            tone: 'holiday',
            title: 'Summer sale idea',
            meta: 'Today',
            body: 'Promote your bestsellers with a bright summer catalogue.',
            suggestedPost: 'Summer is here. Grab our bestsellers now!',
            type: 'promotion',
            imagePrompt: 'sunny storefront',
          },
        ],
      });
    }
    if (path.startsWith('/recommendations/') && path.endsWith('/feedback') && method === 'POST') {
      return route.fulfill({ status: 204, body: '' });
    }

    // --- Wallet ---
    if (path === '/wallet' && method === 'GET') {
      return json({
        balance: this.state.balance,
        recentTransactions: [...this.state.ledger].reverse().slice(0, 20),
      });
    }
    if (path === '/wallet/transactions' && method === 'GET') {
      return json({ items: [...this.state.ledger].reverse(), total: this.state.ledger.length });
    }
    if (path === '/wallet/admin/users' && method === 'GET') {
      const q = (url.searchParams.get('query') ?? '').toLowerCase();
      const match =
        q.length >= 2
          ? [
              {
                id: 'user-target',
                email: 'target@test.com',
                userName: 'target@test.com',
                isAdmin: false,
                creditBalance: 5,
              },
            ]
          : [];
      return json(match);
    }
    if (path === '/wallet/grant' && method === 'POST') {
      const body = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
      const amount = (body.amount as number) ?? 0;
      this.grant(amount, 'Admin grant');
      return json({
        userId: 'user-target',
        userEmail: (body.userEmail as string) ?? 'target@test.com',
        balance: this.state.balance,
        transaction: this.state.ledger[this.state.ledger.length - 1],
      });
    }

    // --- Print ---
    if (path === '/print/render' && method === 'POST') {
      this.debit(1, 'Print A4');
      return json({
        jobId: 'job-1',
        status: 'ready',
        qrSlug: null,
        newBalance: this.state.balance,
        upscaled: false,
        pdfUrl: 'inmem://print.pdf',
      });
    }
    if (path.startsWith('/print/') && method === 'GET') {
      return json({
        jobId: 'job-1',
        status: 'ready',
        qrSlug: null,
        newBalance: this.state.balance,
        upscaled: false,
        pdfUrl: 'inmem://print.pdf',
      });
    }

    // Unrouted backend call: never hard-fail a journey, but surface it for triage.
    // eslint-disable-next-line no-console
    console.warn(`[mockApi] unrouted ${key}`);
    return json({});
  }

  private shopProfile() {
    return {
      id: 'shop-1',
      brandName: 'E2E Shop',
      brandColors: [],
      slogan: null,
      businessDomain: 'Retail',
      otherDomain: null,
      targetAudience: null,
      shopType: null,
      competitors: null,
      city: null,
      countryCode: 'US',
      latitude: null,
      longitude: null,
      logoUrl: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }
}

export interface MockFixtures {
  mock: MockServer;
  seedAuth: (opts?: {
    isAdmin?: boolean;
    isShopSetupComplete?: boolean;
    canViewRecommendations?: boolean;
  }) => Promise<void>;
}

// Test fixture: installs the network interception and exposes the mock server plus a helper to
// boot the app already authenticated (skipping the login UI for mid-app journeys).
export const test = base.extend<MockFixtures>({
  // The second fixture argument is Playwright's value-provider callback (conventionally named
  // "use"); it is named "provide" here so the react-hooks lint rule doesn't mistake it for a hook.
  mock: async ({ context }, provide) => {
    const server = (context as unknown as { __mock?: MockServer }).__mock ?? new MockServer();
    (context as unknown as { __mock?: MockServer }).__mock = server;
    await context.route(API_GLOB, (route) => server.handle(route));
    await provide(server);
  },
  seedAuth: async ({ context }, provide) => {
    const seed = async (opts?: {
      isAdmin?: boolean;
      isShopSetupComplete?: boolean;
      canViewRecommendations?: boolean;
    }) => {
      const server = (context as unknown as { __mock?: MockServer }).__mock;
      if (server) {
        server.state.user.isAdmin = opts?.isAdmin ?? server.state.user.isAdmin;
        server.state.user.isShopSetupComplete = opts?.isShopSetupComplete ?? true;
        server.state.user.canViewRecommendations =
          opts?.canViewRecommendations ?? server.state.user.canViewRecommendations;
      }
      const user = {
        email: 'e2e@test.com',
        userName: 'e2e@test.com',
        isShopSetupComplete: opts?.isShopSetupComplete ?? true,
        isAdmin: opts?.isAdmin ?? false,
        canViewRecommendations: opts?.canViewRecommendations ?? false,
        creditBalance: server?.state.balance ?? 50,
      };
      await context.addInitScript(
        ([u]) => {
          localStorage.setItem('auth_token', 'fake.jwt.token');
          localStorage.setItem('auth_refresh_token', 'fake.refresh.token');
          localStorage.setItem('auth_user', JSON.stringify(u));
          localStorage.setItem('app_language', 'EN');
        },
        [user]
      );
    };
    await provide(seed);
  },
});

export { expect };
