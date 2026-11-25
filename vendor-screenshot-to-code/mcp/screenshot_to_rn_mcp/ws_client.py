from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Literal

StackName = Literal["react_native", "expo"]
InputMode = Literal["image", "video", "text"]
GenerationType = Literal["create", "update"]


def default_ws_url() -> str:
    return os.environ.get(
        "SCREENSHOT_TO_CODE_WS_URL",
        "ws://127.0.0.1:7001",
    ).rstrip("/")


def _api_keys_from_env() -> dict[str, str | None]:
    return {
        "openAiApiKey": os.environ.get("OPENAI_API_KEY"),
        "anthropicApiKey": os.environ.get("ANTHROPIC_API_KEY"),
        "geminiApiKey": os.environ.get("GEMINI_API_KEY"),
        "replicateApiKey": os.environ.get("REPLICATE_API_KEY"),
        "openAiBaseURL": os.environ.get("OPENAI_BASE_URL"),
    }


async def generate_via_websocket(
    *,
    stack: StackName,
    input_mode: InputMode,
    generation_type: GenerationType = "create",
    text: str = "",
    images: list[str] | None = None,
    videos: list[str] | None = None,
    history: list[dict[str, Any]] | None = None,
    file_state: dict[str, str] | None = None,
    option_codes: list[str] | None = None,
    is_image_generation_enabled: bool = True,
    is_asset_extraction_enabled: bool = True,
    timeout_s: float = 600.0,
    ws_url: str | None = None,
) -> dict[str, Any]:
    """
    Drive `/generate-code` and return the best completed variant.

    Returns:
      {
        "code": str,
        "variants": {index: code},
        "errors": {index: message},
        "status_log": [str],
      }
    """
    base = ws_url or default_ws_url()
    url = f"{base}/generate-code"

    keys = _api_keys_from_env()
    payload: dict[str, Any] = {
        "generatedCodeConfig": stack,
        "inputMode": input_mode,
        "generationType": generation_type,
        "isImageGenerationEnabled": is_image_generation_enabled,
        "isAssetExtractionEnabled": is_asset_extraction_enabled
        and input_mode == "image",
        "prompt": {
            "text": text or "",
            "images": images or [],
            "videos": videos or [],
        },
        "history": history or [],
        "optionCodes": option_codes or [],
        # Settings fields expected by FullGenerationSettings (nulls OK; backend .env wins)
        "openAiApiKey": keys["openAiApiKey"],
        "openAiBaseURL": keys["openAiBaseURL"],
        "anthropicApiKey": keys["anthropicApiKey"],
        "geminiApiKey": keys["geminiApiKey"],
        "replicateApiKey": keys["replicateApiKey"],
        "screenshotOneApiKey": None,
        "editorTheme": "cobalt",
        "codeGenerationModel": "gemini",
        "selectedDesignSystemId": None,
        "isTermOfServiceAccepted": True,
    }
    if file_state and file_state.get("content"):
        payload["fileState"] = {
            "path": file_state.get("path") or "App.tsx",
            "content": file_state["content"],
        }

    variants: dict[int, str] = {}
    errors: dict[int, str] = {}
    status_log: list[str] = []
    global_error: str | None = None

    try:
        import websockets
        from websockets.exceptions import ConnectionClosed
    except ImportError as exc:
        raise ImportError(
            "Missing dependency 'websockets'. Install with: pip install websockets mcp"
        ) from exc

    async def _run() -> None:
        nonlocal global_error
        async with websockets.connect(
            url,
            max_size=64 * 1024 * 1024,
            open_timeout=30,
            ping_interval=20,
            ping_timeout=60,
        ) as ws:
            await ws.send(json.dumps(payload))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                mtype = msg.get("type")
                idx = int(msg.get("variantIndex") or 0)
                value = msg.get("value") or ""

                if mtype == "status" and value:
                    status_log.append(f"[{idx}] {value}")
                elif mtype == "setCode" and value:
                    variants[idx] = value
                elif mtype == "variantComplete":
                    status_log.append(f"[{idx}] complete")
                elif mtype == "variantError":
                    errors[idx] = value or "variant error"
                    status_log.append(f"[{idx}] error: {errors[idx]}")
                elif mtype == "error":
                    global_error = value or "generation error"
                    status_log.append(f"error: {global_error}")

    try:
        await asyncio.wait_for(_run(), timeout=timeout_s)
    except asyncio.TimeoutError as exc:
        raise TimeoutError(
            f"Generation timed out after {timeout_s:.0f}s. "
            "Is the screenshot-to-code backend running and do you have GEMINI_API_KEY set?"
        ) from exc
    except ConnectionRefusedError as exc:
        raise ConnectionError(
            f"Cannot connect to {url}. Start the backend first "
            "(poetry run uvicorn main:app --reload --port 7001)."
        ) from exc
    except OSError as exc:
        # websockets may wrap connection refused
        raise ConnectionError(
            f"Cannot connect to {url}: {exc}. Start the backend on port 7001."
        ) from exc
    except ConnectionClosed as exc:
        if not variants:
            raise ConnectionError(
                f"WebSocket closed before code was produced: {exc}"
            ) from exc

    if not variants:
        detail = global_error or (next(iter(errors.values())) if errors else None)
        raise RuntimeError(
            detail
            or "No code variants returned. Check backend logs and API keys (Gemini recommended)."
        )

    # Prefer variant 0, else first available
    code = variants.get(0) or next(iter(variants.values()))
    return {
        "code": code,
        "variants": {str(k): v for k, v in sorted(variants.items())},
        "errors": {str(k): v for k, v in sorted(errors.items())},
        "status_log": status_log[-40:],
        "stack": stack,
        "path": "App.tsx",
    }
