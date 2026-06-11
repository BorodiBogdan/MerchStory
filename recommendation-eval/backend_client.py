"""Thin client over the MerchStory API: admin login + the eval endpoint."""

import os
import requests


class BackendClient:
    def __init__(self, base_url: str, email: str, password: str, timeout: int = 180):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.timeout = timeout
        self._token: str | None = None

    def login(self) -> None:
        """POST /auth/login -> bearer token. Requires an admin account."""
        resp = requests.post(
            f"{self.base_url}/auth/login",
            json={"email": self.email, "password": self.password},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("isAdmin", False):
            raise RuntimeError(
                f"Account {self.email} is not an admin. The /recommendations/evaluate "
                "endpoint is AdminOnly. Promote the account (set IsAdmin) and retry."
            )
        self._token = data["token"]

    def evaluate(self, backend: str, model: str | None, shop: dict,
                 signals: list[dict], ideas_per_day: int) -> dict:
        """POST /recommendations/evaluate -> {backend, ideas:[...]}."""
        if self._token is None:
            self.login()

        body = {
            "backend": backend,
            "model": model,
            "ideasPerDay": ideas_per_day,
            "shop": shop,
            "signals": signals,
        }
        resp = requests.post(
            f"{self.base_url}/recommendations/evaluate",
            json=body,
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=self.timeout,
        )
        # Re-auth once on 401 (token may have expired mid-sweep).
        if resp.status_code == 401:
            self.login()
            resp = requests.post(
                f"{self.base_url}/recommendations/evaluate",
                json=body,
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=self.timeout,
            )
        if not resp.ok:
            # The eval endpoint puts the real failure (e.g. the LM Studio error)
            # in the response body; surface it instead of a bare status line.
            raise RuntimeError(
                f"{resp.status_code} {resp.reason} from /recommendations/evaluate: "
                f"{resp.text[:600]}")
        return resp.json()


def from_env() -> BackendClient:
    return BackendClient(
        base_url=os.environ.get("BACKEND_URL", "http://localhost:5257"),
        email=os.environ["ADMIN_EMAIL"],
        password=os.environ["ADMIN_PASSWORD"],
    )
