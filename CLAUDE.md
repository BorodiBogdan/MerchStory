# CLAUDE.md — MerchStory Project Guide

This file gives Claude Code the context needed to make good decisions across all conversations.

---

## Project Summary
**MerchStory** is a mobile app that turns raw product photos into professional AI-generated ads for small/local retailers. See [docs/project-description.md](docs/project-description.md) for the full product spec and build phases.

---

## Monorepo Structure

```
/
├── backend/
│   ├── MerchStoryAPI/                # ASP.NET Core minimal API (main service)
│   │   ├── Auth/                     # JWT + refresh token auth (AuthRoutes, JwtService)
│   │   ├── Data/                     # EF Core DbContext (AppDbContext)
│   │   ├── Models/                   # AppUser, RefreshToken
│   │   └── Migrations/               # EF Core migrations
│   ├── MerchStoryImageGeneration/    # Image generation class library
│   │   ├── Services/                 # IImageGenerationService, GeminiImageGenerationService
│   │   └── Extensions/               # ServiceCollectionExtensions (DI registration)
│   └── MerchStory.Tests/             # xUnit integration test project
├── frontend/                         # React Native (Expo) app
│   ├── app/
│   │   ├── _layout.tsx               # Root layout (AuthProvider, ThemeProvider)
│   │   ├── (auth)/                   # Login & register screens
│   │   └── (tabs)/                   # Main tab screens (index, explore)
│   ├── components/ui/                # FloatingInput, LogoutModal, SocialButton, etc.
│   ├── context/
│   │   ├── auth.tsx                  # Auth state (JWT storage, login/logout)
│   │   └── theme.tsx                 # Dark/light theme state
│   ├── utils/
│   │   └── api.ts                    # Centralized API client
│   └── constants/
│       ├── design.ts                 # Spacing, duration, layout tokens
│       └── theme.ts                  # Color palette for dark/light modes
├── docs/
│   └── project-description.md       # Full product spec
├── .husky/
│   └── pre-commit                    # Runs lint-staged (frontend) + dotnet format (backend)
└── docker-compose.yml
```

---

## Tech Stack

### Backend
- **Runtime:** .NET 10 (ASP.NET Core minimal API)
- **Auth:** ASP.NET Identity + custom JWT service with refresh tokens (stored in PostgreSQL)
- **AI Orchestration:** Microsoft Semantic Kernel — multi-model routing, prompt management, plugin system, memory/RAG
- **Image Generation:** Google Gemini API via `GeminiImageGenerationService`
- **ORM:** Entity Framework Core
- **Storage:** Azure Blob Storage (images, videos, generated assets)
- **Database:** PostgreSQL 18 (Docker container) + pgvector for Semantic Kernel vector store

### Frontend
- **Framework:** React Native via Expo (~54)
- **Language:** TypeScript (strict mode)
- **Navigation:** Expo Router (file-based routing under `app/`)
- **Animation:** React Native Reanimated (shared values, `useAnimatedStyle`)
- **State:** React Context — `AuthContext` (JWT + refresh tokens), `ThemeContext` (dark/light)
- **Haptics:** `expo-haptics` for tactile feedback on interactions

### Infrastructure
- Docker Compose for local dev (PostgreSQL + backend + frontend)
- GitHub Actions CI/CD (`.github/workflows/ci.yml`)
- Husky + lint-staged for pre-commit hooks (root `package.json`)

---

## Coding Conventions

### Backend (.NET)
- Minimal API style in `Program.cs`; group related endpoints into route groups (e.g. `Auth/AuthRoutes.cs`)
- Semantic Kernel plugins go in a `Plugins/` folder under `MerchStoryAPI/`
- Use `ILogger<T>` for logging; no `Console.WriteLine` in production code
- All secrets (API keys, JWT key, DB connection) go in `appsettings.Development.json` or environment variables — never hardcoded
- Test project mirrors backend structure; use xUnit (no Moq yet — integration tests hit real DB)

### Frontend (React Native / Expo)
- TypeScript strict mode
- Screens in `app/` (Expo Router), reusable components in `components/`
- No inline styles — use `StyleSheet.create` or the design token constants
- All API calls go through `utils/api.ts`
- Design tokens in `constants/design.ts` (spacing, durations) and `constants/theme.ts` (colors)
- Animated values (`useSharedValue`) must be included in `useEffect` dependency arrays

### Linting & Formatting
- Frontend: `npx expo lint --fix` (not plain `eslint --fix` — plugin resolution requires the expo wrapper)
- Backend: `dotnet format <project>.csproj`
- Pre-commit hooks handle both automatically on staged files

---

## AI Integration Notes (Semantic Kernel)
- Semantic Kernel is the single orchestration layer — all LLM calls route through it
- Use SK Plugins to wrap third-party APIs (weather, news, image generation, social posting)
- Use SK Memory / Vector Store for storing user asset metadata and retrieval
- Model routing: default to GPT-4o for reasoning tasks; swap to cheaper models for simple classification/tagging
- Prompt templates go in `Plugins/<PluginName>/skprompt.txt` following SK conventions
- Current image generation: Google Gemini (`GeminiImageGenerationService`) — registered via `ServiceCollectionExtensions`

---

## Build Phase Priority
Always respect the P0 → P1 → P2 order from the product spec. Do not implement P1/P2 features before P0 is solid.

**P0 (current focus):**
- Auth — JWT + refresh tokens implemented
- Context Engine (weather, events, holidays)
- Smart Object Studio (background removal, upscaling, scene generation)
- Basic asset library

---

## Important Constraints
- Keep AI API keys out of source control — use `.env` or user-secrets
- Image/video assets are stored externally (blob storage), not in the repo
- The app targets small retailers — UX must be simple; avoid jargon in UI copy
- Mobile-first: all UI decisions should be validated against small screens first
