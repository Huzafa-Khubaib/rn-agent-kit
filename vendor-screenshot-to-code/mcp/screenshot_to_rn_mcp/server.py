from __future__ import annotations

import json
import os
from typing import Literal

from screenshot_to_rn_mcp.media import ensure_data_url, ensure_image_data_urls
from screenshot_to_rn_mcp.ws_client import default_ws_url, generate_via_websocket

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:  # mcp 2.x rename
    from mcp.server.mcpserver import MCPServer as FastMCP  # type: ignore

mcp = FastMCP(
    "screenshot-to-rn",
    instructions=(
        "Generate React Native / Expo TypeScript (App.tsx) from screenshots or "
        "screen recordings via the screenshot-to-code backend. "
        "Requires SCREENSHOT_TO_CODE_WS_URL (default ws://127.0.0.1:7001) "
        "with GEMINI_API_KEY (or OpenAI/Anthropic) on the backend."
    ),
)

StackArg = Literal["react_native", "expo"]


def _format_result(result: dict) -> str:
    """Return JSON so agents can parse code + metadata."""
    return json.dumps(
        {
            "path": result.get("path", "App.tsx"),
            "stack": result.get("stack"),
            "code": result.get("code", ""),
            "variant_count": len(result.get("variants") or {}),
            "errors": result.get("errors") or {},
            "status_tail": (result.get("status_log") or [])[-10:],
        },
        ensure_ascii=False,
    )


@mcp.tool()
async def ping_backend() -> str:
    """Check connectivity to the screenshot-to-code WebSocket backend."""
    try:
        import websockets
    except ImportError:
        return json.dumps(
            {
                "ok": False,
                "ws_url": default_ws_url(),
                "error": "websockets not installed",
                "hint": "pip install websockets mcp",
            }
        )

    url = f"{default_ws_url()}/generate-code"
    try:
        async with websockets.connect(url, open_timeout=5) as ws:
            await ws.close()
        return json.dumps({"ok": True, "ws_url": default_ws_url()})
    except Exception as exc:  # noqa: BLE001 — surface to agent
        return json.dumps(
            {
                "ok": False,
                "ws_url": default_ws_url(),
                "error": str(exc),
                "hint": "Start backend: poetry run uvicorn main:app --port 7001 (or set SCREENSHOT_TO_CODE_WS_URL)",
            }
        )


@mcp.tool()
async def screenshot_to_rn(
    stack: StackArg = "react_native",
    image_paths: list[str] | None = None,
    image_data_urls: list[str] | None = None,
    instructions: str = "",
    enable_image_generation: bool = True,
    enable_asset_extraction: bool = True,
    timeout_seconds: float = 600,
) -> str:
    """
    Convert one or more UI screenshots into React Native or Expo App.tsx.

    Pass local filesystem paths in image_paths and/or data URLs in image_data_urls.
    Prefer Gemini on the backend for best visual fidelity.
    For remote MCP hosts, prefer image_data_urls (paths are local to the client machine).
    """
    images = ensure_image_data_urls(paths=image_paths, data_urls=image_data_urls)
    result = await generate_via_websocket(
        stack=stack,
        input_mode="image",
        generation_type="create",
        text=instructions,
        images=images,
        is_image_generation_enabled=enable_image_generation,
        is_asset_extraction_enabled=enable_asset_extraction,
        timeout_s=timeout_seconds,
    )
    return _format_result(result)


@mcp.tool()
async def recording_to_rn(
    stack: StackArg = "react_native",
    video_path: str | None = None,
    video_data_url: str | None = None,
    instructions: str = "",
    timeout_seconds: float = 900,
) -> str:
    """
    Convert a short screen recording into a functional React Native / Expo App.tsx.

    Requires GEMINI_API_KEY on the backend (video mode). Keep recordings ~30s or under.
    Provide video_path or video_data_url (data URL preferred for remote MCP).
    """
    video = ensure_data_url(path=video_path, data_url=video_data_url)
    result = await generate_via_websocket(
        stack=stack,
        input_mode="video",
        generation_type="create",
        text=instructions,
        videos=[video],
        is_image_generation_enabled=True,
        is_asset_extraction_enabled=False,
        timeout_s=timeout_seconds,
    )
    return _format_result(result)


@mcp.tool()
async def refine_rn_ui(
    code: str,
    instructions: str,
    stack: StackArg = "react_native",
    image_paths: list[str] | None = None,
    image_data_urls: list[str] | None = None,
    timeout_seconds: float = 600,
) -> str:
    """
    Refine existing React Native / Expo App.tsx from feedback and optional reference screenshots.

    Pass the current App.tsx source as code, plus natural-language instructions
    (e.g. "match padding to screenshot", "make primary button full width").
    """
    if not code.strip():
        raise ValueError("code (current App.tsx) is required")
    if not instructions.strip():
        raise ValueError("instructions are required")

    images: list[str] = []
    if image_paths or image_data_urls:
        images = ensure_image_data_urls(paths=image_paths, data_urls=image_data_urls)

    result = await generate_via_websocket(
        stack=stack,
        input_mode="image" if images else "text",
        generation_type="update",
        text=instructions,
        images=images,
        history=[],
        file_state={"path": "App.tsx", "content": code},
        option_codes=[code],
        is_image_generation_enabled=True,
        is_asset_extraction_enabled=bool(images),
        timeout_s=timeout_seconds,
    )
    return _format_result(result)


def _transport_security():
    """DNS-rebinding settings for public hosts (Render, etc.)."""
    try:
        from mcp.server.transport_security import TransportSecuritySettings
    except ImportError:
        return None

    allowed = os.environ.get("MCP_ALLOWED_HOSTS", "*").strip()
    if allowed == "*" or not allowed:
        return TransportSecuritySettings(enable_dns_rebinding_protection=False)
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[h.strip() for h in allowed.split(",") if h.strip()],
    )


def _run_http(host: str, port: int) -> None:
    """Serve Streamable HTTP at /mcp with /health and optional Bearer API key."""
    import uvicorn
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse, Response
    from starlette.routing import Mount, Route

    api_key = (
        os.environ.get("MCP_API_KEY")
        or os.environ.get("SCREENSHOT_TO_RN_MCP_API_KEY")
        or ""
    ).strip()
    security = _transport_security()

    class ApiKeyMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            path = request.url.path.rstrip("/") or "/"
            if path in ("/health", "/healthz"):
                return await call_next(request)
            auth = request.headers.get("authorization", "")
            x_key = request.headers.get("x-api-key", "")
            if auth == f"Bearer {api_key}" or x_key == api_key:
                return await call_next(request)
            return JSONResponse({"error": "unauthorized"}, status_code=401)

    async def health(_request: Request) -> Response:
        return JSONResponse({"ok": True, "service": "screenshot-to-rn"})

    http_kwargs: dict = {
        "streamable_http_path": "/mcp",
        "stateless_http": True,
        "host": host,
    }
    if security is not None:
        http_kwargs["transport_security"] = security

    if not hasattr(mcp, "streamable_http_app"):
        # Older mcp: no app factory — run built-in HTTP (no API-key wrapper).
        run_kwargs: dict = {
            "transport": "streamable-http",
            "host": host,
            "port": port,
            "stateless_http": True,
        }
        if security is not None:
            run_kwargs["transport_security"] = security
        mcp.run(**run_kwargs)
        return

    mcp_app = mcp.streamable_http_app(**http_kwargs)
    middleware = [Middleware(ApiKeyMiddleware)] if api_key else []
    app = Starlette(
        routes=[
            Route("/health", health),
            Route("/healthz", health),
            Mount("/", app=mcp_app),
        ],
        middleware=middleware,
    )
    uvicorn.run(app, host=host, port=port)


def main() -> None:
    transport = os.environ.get("MCP_TRANSPORT", "stdio").strip().lower()
    if transport in ("", "stdio"):
        mcp.run()
        return

    if transport in ("streamable-http", "http", "sse"):
        host = os.environ.get("MCP_HOST", "0.0.0.0")
        port = int(os.environ.get("PORT") or os.environ.get("MCP_PORT", "8000"))
        if transport == "sse" and hasattr(mcp, "run"):
            # Legacy SSE if explicitly requested
            security = _transport_security()
            kwargs: dict = {"transport": "sse", "host": host, "port": port}
            if security is not None:
                kwargs["transport_security"] = security
            mcp.run(**kwargs)
            return
        _run_http(host, port)
        return

    raise SystemExit(
        f"Unknown MCP_TRANSPORT={transport!r}; use stdio | streamable-http | http"
    )


if __name__ == "__main__":
    main()
