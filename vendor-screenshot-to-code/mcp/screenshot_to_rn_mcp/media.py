from __future__ import annotations

import base64
import mimetypes
from pathlib import Path


_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif"}
_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}


def path_to_data_url(path: str | Path) -> str:
    """Read a local file and return a data URL."""
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {p}")

    mime, _ = mimetypes.guess_type(str(p))
    suffix = p.suffix.lower()
    if not mime:
        if suffix in _IMAGE_EXTS:
            mime = "image/png" if suffix == ".png" else "image/jpeg"
        elif suffix in _VIDEO_EXTS:
            mime = "video/mp4" if suffix == ".mp4" else "video/webm"
        else:
            mime = "application/octet-stream"

    encoded = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def ensure_data_url(*, path: str | None = None, data_url: str | None = None) -> str:
    """Prefer an existing data URL; otherwise load from path."""
    if data_url and data_url.strip().startswith("data:"):
        return data_url.strip()
    if path:
        return path_to_data_url(path)
    raise ValueError("Provide path or data_url")


def ensure_image_data_urls(
    *,
    paths: list[str] | None = None,
    data_urls: list[str] | None = None,
) -> list[str]:
    urls: list[str] = []
    if data_urls:
        for u in data_urls:
            if not u.strip().startswith("data:"):
                raise ValueError("data_urls entries must start with data:")
            urls.append(u.strip())
    if paths:
        for p in paths:
            urls.append(path_to_data_url(p))
    if not urls:
        raise ValueError("Provide at least one image path or data_url")
    return urls
