# recommendation-eval

DeepEval harness for the recommendation engine's **writer** stage. It implements
the evaluation described in the thesis (`docs/thesis/chapters/chapter5.tex`, the
"LLM output evaluation with DeepEval" section): a frozen set of `(shop, day,
signal)` tuples is run head-to-head across the candidate writer models, and each
output is scored on schema, forbidden-phrase regression, and a DeepEval metric
battery.

It is a black-box client: it sends HTTP requests to the running backend and
scores whatever comes back. The only backend addition it needs is the admin-only
`POST /recommendations/evaluate` endpoint (no DB, no live context, no
persistence) that lets the harness pick the writer model per request and feed it
a fixed tuple.

## What it measures

For every model in [config.py](config.py) `MODELS`, for every tuple in
[reference_set.json](reference_set.json):

1. **Schema/format gate** (free, no LLM): every required field present and
   non-empty, `tone` and `type` within their enums.
2. **Forbidden-phrase regression** (free, regex): denylist of marketing-speak
   (EN + RO) the writer prompt is built to avoid, reported per 100 ideas.
3. **DeepEval battery** (judge = DeepSeek): Answer Relevancy, Faithfulness,
   Hallucination, plus two `GEval` rubrics, **Tone Match** and **Schema
   Compliance**.

Output: a per-model table (mean per axis, 0..100, plus schema pass-rate and
denylist rate) and `results/latest.json`.

## Models

From [config.py](config.py): ChatGPT, DeepSeek, Claude, and two Local (LM Studio)
Gemma rows (base + fine-tuned, matching the thesis). Set the two Gemma `model`
ids to your LM Studio model names, or comment those rows out if LM Studio isn't
running. The writer API keys live on the **backend** (user-secrets / Key Vault);
the harness never sees them.

## Setup

```bash
cd recommendation-eval
python -m venv .venv && . .venv/Scripts/activate    # Windows; use bin/activate on *nix
pip install -r requirements.txt
cp .env.example .env          # then fill it in
```

`.env` needs:
- `BACKEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the eval endpoint is
  AdminOnly, so the account must have `IsAdmin` set.
- `DEEPSEEK_API_KEY` — the DeepEval judge (and the DeepSeek writer row).

On the **backend**, set the writer keys you want to test (user-secrets):
`OpenAI:ApiKey` (ChatGPT), `Recommendations:Llm:DeepSeek:ApiKey`,
`Anthropic:ApiKey` (Claude). Start LM Studio for the Gemma rows.

## Run

```bash
# Cheap smoke first (1 model, 2 tuples) to confirm wiring:
python run_eval.py --models Claude --tuples 2

# Full sweep:
python run_eval.py
```

## Cost

20 tuples x 5 model rows = ~20 generation calls per model (within the intended
budget). With `IDEAS_PER_DAY=2` that is ~200 ideas; each idea is judged on 5
DeepEval metrics, so ~1000 DeepSeek judge calls plus the two free Python gates.
On DeepSeek/gpt-4o-mini pricing the whole run is well under a dollar; Local
Gemma generation is free.

Note on true call count: each `evaluate` request runs the real pipeline
internally (1 strategist + N writer + N translator sub-calls), so one tuple is a
handful of model calls, not one. The ~20 figure is HTTP requests per model.

## Limitation

The "day" axis of each tuple is the server's run date (the writer prompt reads
`DateTime.UtcNow`); per-tuple `signals` carry the temporal context instead. A
true date override was left out to keep the backend change small.
