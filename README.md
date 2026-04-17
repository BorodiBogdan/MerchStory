# MerchStory

Turn raw product photos into professional AI-generated ads, catalogs, and wallpapers for small and local retailers — with one-tap publishing to Facebook.

## Features

- **Auth** — email/password, JWT + refresh tokens, admin accounts
- **Shop onboarding** — 3-step setup flow (brand colors, logo, contact)
- **Products** — CRUD, photo upload, search-by-photo via CLIP embeddings (pgvector)
- **AI image generation** — announcements, catalogs (with text overlay via `CatalogCompositor`), and wallpapers, powered by Google Gemini
- **Gallery** — browse and reuse every generated asset
- **Social publishing** — Facebook OAuth + page posting, with a cached post history
- **Admin** — professional product-import flow for curated catalogs

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
│   ├── MerchStoryAPI/                # ASP.NET Core minimal API
│   │   ├── Auth/                     # JWT + refresh tokens
│   │   ├── Data/                     # EF Core DbContext (pgvector enabled)
│   │   ├── Models/                   # AppUser, RefreshToken, ShopProfile, Product,
│   │   │                             #   GeneratedImage, ReferenceImage, SocialPost
│   │   ├── Migrations/
│   │   ├── Shop/                     # Shop profile endpoints
│   │   ├── Products/                 # Product CRUD
│   │   ├── Gallery/                  # Generated-asset library
│   │   ├── ImageGeneration/          # Generation endpoints + CatalogCompositor
│   │   ├── ReferenceImages/          # CLIP embedding + vector search
│   │   ├── Facebook/                 # Facebook OAuth + publishing
│   │   └── Social/                   # Social post cache & sync
│   ├── MerchStoryImageGeneration/    # Announcement / Catalog / Wallpaper services
│   │   ├── Services/                 # GeminiImageProvider, MockImageProvider, ...
│   │   ├── Models/                   # Request DTOs + BrandContext
│   │   └── Extensions/
│   └── MerchStory.Tests/             # xUnit integration tests
├── frontend/                         # React Native (Expo) app
│   ├── app/
│   │   ├── (auth)/                   # Login & register
│   │   ├── (setup)/                  # 3-step shop onboarding
│   │   └── (tabs)/                   # index, products, gallery, wallpapers, analytics, profile
│   ├── components/ui/                # Reusable UI components
│   ├── context/                      # Auth, theme, shop, setup
│   ├── utils/                        # API client
│   └── constants/                    # Design tokens & theme
├── docs/
│   └── project-description.md        # Full product spec
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
  "Facebook": {
    "AppId": "your_facebook_app_id",
    "AppSecret": "your_facebook_app_secret"
  },
  "Clip": {
    "ModelPath": "./models/clip_vision_model.onnx"
  }
}
```

> Never commit real secrets. `appsettings.Development.json` is gitignored for this reason.

---

## CLIP Model (Search-by-Photo)

The "find similar products from a photo" feature runs OpenAI's **CLIP ViT-B/32** vision model **locally** via ONNX Runtime — no external API calls, no per-request cost. Embeddings (512-dim) are stored in PostgreSQL using `pgvector` for similarity search.

You must download the model file before the backend can start:

1. Download `clip_vision_model.onnx` from the Qdrant mirror on Hugging Face:
   https://huggingface.co/Qdrant/clip-ViT-B-32-vision
2. Place it somewhere the backend can read, e.g. `backend/MerchStoryAPI/models/clip_vision_model.onnx`.
3. Point the `Clip:ModelPath` setting at it (see the `appsettings.Development.json` example above), or set the env var `Clip__ModelPath=/path/to/clip_vision_model.onnx`.

For Docker, mount the model into the backend container and set `Clip__ModelPath` to the in-container path (the compose file already expects this).

The model is ~350 MB. It is **not** committed to the repo.

---

## Running with Docker (Recommended)

This starts the database, backend, and frontend together:

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5257 |
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

The API will be available at `http://localhost:5257`.

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
- `a` — open on Android emulator
- `i` — open on iOS simulator
- `w` — open in web browser

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

| Group | Purpose |
|-------|---------|
| `/auth/*` | Register, login, refresh token |
| `/shop/*` | Shop profile — brand colors, logo, contact info |
| `/products/*` | Product CRUD and photo upload |
| `/reference-images/*` | CLIP-based search-by-photo (pgvector) |
| `/gallery/*` | User's generated-asset library |
| `/image-generation/*` | Announcement / catalog / wallpaper generation (Gemini) |
| `/facebook/*` | Facebook OAuth + page publishing |
| `/social/*` | Cached social-post feed |

---

## Docs

See [docs/project-description.md](docs/project-description.md) for the full product spec and feature roadmap (P0 → P1 → P2).
