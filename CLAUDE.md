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
│   ├── semantic-kernel-backend/        # ASP.NET Core Web API
│   └── semantic-kernel-backend.Tests/  # xUnit test project
├── frontend/                           # React Native (Expo) app
├── docs/
│   └── project-description.md         # Full product spec
└── docker-compose.yml
```

---

## Tech Stack

### Backend
- **Runtime:** .NET (ASP.NET Core minimal API or controller-based)
- **AI Orchestration:** Microsoft Semantic Kernel — used for multi-model routing, prompt management, plugin system, and memory/RAG
- **ORM:** Entity Framework Core (preferred)
- **Auth:** ASP.NET Identity or Auth0 / Azure AD B2C
- **Storage:** Azure Blob Storage (images, videos, generated assets)
- **Database:** PostgreSQL 18 (Docker container) + pgvector — pgvector used for Semantic Kernel memory / vector store

### Frontend
- **Framework:** React Native via Expo
- **Language:** TypeScript
- **Navigation:** Expo Router (file-based routing under `app/`)

### Infrastructure
- Docker Compose for local dev (see `docker-compose.yml`)
- CI/CD pipeline configured (see `.github/workflows/` or equivalent)

---

## Coding Conventions

### Backend (.NET)
- Minimal API style in `Program.cs`; group related endpoints into extension methods or route groups as the API grows
- Semantic Kernel plugins go in a `Plugins/` folder under the backend project
- Use `ILogger<T>` for logging; no `Console.WriteLine` in production code
- All AI-related configuration (model names, API keys) goes in `appsettings.json` / environment variables — never hardcoded
- Test project mirrors backend structure; use xUnit + Moq

### Frontend (React Native / Expo)
- TypeScript strict mode
- Components in `components/`, screens in `app/` (Expo Router)
- No inline styles — use StyleSheet or a styling library
- API calls go through a centralized `utils/api.ts` client

---

## AI Integration Notes (Semantic Kernel)
- Semantic Kernel is the single orchestration layer — all LLM calls route through it
- Use SK Plugins to wrap third-party APIs (weather, news, image generation, social posting)
- Use SK Memory / Vector Store for storing user asset metadata and retrieval
- Model routing: default to GPT-4o for reasoning tasks; swap to cheaper models for simple classification/tagging
- Prompt templates go in `Plugins/<PluginName>/skprompt.txt` following SK conventions

---

## Build Phase Priority
Always respect the P0 → P1 → P2 order from the product spec. Do not implement P1/P2 features before P0 is solid.

**P0 (current focus):**
- Auth
- Context Engine (weather, events, holidays)
- Smart Object Studio (background removal, upscaling, scene generation)
- Basic asset library

---

## Important Constraints
- Keep AI API keys out of source control — use `.env` or user-secrets
- Image/video assets are stored externally (blob storage), not in the repo
- The app targets small retailers — UX must be simple; avoid jargon in UI copy
- Mobile-first: all UI decisions should be validated against small screens first
