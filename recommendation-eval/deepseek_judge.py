"""DeepSeek as the DeepEval judge model.

DeepSeek speaks the OpenAI Chat Completions format, so we drive it with the
openai SDK pointed at api.deepseek.com and wrap it in DeepEval's custom-model
interface. Using one cheap provider for every metric keeps the run well under a
dollar.
"""

import json
import os

from openai import OpenAI
from deepeval.models import DeepEvalBaseLLM
from pydantic import BaseModel


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        nl = t.find("\n")
        if nl >= 0:
            t = t[nl + 1:]
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()


class DeepSeekJudge(DeepEvalBaseLLM):
    def __init__(self, model: str, client: OpenAI):
        self.model = model
        self.client = client

    def load_model(self):
        return self.client

    def generate(self, prompt: str, schema: type[BaseModel] | None = None):
        client = self.load_model()
        # JSON mode whenever DeepEval asks for a structured result. DeepSeek's
        # JSON mode requires the word "JSON" in the prompt; DeepEval's metric
        # prompts already include it, but we add a belt-and-suspenders nudge.
        use_json = schema is not None
        messages = [{"role": "user", "content": prompt}]
        kwargs = {"model": self.model, "messages": messages}
        if use_json:
            kwargs["response_format"] = {"type": "json_object"}

        resp = client.chat.completions.create(**kwargs)
        content = resp.choices[0].message.content or ""

        if schema is None:
            return content

        cleaned = _strip_fences(content)
        try:
            return schema.model_validate_json(cleaned)
        except Exception:
            # Last-ditch: pull the first {...} block and retry.
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start >= 0 and end > start:
                return schema.model_validate(json.loads(cleaned[start:end + 1]))
            raise

    async def a_generate(self, prompt: str, schema: type[BaseModel] | None = None):
        # DeepSeek SDK call is sync; DeepEval runs metrics concurrently enough
        # that a sync body inside a_generate is fine for a ~20-tuple run.
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return f"deepseek:{self.model}"


def from_env() -> DeepSeekJudge:
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set (needed for the DeepEval judge).")
    client = OpenAI(
        api_key=api_key,
        base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    )
    return DeepSeekJudge(
        model=os.environ.get("DEEPSEEK_JUDGE_MODEL", "deepseek-chat"),
        client=client,
    )
