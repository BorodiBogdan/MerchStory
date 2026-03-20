# MerchStory

Turn raw product photos into professional AI-generated ads for small and local retailers.

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
│   ├── SemanticKernelBackend/        # ASP.NET Core minimal API
│   └── SemanticKernelBackend.Tests/  # xUnit test project
├── frontend/                         # React Native (Expo) app
├── docs/
│   └── project-description.md        # Full product spec
├── docker-compose.yml
└── .env.example                       # Environment variable template
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

For **local backend development** (without Docker), configure `backend/SemanticKernelBackend/appsettings.Development.json`:

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
  }
}
```

> Never commit real secrets. `appsettings.Development.json` is gitignored for this reason.

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
cd backend/SemanticKernelBackend

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

# Run Prettier (check only)
npm run format:check

# Auto-fix with Prettier
npm run format
```

### Backend

```bash
cd backend

# Check formatting (what CI runs)
dotnet format --verify-no-changes SemanticKernelBackend/SemanticKernelBackend.csproj
dotnet format --verify-no-changes SemanticKernelBackend.Tests/SemanticKernelBackend.Tests.csproj

# Auto-fix formatting
dotnet format SemanticKernelBackend/SemanticKernelBackend.csproj
```

---

## Pre-commit Hooks

Husky runs lint-staged automatically on every commit. To set it up after cloning:

```bash
# From the repo root
npm install
```

This installs Husky and sets up the git hooks. On each commit, ESLint and Prettier will run against staged frontend files.

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

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login, returns JWT |
| `POST` | `/api/generate-image` | Generate AI image (requires auth) |

---

## Docs

See [docs/project-description.md](docs/project-description.md) for the full product spec and feature roadmap (P0 → P1 → P2).
