"""The three checks from chapter5.tex's DeepEval section.

1. Schema/format gate     -> pure Python, free
2. Forbidden-phrase regr. -> pure Python, free
3. DeepEval metric battery -> judge-scored (relevancy, faithfulness,
   hallucination + two GEval rubrics)
"""

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    GEval,
)
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

import config


# ---------------------------------------------------------------------------
# Free gates (no LLM)
# ---------------------------------------------------------------------------

def schema_gate(idea: dict) -> tuple[bool, list[str]]:
    """Every required field present + non-empty, and tone/type within enums."""
    reasons: list[str] = []
    for field in config.REQUIRED_IDEA_FIELDS:
        val = idea.get(field)
        if val is None or (isinstance(val, str) and not val.strip()):
            reasons.append(f"missing/empty field '{field}'")

    tone = (idea.get("tone") or "").lower()
    if tone and tone not in config.VALID_TONES:
        reasons.append(f"tone '{tone}' not in {sorted(config.VALID_TONES)}")

    itype = (idea.get("type") or "").lower()
    if itype and itype not in config.VALID_TYPES:
        reasons.append(f"type '{itype}' not in {sorted(config.VALID_TYPES)}")

    return (len(reasons) == 0, reasons)


def forbidden_hits(idea: dict) -> list[str]:
    """Denylist phrases found in title + body + suggestedPost (case-insensitive)."""
    haystack = " ".join([
        idea.get("title", ""),
        idea.get("body", ""),
        idea.get("suggestedPost", ""),
    ]).lower()
    return [p for p in config.FORBIDDEN_PHRASES if p.lower() in haystack]


# ---------------------------------------------------------------------------
# Test-case construction
# ---------------------------------------------------------------------------

def render_input(shop: dict, signals: list[dict]) -> str:
    lines = [
        f"Shop: {shop.get('brandName')} ({shop.get('businessDomain')})",
        f"Location: {shop.get('city', 'unspecified')}, {shop.get('countryCode')}",
        f"Audience: {shop.get('targetAudience', 'general')}",
        f"Language: {shop.get('generationLanguage', 'EN')}",
        "Today's signals:",
    ]
    if signals:
        for s in signals:
            lines.append(f"  [{s.get('severity', 'medium')}] {s.get('source')}: "
                         f"{s.get('title')} - {s.get('summary')}")
    else:
        lines.append("  (none)")
    return "\n".join(lines)


def build_context(shop: dict, signals: list[dict]) -> list[str]:
    """Grounding facts the idea must stay faithful to (shop + signal lines)."""
    ctx = [
        f"The shop is {shop.get('brandName')}, a {shop.get('businessDomain')} "
        f"in {shop.get('city', 'an unspecified city')}, {shop.get('countryCode')}.",
        f"It sells only what a {shop.get('businessDomain')} would stock.",
    ]
    for s in signals:
        ctx.append(f"{s.get('source')} signal: {s.get('title')} - {s.get('summary')}")
    return ctx


def render_output(idea: dict) -> str:
    return (
        f"title: {idea.get('title')}\n"
        f"meta: {idea.get('meta')}\n"
        f"body: {idea.get('body')}\n"
        f"suggestedPost: {idea.get('suggestedPost')}"
    )


def make_test_case(shop: dict, signals: list[dict], idea: dict) -> LLMTestCase:
    return LLMTestCase(
        input=render_input(shop, signals),
        actual_output=render_output(idea),
        retrieval_context=build_context(shop, signals),  # Faithfulness
        context=build_context(shop, signals),            # Hallucination
    )


# ---------------------------------------------------------------------------
# DeepEval metric battery
# ---------------------------------------------------------------------------

def build_metrics(judge) -> list:
    threshold = config.METRIC_THRESHOLD
    return [
        AnswerRelevancyMetric(threshold=threshold, model=judge, async_mode=False),
        FaithfulnessMetric(threshold=threshold, model=judge, async_mode=False),
        HallucinationMetric(threshold=threshold, model=judge, async_mode=False),
        GEval(
            name="Tone Match",
            criteria=(
                "Judge whether the output reads like a real small-shop owner advising "
                "themselves: plain, casual, specific. Penalise marketing-speak, slogans, "
                "title-case, emojis, and any em dash. The idea card (title/meta/body) is "
                "ADVICE to the owner, not an ad; only suggestedPost speaks to customers. "
                "Higher score = more authentic shop-owner voice."
            ),
            evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
            model=judge,
            threshold=threshold,
            async_mode=False,
        ),
        GEval(
            name="Schema Compliance",
            criteria=(
                "Judge whether the output is a complete, well-formed promo idea: a clear "
                "title, factual meta, a body that explains why-now and how-to-run-it, and a "
                "short suggestedPost a shop owner would actually type. Penalise empty, "
                "truncated, or mislabelled fields. Higher score = cleaner, more complete idea."
            ),
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
            model=judge,
            threshold=threshold,
            async_mode=False,
        ),
    ]
