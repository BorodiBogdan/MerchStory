# MerchStory: The Retail Growth Engine

## Overview
MerchStory is an AI-powered mobile app that turns raw product photos into professional, data-driven advertisements for small/local retailers. It automates the full creative-to-distribution pipeline: photo cleanup → AI-generated scene → contextual timing recommendation → one-touch social posting.

---

## Target Users
Small and independent retailers (e.g., craft beer shops, clothing boutiques, local restaurants) who lack marketing budgets or design expertise.

---

## Build Phases

### P0 — Core Value Loop (Build First)
**Goal:** Prove the app can turn a raw photo into a professional, data-driven ad.

- **Authentication:** Google or email login (simple and secure).
- **Context Engine v1:** Recommendation logic based on:
  - Weather (e.g., "It's raining → promote umbrellas / comfort food")
  - Local News/Events (e.g., "Local team won playoffs → promote celebratory drinks")
  - Holidays & Paydays (standard high-spend triggers)
- **Smart Object Studio:**
  - Background Removal: Upload a raw photo, instantly isolate the product
  - Visual Enhancement: AI upscaling + lighting correction (mobile → studio quality)
  - Generative Scene Placement: Drop isolated product into a generated scene (e.g., craft beer on a wooden table with sunset background)
- **Basic Asset Library:** Gallery for "Cleaned" products and "Generated" ads

---

### P1 — Distribution & Market Intel (Build Second)
**Goal:** Turn images into active sales tools; automate "When" and "Where."

- **Competitor Heatmaps:** Web-scraping / API monitoring of local competitor pricing/promos → suggest a "Counter-Promo"
- **One-Touch Social Posting:** Direct API integration with Facebook (Instagram under construction)
- **Promo Text Overlays:** Dynamic text (e.g., "Flash Sale: 20% OFF") + store logo over generated images
- **Dynamic Video Generation:** Turn static product shots into short cinematic video ads (e.g., 5-second rotating product clip using models like Veo)
- **Inventory Sync:** CSV upload so AI skips promos for sold-out products

---

### P2 — Scaling & Hyper-Automation (Build Third)
**Goal:** Close the ROI loop and add premium differentiators.

- **Performance Analytics:** Dashboard tracking clicks/likes per AI-generated image
- **AI Voiceovers:** Generate professional audio for video ads in the local dialect/accent (e.g., Lyria)
- **Print-to-QR:** Export digital catalogue as high-res PDF with trackable QR codes for physical storefronts
- **Smart Scheduler:** AI-managed calendar that picks the optimal posting time based on audience activity patterns
- **A/B Creative Testing:** Generate two ad variants, automatically scale the better-performing one

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | .NET (ASP.NET Core) + Microsoft Semantic Kernel |
| Frontend | React Native (Expo) |
| AI Orchestration | Semantic Kernel (multi-model routing, plugins, memory) |
| Image AI | Background removal API (e.g., Remove.bg), generative scene API (e.g., DALL-E, Stability AI) |
| Video AI | Veo or similar (P1) |
| Audio AI | Lyria or similar (P2) |
| Social APIs | Facebook Marketing API (P1), Instagram (under construction) |
| Auth | Google OAuth / Email (ASP.NET Identity or Auth0) |
| Storage | Azure Blob Storage or S3 (images/videos) |
| Database | PostgreSQL 18 + pgvector (Docker), via EF Core |

---

## Key Differentiators ("Secret Sauce")
1. **Competitor Heatmaps** — real-time local market intel to drive counter-promotions
2. **AI Voiceovers in local dialect** — hyper-local relevance for video ads
3. **Print-to-QR** — bridge digital and physical retail
