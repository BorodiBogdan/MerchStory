"""Static configuration for the DeepEval cross-model evaluation harness.

Edit MODELS to pick which writer backends to evaluate. The two Gemma rows both
use the "Local" backend (LM Studio) with different model ids, matching the
thesis's base-vs-fine-tuned comparison. Comment out any row you can't run
(for example the Gemma rows if LM Studio isn't loaded).
"""

# Each row is one column in the final table. `backend` and `model` map straight
# onto the POST /recommendations/evaluate request body; `label` is display-only.
MODELS = [
    {"label": "ChatGPT", "backend": "ChatGPT", "model": None},          # gpt-4o-mini (backend default)
    {"label": "DeepSeek", "backend": "DeepSeek", "model": None},        # deepseek-chat (backend default)
    {"label": "Claude", "backend": "Claude", "model": None},            # claude-haiku-4-5 (backend default)
    {"label": "Gemma 3 4B", "backend": "Local", "model": "gemma-3-4b"},          # <- set to your LM Studio id
    {"label": "Gemma 3 4B (FT)", "backend": "Local", "model": "gemma-3-4b-ft"},  # <- set to your LM Studio id
]

# Ideas generated per tuple. Kept low (the eval endpoint also defaults to 2) so
# the writer/translator sub-calls and the judge cost stay small.
IDEAS_PER_DAY = 2

# DeepEval pass/fail threshold applied to every metric (0..1).
METRIC_THRESHOLD = 0.5

# --- Schema gate (free, no LLM) ---
REQUIRED_IDEA_FIELDS = ["id", "tone", "title", "meta", "body", "suggestedPost", "type"]
VALID_TONES = {"weather", "holiday", "news", "trend"}
VALID_TYPES = {"announcement", "promotion"}

# --- Forbidden-phrase regression (free, no LLM) ---
# The boilerplate the writer/translator prompts are built to discourage. Matched
# case-insensitively over title + body + suggestedPost. Mirrors the denylist
# baked into LlmRecommendationProvider's prompts (EN + RO marketing-speak).
FORBIDDEN_PHRASES = [
    # English
    "discover our premium selection",
    "don't miss out",
    "dont miss out",
    "unlock",
    "curated",
    "premium",
    "authentic",
    "elevate",
    "embrace",
    "experience the",
    # Romanian
    "descoperă",
    "descopera",
    "bucură-te",
    "bucura-te",
    "experiență unică",
    "experienta unica",
    "exclusiv",
    "redescoperă",
    "savurează",
    "momente de neuitat",
    "nu rata",
]
