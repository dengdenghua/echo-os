"""Use the host Agent identity for native task projection and file evidence."""

from __future__ import annotations

from typing import Any

from fastapi import Request

from appliance.security import DEVELOPMENT_ACTOR, ApplianceAuthenticator, request_token


class NativeTaskAuthenticator(ApplianceAuthenticator):
    def __init__(self, context: Any) -> None:
        super().__init__(getattr(context, "jwt_secret", None))
        self._context = context

    @property
    def required(self) -> bool:
        return super().required or bool(getattr(self._context, "require_auth", False))

    def actor(self, request: Request) -> str | None:
        from runtime.safety.auth.principal import resolve_principal

        if not self.required and not request_token(request):
            return DEVELOPMENT_ACTOR
        # Share Agent's registered identities, API keys, issuer and audience.
        # A correctly signed but unregistered subject must not gain access.
        principal = resolve_principal(
            request,
            getattr(self._context, "identity_store", None),
            True,
            jwt_secret=getattr(self._context, "jwt_secret", None),
            jwt_issuer=getattr(self._context, "jwt_issuer", None),
            jwt_audience=getattr(self._context, "jwt_audience", None),
        )
        return principal.actor_id if principal is not None else None
