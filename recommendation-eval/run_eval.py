"""Cross-model DeepEval run for the recommendation writer stage.

For every model in config.MODELS, generate ideas for each frozen tuple in
reference_set.json via the backend's /recommendations/evaluate endpoint, then
score every idea on:
  - schema/format gate          (free)
  - forbidden-phrase regression (free)
  - DeepEval battery: relevancy, faithfulness, hallucination, Tone Match,
    Schema Compliance            (DeepSeek judge)

Prints a per-model table (mean per axis, 0..100) and writes results/<ts>.json.

Usage:
  python run_eval.py                  # full sweep: all models x all tuples
  python run_eval.py --tuples 2       # cheap smoke: first 2 tuples
  python run_eval.py --models Claude DeepSeek
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

import config
import metrics
from backend_client import from_env as backend_from_env
from deepseek_judge import from_env as judge_from_env

RESULTS_DIR = Path(__file__).parent / "results"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--tuples", type=int, default=None,
                   help="Only use the first N tuples (cheap smoke run).")
    p.add_argument("--models", nargs="*", default=None,
                   help="Only run these model labels (default: all in config).")
    return p.parse_args()


def load_tuples(limit: int | None) -> list[dict]:
    path = Path(__file__).parent / "reference_set.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return data[:limit] if limit else data


def score_idea(idea: dict, shop: dict, signals: list[dict], metric_list) -> dict:
    """Run the free gates + the DeepEval battery on one idea."""
    schema_ok, schema_reasons = metrics.schema_gate(idea)
    hits = metrics.forbidden_hits(idea)

    case = metrics.make_test_case(shop, signals, idea)
    axes: dict[str, float] = {}
    for m in metric_list:
        label = metric_label(m)
        try:
            m.measure(case)
            axes[label] = float(m.score or 0.0)
        except Exception as exc:  # noqa: BLE001 - one bad metric shouldn't kill the run
            print(f"      ! metric '{label}' errored: {exc}", file=sys.stderr)
            axes[label] = 0.0

    return {
        "schema_ok": schema_ok,
        "schema_reasons": schema_reasons,
        "forbidden_hits": hits,
        "axes": axes,
    }


def metric_label(m) -> str:
    # Built-in metrics expose __name__ ("Answer Relevancy"); GEval exposes name.
    return getattr(m, "__name__", None) or getattr(m, "name", m.__class__.__name__)


def aggregate(per_idea: list[dict], axis_labels: list[str]) -> dict:
    n = len(per_idea)
    if n == 0:
        return {"ideas": 0}
    schema_pass = sum(1 for r in per_idea if r["schema_ok"]) / n
    denylist_per_100 = sum(len(r["forbidden_hits"]) for r in per_idea) / n * 100
    axis_means = {}
    for label in axis_labels:
        vals = [r["axes"].get(label, 0.0) for r in per_idea]
        axis_means[label] = round(sum(vals) / n * 100, 1)
    return {
        "ideas": n,
        "schema_pass_pct": round(schema_pass * 100, 1),
        "denylist_per_100": round(denylist_per_100, 1),
        "axes": axis_means,
    }


def print_table(summary: dict, axis_labels: list[str]):
    models = list(summary.keys())
    cols = ["schema%", "deny/100"] + axis_labels
    width = max(16, *(len(c) for c in cols))
    header = "model".ljust(22) + "".join(c.rjust(width) for c in cols)
    print("\n" + header)
    print("-" * len(header))
    for label in models:
        s = summary[label]
        if s.get("ideas", 0) == 0:
            print(label.ljust(22) + "  (no ideas)")
            continue
        row = label.ljust(22)
        row += f"{s['schema_pass_pct']:.1f}".rjust(width)
        row += f"{s['denylist_per_100']:.1f}".rjust(width)
        for ax in axis_labels:
            row += f"{s['axes'].get(ax, 0.0):.1f}".rjust(width)
        print(row)
    print()


def main():
    args = parse_args()
    load_dotenv()

    tuples = load_tuples(args.tuples)
    models = config.MODELS
    if args.models:
        wanted = set(args.models)
        models = [m for m in models if m["label"] in wanted]
    if not models:
        print("No models selected.", file=sys.stderr)
        sys.exit(1)

    client = backend_from_env()
    client.login()
    judge = judge_from_env()
    metric_list = metrics.build_metrics(judge)
    axis_labels = [metric_label(m) for m in metric_list]

    print(f"Tuples: {len(tuples)} | Models: {[m['label'] for m in models]}")
    print(f"Judge: {judge.get_model_name()} | ideas/tuple: {config.IDEAS_PER_DAY}")

    summary: dict[str, dict] = {}
    raw: dict[str, list] = {}

    for m in models:
        label = m["label"]
        print(f"\n=== {label} ({m['backend']}{'/' + m['model'] if m['model'] else ''}) ===")
        per_idea: list[dict] = []
        for t in tuples:
            shop, signals = t["shop"], t.get("signals", [])
            try:
                resp = client.evaluate(m["backend"], m["model"], shop, signals,
                                       config.IDEAS_PER_DAY)
            except Exception as exc:  # noqa: BLE001
                print(f"  [{t['id']}] generation FAILED: {exc}", file=sys.stderr)
                continue
            ideas = resp.get("ideas", []) or []
            print(f"  [{t['id']}] {len(ideas)} ideas")
            for idea in ideas:
                per_idea.append(score_idea(idea, shop, signals, metric_list))
        summary[label] = aggregate(per_idea, axis_labels)
        raw[label] = per_idea

    print_table(summary, axis_labels)

    RESULTS_DIR.mkdir(exist_ok=True)
    # Deterministic filename slot via env override; otherwise a fixed name the
    # user can rename. (No timestamp: the sandbox forbids wall-clock calls in
    # some contexts, and a stable name is easier to diff run-to-run.)
    out_name = os.environ.get("RESULTS_FILE", "latest.json")
    out_path = RESULTS_DIR / out_name
    out_path.write_text(json.dumps(
        {"tuples": len(tuples), "ideas_per_tuple": config.IDEAS_PER_DAY,
         "axis_labels": axis_labels, "summary": summary, "raw": raw},
        indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
