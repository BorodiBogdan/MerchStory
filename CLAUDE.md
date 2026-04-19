# CLAUDE.md — MerchStory Project Guide

This file gives Claude Code the context needed to make good decisions across all conversations.

---

## Project Summary
**MerchStory** is a mobile app that turns raw product photos into professional AI-generated ads, catalogs, and wallpapers for small/local retailers, with one-tap publishing to social channels. See [docs/project-description.md](docs/project-description.md) for the full product spec and build phases.

---
testests
## Monorepo Structure

```
/
├── backend/
│   ├── MerchStoryAPI/                # ASP.NET Core minimal API (main service)
│   │   ├── Auth/                     # JWT + refresh tokens (AuthRoutes, JwtService, RefreshTokenCleanupService)
│   │   ├── Data/                     # EF Core DbContext (AppDbContext)
│   │   ├── Models/                   # AppUser, RefreshToken, ShopProfile, Product,
│   │   │                             #   GeneratedImage, ReferenceImage, SocialPost
│   │   ├── Migrations/               # EF Core migrations (pgvector-enabled)
│   │   ├── Shop/                     # ShopRouasdasdasdtes — shop profile (brand colors, contact, logo)
│   │   ├── Products/                 # ProductRoutes — product CRUD, image upload
│   │   ├── Gallery/                  # GalleryRoutes — user's generated-asset library
│   │   ├── ImageGeneration/          # ImageGenerationRoutes, CatalogCompositor, Fonts/
│   │   ├── ReferenceImages/          # ReferenceImageRoutes + CLIP embedding service (pgvector search)
│   │   ├── Facebook/                 # FacebookRoutes — OAuth + page/post endpoints
│   │   ├── Social/                   # SocialRoutes + FacebookSocialPostSyncService (post cache)
│   │   └── Program.cs                # Endpoint wiring, DI, auth, CORS
│   ├── MerchStoryImageGeneration/    # Image generation class library
│   │   ├── Services/                 # Announcement / Catalog / Wallpaper image services,
│   │   │                             #   GeminiImageProvider, MockImageProvider, IImageProvider
│   │   ├── Models/                   # Request DTOs + BrandContext + ImageGenerationResult
│   │   └── Extensions/               # ServiceCollectionExtensions (DI registration)
│   └── MerchStory.Tests/             # xUnit integration tests
├── frontend/                         # React Native (Expo) app
│   ├── app/
│   │   ├── _layout.tsx               # Root layout (Auth, Theme, Shop, Setup providers)
│   │   ├── (auth)/                   # Login & register
│   │   ├── (setup)/                  # 3-step shop onboarding (step1..step3)
│   │   ├── (tabs)/                   # index, products, gallery, wallpapers, analytics, profile
│   │   ├── add-products-professional.tsx  # Admin product-import flow
│   │   ├── social-callback.tsx       # OAuth redirect handler
│   │   └── modal.tsx
│   ├── components/ui/                # AuthNavbar, FloatingInput, ChipSelector,
│   │                                 #   ColorPickerInput, RgbColorPicker, PlacementZoneEditor,
│   │                                 #   SetupShell, StepProgress, LandingPage, LogoutModal, SocialButton
│   ├── context/                      # auth, theme, shop, setup
│   ├── utils/                        # api.ts (central API client), formatMessage.ts
│   └── constants/                    # design tokens + theme colors
├── docs/
│   └── project-description.md        # Full product spec
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
- **Image Generation:** Google Gemini via `GeminiImageProvider`; `MockImageProvider` for tests. Three service flavors: Announcement, Catalog, Wallpaper (each with its own request model and prompt strategy). `CatalogCompositor` overlays text/branding onto generated catalogs.
- **Reference-image search:** CLIP embeddings stored in pgvector for "find similar products from a photo"
- **Social:** Facebook OAuth + page publishing; `FacebookSocialPostSyncService` caches posted content. Instagram scaffolding exists but Instagram sync has been removed.
- **ORM:** Entity Framework Core with `UseVector()` (pgvector)
- **Storage:** Azure Blob Storage (images, videos, generated assets)
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
- All secrets (API keys, JWT key, DB connection) go in `appsettings.Development.json` or environment variables — never hardcoded
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
- Semantic Kernel is the orchestration layer for LLM-based reasoning tasks
- Image generation goes through `IImageProvider` (Gemini in prod, Mock in tests)
- Per-asset-type services (`AnnouncementImageService`, `CatalogImageService`, `WallpaperImageService`) encapsulate prompts and post-processing
- CLIP embeddings + pgvector power the reference-image / "search by photo" feature

---

## Build Phase Priority
Always respect the P0 → P1 → P2 order from the product spec.

**Shipped / in progress (P0):**
- Auth (JWT + refresh tokens, admin flag)
- Shop profile + 3-step setup onboarding
- Product library (CRUD + photo import + search-by-photo via CLIP)
- Generated-image gallery (catalog, announcement, wallpaper asset types)
- Facebook OAuth + post publishing + post cache
- Admin dashboard (professional product import)

---

## Important Constraints
- Keep AI API keys out of source control — use `.env` or user-secrets
- Image/video assets are stored externally (blob storage), not in the repo
- Mobile-first UX — small retailers, no jargon in UI copy
- Instagram routes/scaffolding exist but Instagram sync has been removed; don't reintroduce it without product sign-off
