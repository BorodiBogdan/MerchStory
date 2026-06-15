# CLAUDE.md — MerchStory Project Guide

This file gives Claude Code the context needed to make good decisions across all conversations.

---

## Project Summary
**MerchStory** is a cross-platform app (web, iOS, Android from one React Native codebase) that turns raw product photos and a shop profile into professional, brand-consistent AI-generated ads, catalogs, and wallpapers for small/local retailers. It also runs a daily recommendation engine that suggests marketing ideas grounded in real-world context (weather, holidays, news), and hands an idea straight to the generation pipeline. Paid AI calls are metered against a per-tenant credit ledger, and any asset can be exported as a print-ready PDF. See [docs/thesis/](docs/thesis/) for the full product spec and architecture.

---

## Monorepo Structure

```
/
├── backend/
│   ├── MerchStoryAPI/                # ASP.NET Core minimal API (main service)
│   │   ├── Auth/                     # JWT + refresh tokens (AuthRoutes, JwtService, RefreshTokenCleanupService)
│   │   ├── Categories/               # Reference-catalogue category tree
│   │   ├── Common/                   # Shared helpers
│   │   ├── Data/                     # EF Core DbContext (AppDbContext)
│   │   ├── Geocoding/                # Nominatim geocoding (recommendation context signals)
│   │   ├── Models/                   # AppUser, RefreshToken, ShopProfile, Product, GeneratedImage,
│   │   │                             #   ReferenceImage, Category, CreditTransaction, DailyRecommendation,
│   │   │                             #   IdeaEmbedding, IdeaInteraction, PromoPlaybookEntry, Holiday,
│   │   │                             #   PrintJob, PrintLink
│   │   ├── Migrations/               # EF Core migrations (pgvector-enabled)
│   │   ├── Shop/                     # ShopRoutes (shop profile: brand colors, contact, logo)
│   │   ├── Products/                 # ProductRoutes (product CRUD, image upload, background removal)
│   │   ├── Gallery/                  # GalleryRoutes (user's generated-asset library)
│   │   ├── ImageGeneration/          # ImageGenerationRoutes, CatalogCompositor, Fonts/
│   │   ├── ReferenceImages/          # ReferenceImageRoutes + CLIP embedding service (pgvector search)
│   │   ├── Recommendations/          # Daily recommendation engine, context providers, job runner, eval
│   │   ├── Wallet/                   # WalletRoutes + WalletService (credit ledger)
│   │   ├── Print/                    # PrintRoutes, PdfRenderer, Real-ESRGAN upscaler, QrLinkService
│   │   ├── LlmServices/              # ILLMService: Claude (Anthropic) + OpenAI-compatible judges
│   │   ├── Storage/                  # Azure Blob Storage abstraction (IBlobStorage)
│   │   └── Program.cs                # Endpoint wiring, DI, auth, CORS, telemetry
│   ├── MerchStoryImageGeneration/    # Image generation + recommendation class library
│   │   ├── Services/                 # Announcement / Catalog / Wallpaper image services,
│   │   │                             #   Gemini/OpenAI/Mock/Canned providers, IImageProvider,
│   │   │                             #   ImageProviderResolver, Recommendations/ (LLM provider, embeddings, Chat)
│   │   ├── Models/                   # Request DTOs + BrandContext + ImageGenerationResult + Recommendations/
│   │   └── Extensions/               # ServiceCollectionExtensions (DI registration)
│   ├── MerchStory.Tests/             # xUnit integration tests
│   ├── iopaint/                      # Dockerized IOPaint background-removal service
│   └── models/                       # Gitignored ONNX models (CLIP vision, Real-ESRGAN)
├── frontend/                         # React Native (Expo) app
│   ├── app/
│   │   ├── _layout.tsx               # Root layout (Auth, Theme, Shop, Setup providers)
│   │   ├── (auth)/                   # Login & register
│   │   ├── (setup)/                  # 3-step shop onboarding (step1..step3)
│   │   ├── (tabs)/                   # index, products, gallery, wallpapers, wallet, print, profile,
│   │   │                             #   studio/ (announcements, catalog, video)
│   │   ├── (tabs)/admin*.tsx         # admin, admin-grant-credits, admin-grant-recommendations
│   │   ├── (tabs)/add-products-professional.tsx  # Admin product-import flow
│   │   └── modal.tsx
│   ├── components/                   # Reusable UI components (ui/, studio/, ...)
│   ├── context/                      # auth, theme, shop, setup
│   ├── utils/                        # api.ts (central API client), formatMessage.ts
│   └── constants/                    # design tokens + theme colors
├── docs/
│   └── thesis/                       # LaTeX thesis (full product + architecture writeup)
├── recommendation-eval/             # Offline recommendation-output evaluation harness
├── .husky/pre-commit                 # lint-staged (frontend) + dotnet format (backend)
├── docker-compose.yml
└── docker-compose.override.yml
```

---

## Tech Stack

### Backend
- **Runtime:** .NET 10 (ASP.NET Core minimal API)
- **Auth:** ASP.NET Identity + custom JWT service with refresh tokens; `IsAdmin` flag on `AppUser`
- **AI Orchestration:** Microsoft Semantic Kernel — multi-model routing, prompt management, plugin system
- **Image Generation:** Provider-agnostic behind `IImageProvider` (`ImageProviderResolver` picks per request): `GeminiImageProvider` in production, `OpenAiImageProvider` opt-in, `MockImageProvider` / `CannedFileImageProvider` for tests and local iteration. Three service flavors: Announcement, Catalog, Wallpaper (each with its own request model and prompt strategy). The catalog flow has a hybrid mode where `CatalogCompositor` pastes the retailer's real product photos into model-reserved placeholders so product fidelity is preserved pixel-for-pixel.
- **Recommendations:** Daily marketing ideas via a Strategist/Writer/Translator prompt chain over Semantic Kernel, with RAG over a seeded `PromoPlaybookEntry` table (pgvector) plus context signals (weather, holidays, news). Chat backend is configurable (local LM Studio/Ollama, DeepSeek, Claude, ChatGPT); `Mock` provider is the dev/test default.
- **Billing:** Per-tenant credit ledger (`WalletService` + `CreditTransaction`); every paid AI call is wrapped in an atomic debit-and-record that commits only on success and refunds on failure.
- **Print:** `PdfRenderer` exports gallery assets to print-ready PDF (A6 to A3, 300 dpi); a premium path upscales via a Real-ESRGAN ONNX model (`RealEsrganUpscaler`).
- **Background removal:** One-tap product-photo cleanup delegated to a Dockerized IOPaint service (`IOPaintClient`).
- **Reference-image search:** CLIP embeddings stored in pgvector for "find similar products from a photo"
- **ORM:** Entity Framework Core with `UseVector()` (pgvector)
- **Storage:** Azure Blob Storage (images, generated assets, PDFs)
- **Database:** PostgreSQL 18 (Docker) + pgvector

### Frontend
- **Framework:** React Native via Expo (~54)
- **Language:** TypeScript (strict mode)
- **Navigation:** Expo Router (file-based routing under `app/`, route groups for auth/setup/tabs)
- **Animation:** React Native Reanimated (shared values, `useAnimatedStyle`)
- **State:** React Context — `AuthContext`, `ThemeContext`, `ShopContext`, `SetupContext`
- **Haptics:** `expo-haptics`

### Infrastructure
- Docker Compose for local dev (PostgreSQL + backend + frontend); `docker-compose.override.yml` for dev-only tweaks
- GitHub Actions CI (`.github/workflows/ci.yml`)
- Husky + lint-staged pre-commit hooks (root `package.json`)

---

## Coding Conventions

### Backend (.NET)
- Minimal API style. Each feature area has its own folder with a `*Routes.cs` file and a `Map<Feature>Endpoints()` extension method wired up in `Program.cs`.
- Use `ILogger<T>` for logging; no `Console.WriteLine` in production code
- Secrets (API keys, JWT key, DB connection) are sourced from **Azure Key Vault** in production (wired in `Program.cs` via `AddAzureKeyVault` + `DefaultAzureCredential`; the Container App's managed identity authenticates, devs use `az login` locally). Key Vault provides production defaults; `appsettings.Development.json`, user-secrets, and env vars are re-layered on top so they override KV for local dev. Never hardcode secrets in source.
- Tests live in `MerchStory.Tests` (xUnit, integration-style against a real DB; no Moq)

### Frontend (React Native / Expo)
- TypeScript strict mode
- Screens in `app/` (Expo Router), reusable components in `components/ui/`
- No inline styles — use `StyleSheet.create` or design token constants
- All API calls go through `utils/api.ts`
- Design tokens in `constants/design.ts` (spacing, durations) and `constants/theme.ts` (colors)
- Animated values (`useSharedValue`) must be included in `useEffect` dependency arrays

### Linting & Formatting
- Frontend: `npx expo lint --fix` (not plain `eslint --fix` — plugin resolution requires the expo wrapper)
- Backend: `dotnet format <project>.csproj`
- Pre-commit hooks handle both automatically on staged files

---

## AI Integration Notes
- Semantic Kernel is the orchestration layer for LLM-based reasoning tasks (the recommendation engine's Strategist/Writer/Translator chain)
- Image generation goes through `IImageProvider` (Gemini in prod, OpenAI opt-in, Mock/Canned in tests/dev); `ImageProviderResolver` selects per request
- Per-asset-type services (`AnnouncementImageService`, `CatalogImageService`, `WallpaperImageService`) encapsulate prompts and post-processing; `CatalogCompositor` handles the hybrid product-preserving catalog mode
- CLIP embeddings + pgvector power the reference-image / "search by photo" feature; text embeddings (also pgvector) deduplicate recommendation ideas and back playbook RAG
- Every billable AI call is metered through `WalletService` (atomic debit-and-record, refund on failure)

---

## Capability Areas (all shipped)
- Auth (JWT + refresh tokens, admin flag)
- Shop profile + 3-step setup onboarding (locks currency and language)
- Product library (CRUD + photo import + background removal via IOPaint + search-by-photo via CLIP)
- Reference catalogue (curated images, category tree, bulk import)
- Asset generation (announcements, catalogs, wallpapers; fully generative or hybrid)
- Daily recommendation engine (context signals + playbook RAG)
- Generated-image gallery
- Print export (PDF, A6 to A3, Real-ESRGAN premium upscaling)
- Credit ledger / wallet
- Admin (credit grants, recommendation grants, account lookup, reference-catalogue curation)

---

## Important Constraints
- Keep AI API keys out of source control; use Azure Key Vault (prod), `.env`, or user-secrets
- Image assets and generated PDFs are stored externally (blob storage), not in the repo
- ONNX models (CLIP vision, Real-ESRGAN) are gitignored and must be provided separately (see README)
- Mobile-first UX for small retailers; no jargon in UI copy
- Supported languages are English and Romanian, locked at onboarding and carried end-to-end
- Tenant isolation: every retailer-owned row carries a `UserId`; filter on it on every query
- Facebook/social publishing has been removed; don't reintroduce it without product sign-off
