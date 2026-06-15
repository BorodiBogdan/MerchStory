# MerchStory

MerchStory turns a small retailer's raw product photos and shop profile into professional, brand-consistent marketing assets (announcements, catalogs, and wallpapers). It also watches real-world context (weather, holidays, recent news) and suggests fresh marketing ideas every day, then hands an idea straight to the generation pipeline. The client runs as web, iOS, and Android from a single React Native (Expo) codebase, and the service is deployed on Microsoft Azure.

## Features

- **Auth.** Email/password sign-in, JWT access tokens with rotating refresh tokens, and an admin flag on the account.
- **Shop onboarding.** A 3-step setup flow captures brand descriptors, visual identity (colors, logo), and contact details. Currency and generation language are locked at the end and inherited by every later request.
- **Product library.** Create, edit, and delete products (name, category, price, photo), filter by name/category/price, and clean up photos with one-tap background removal (delegated to a local IOPaint service).
- **Reference catalogue and search-by-photo.** A curated, category-tree catalogue of professional product imagery. A phone photo is matched against it with CLIP embeddings stored in pgvector, so the retailer can swap a snapshot for a clean studio image without typing a description.
- **AI image generation.** Three asset families:
  - *Announcements* (sub-typed as general announcement, job post, or promotion),
  - *Catalogs* (fully generative, hybrid product-preserving via the in-house compositor, or in-house composite with no model call),
  - *Wallpapers.*
  Generation is provider-agnostic behind `IImageProvider`: Google Gemini in production, OpenAI GPT Image as an opt-in per-request alternative, and mock/canned providers for tests and local iteration.
- **Daily recommendations.** A ranked set of fresh marketing themes grounded in the shop profile, external context signals (weather, holidays, news), and a curated promo playbook retrieved over pgvector (RAG). Ideas carry a ready-to-use image prompt that pre-fills the asset-creation screen. The chat backend is configurable (local LM Studio/Ollama, DeepSeek, Claude, or ChatGPT).
- **Gallery.** Every generated asset is persisted and browsable, filterable by type, date, and name.
- **Print export.** Any gallery item exports as a print-ready PDF from A6 to A3 at 300 dpi. A premium path upscales low-resolution sources through a Real-ESRGAN ONNX model before layout.
- **Credits and wallet.** Every paid AI call is debited against a per-tenant credit balance through a transactional ledger: the debit commits only when the call succeeds, and a failure triggers an automatic refund.
- **Admin.** Operator-only screens to grant credits, grant recommendation access, look up accounts, and curate the reference catalogue (single add or bulk ZIP import).
- **Localisation.** English and Romanian, locked at onboarding and carried end-to-end.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [.NET SDK](https://dotnet.microsoft.com/download) | 10.0.x | Backend runtime |
| [Node.js](https://nodejs.org/) | 22.x | Frontend tooling |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | PostgreSQL + full-stack dev |
| [Expo CLI](https://docs.expo.dev/get-started/installation/) | Latest | Mobile dev (`npm install -g expo-cli`) |

---

## Repository Structure

```
/
├── backend/
│   ├── MerchStoryAPI/                # ASP.NET Core minimal API (main service)
│   │   ├── Auth/                     # JWT + refresh tokens, RefreshTokenCleanupService
│   │   ├── Categories/               # Reference-catalogue category tree
│   │   ├── Common/                   # Shared helpers
│   │   ├── Data/                     # EF Core DbContext (pgvector enabled)
│   │   ├── Gallery/                  # Generated-asset library
│   │   ├── Geocoding/                # Nominatim geocoding for context signals
│   │   ├── ImageGeneration/          # Generation endpoints + CatalogCompositor + Fonts
│   │   ├── LlmServices/              # Claude (Anthropic) + OpenAI-compatible LLM judges
│   │   ├── Migrations/               # EF Core migrations (pgvector-enabled)
│   │   ├── Models/                   # AppUser, ShopProfile, Product, GeneratedImage,
│   │   │                             #   ReferenceImage, CreditTransaction, DailyRecommendation,
│   │   │                             #   IdeaEmbedding, PromoPlaybookEntry, Holiday, PrintJob, ...
│   │   ├── Print/                    # PDF export + Real-ESRGAN upscaler + QR links
│   │   ├── Products/                 # Product CRUD, photo upload, background removal
│   │   ├── Recommendations/          # Daily recommendation engine + context providers + jobs
│   │   ├── ReferenceImages/          # CLIP embedding service + pgvector search
│   │   ├── Shop/                     # Shop profile endpoints
│   │   ├── Storage/                  # Azure Blob Storage abstraction
│   │   ├── Wallet/                   # Credit ledger endpoints
│   │   └── Program.cs                # Endpoint wiring, DI, auth, CORS, telemetry
│   ├── MerchStoryImageGeneration/    # Image generation + recommendation class library
│   │   ├── Services/                 # Announcement/Catalog/Wallpaper services,
│   │   │                             #   Gemini/OpenAI/Mock/Canned providers, Recommendations/
│   │   ├── Models/                   # Request DTOs, BrandContext, recommendation DTOs
│   │   └── Extensions/               # DI registration
│   ├── MerchStory.Tests/             # xUnit integration tests
│   ├── iopaint/                      # Dockerized IOPaint background-removal service
│   └── models/                       # Gitignored ONNX models (CLIP, Real-ESRGAN)
├── frontend/                         # React Native (Expo) app
│   ├── app/
│   │   ├── (auth)/                   # Login & register
│   │   ├── (setup)/                  # 3-step shop onboarding
│   │   └── (tabs)/                   # index, products, gallery, wallpapers, wallet, print,
│   │                                 #   profile, studio/, admin + admin-grant screens
│   ├── components/                   # Reusable UI components (incl. studio/)
│   ├── context/                      # auth, theme, shop, setup
│   ├── utils/                        # api.ts (central API client)
│   └── constants/                    # design tokens & theme colors
├── docs/
│   └── thesis/                       # LaTeX thesis (full product + architecture writeup)
├── recommendation-eval/             # Offline evaluation harness for recommendation output
├── docker-compose.yml
├── docker-compose.override.yml
└── .env.example                      # Environment variable template
```

---

## Environment Setup

Copy the example env file and fill in the required values:

```bash
cp .env.example .env
```

`.env` is used by Docker Compose. Edit it:

```dotenv
GOOGLE_API_KEY=your_google_genai_api_key_here
```

For **local backend development** (without Docker), configure `backend/MerchStoryAPI/appsettings.Development.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=merchstory;Username=postgres;Password=devpassword"
  },
  "Jwt": {
    "Key": "your-dev-jwt-secret-at-least-32-chars",
    "Issuer": "MerchStory",
    "Audience": "MerchStoryClient"
  },
  "Google": {
    "ApiKey": "your_google_genai_api_key_here"
  },
  "Clip": {
    "ModelPath": "./models/clip_vision_model.onnx"
  }
}
```

> Never commit real secrets. `appsettings.Development.json` is gitignored for this reason. In production these values are sourced from Azure Key Vault.

Optional configuration sections (all have safe defaults so the app runs without them):

- `Recommendations:ProviderType` (`Mock` default, or `Llm`) and `Recommendations:Llm:Backend` (`Local`, `DeepSeek`, `Claude`, or `ChatGpt`) select the daily-recommendation engine and its chat backend.
- `LlmJudge:Backend` (`Claude` default, or `Local`) picks the composite-judge model.
- `ImageProvider:UseCannedImage=true` returns a fixed PNG instead of calling Gemini, for iterating on the compositor without paying for API calls.
- `Storage:*` / `Azure:BlobServiceUri` configure Azure Blob Storage (Azurite for local dev, managed identity in production).

---

## CLIP Model (Search-by-Photo)

The "find similar products from a photo" feature runs OpenAI's **CLIP ViT-B/32** vision model **locally** via ONNX Runtime, with no external API calls and no per-request cost. Embeddings (512-dim) are stored in PostgreSQL using `pgvector` for similarity search.

You must download the model file before the backend can start:

1. Download `clip_vision_model.onnx` from the Qdrant mirror on Hugging Face:
   https://huggingface.co/Qdrant/clip-ViT-B-32-vision
2. Place it somewhere the backend can read, e.g. `backend/models/clip_vision_model.onnx`.
3. Point the `Clip:ModelPath` setting at it (see the `appsettings.Development.json` example above), or set the env var `Clip__ModelPath=/path/to/clip_vision_model.onnx`.

For Docker, mount the model into the backend container and set `Clip__ModelPath` to the in-container path (the compose file already expects this).

The model is ~350 MB. It is **not** committed to the repo. The premium print path uses a separate Real-ESRGAN ONNX model, also gitignored; if it is absent, print export still works for sources already at the target resolution.

---

## Running with Docker (Recommended)

This starts the database, backend, frontend, and the IOPaint background-removal service together:

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5257 |
| IOPaint | http://localhost:8080 |
| PostgreSQL | localhost:5432 |

To stop:

```bash
docker compose down
```

To reset the database volume:

```bash
docker compose down -v
```

---

## Backend Setup (Manual)

```bash
cd backend/MerchStoryAPI

# Restore NuGet packages
dotnet restore

# Apply database migrations (requires PostgreSQL running)
dotnet ef database update

# Run the API
dotnet run
```

The API will be available at `http://localhost:5257`. Migrations are also applied automatically on startup.

### Adding a New Migration

```bash
dotnet ef migrations add <MigrationName>
dotnet ef database update
```

---

## Frontend Setup (Manual)

```bash
cd frontend

# Install dependencies
npm install

# Start the Expo dev server
npm start
```

Then press:
- `a` to open on Android emulator
- `i` to open on iOS simulator
- `w` to open in web browser

Or scan the QR code with the **Expo Go** app on your phone.

---

## Linting & Formatting

### Frontend

```bash
cd frontend

# Run ESLint (check only)
npm run lint

# Auto-fix ESLint issues
npx expo lint --fix

# Run Prettier (check only)
npm run format:check

# Auto-fix with Prettier
npm run format
```

### Backend

```bash
# Check formatting (what CI runs)
dotnet format ./backend/MerchStoryAPI/MerchStoryAPI.csproj --verify-no-changes
dotnet format ./backend/MerchStoryImageGeneration/MerchStoryImageGeneration.csproj --verify-no-changes
dotnet format ./backend/MerchStory.Tests/MerchStory.Tests.csproj --verify-no-changes

# Auto-fix formatting
dotnet format ./backend/MerchStoryAPI/MerchStoryAPI.csproj
```

---

## Pre-commit Hooks

Husky runs lint-staged automatically on every commit. To set it up after cloning:

```bash
# From the repo root
npm install
```

This installs Husky and sets up the git hooks. On each commit:
- **Frontend:** `expo lint --fix` + Prettier run against staged `.ts`/`.tsx` files
- **Backend:** `dotnet format --verify-no-changes` runs on all three projects

---

## Running Tests

### Backend

```bash
cd backend
dotnet test
```

### Frontend

```bash
cd frontend
npm test
```

---

## CI/CD

GitHub Actions runs on every pull request to `main` / `master`:

- **Backend:** `dotnet format --verify-no-changes` + `dotnet test`
- **Frontend:** `npm run lint` + `npm run format:check` + `npm test`

Ensure your code passes locally before opening a PR.

---

## Key API Endpoint Groups

All non-auth routes require a `Bearer <jwt>` header.

| Group | Prefix | Purpose |
|-------|--------|---------|
| Auth | `/auth` | Register, log in, refresh tokens, change interface language |
| Shop | `/shop` | Read and update the shop profile and logo |
| Products | `/products` | Product CRUD, photo upload, one-tap background removal |
| Reference catalogue | `/reference-images` | Browse, search-by-photo (CLIP/pgvector), and bulk import |
| Image generation | `/generate-image` | Announcements, catalogs, and wallpapers (fully generative or hybrid) |
| Gallery | `/gallery` | Save, list, rename, and delete generated assets |
| Wallet | `/wallet` | Read the credit balance and ledger, grant credits (operator only) |
| Recommendations | `/recommendations` | Fetch today's ideas, request a refresh, leave feedback |
| Print | `/print` | Render a gallery item to a print-ready PDF |

---

## Cloud Deployment

The service runs on Microsoft Azure: Container Apps for the stateless API, Azure Database for PostgreSQL Flexible Server (with pgvector) for relational data and embeddings, Azure Blob Storage for binary assets, Azure Key Vault for secrets, and Application Insights / Azure Monitor for logs and traces. See [docs/thesis/](docs/thesis/) for the full architecture and deployment chapter.
