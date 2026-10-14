"""Desktop asset optimizer: favicon.

The default wallpaper is generated at display sizes by
scripts/generate-echo-wallpaper.mjs, so it needs no optimisation pass here.

The case-study JPEGs that used to live under public/images were removed (git
history keeps them): all six were byte-corrupted in the repository -- JPEG
headers rewritten as U+FFFD sequences -- so the landing page now renders
text-only cards. The integrity check below is retained as a guard so a newly
committed file that is not really a JPEG gets reported instead of shipping
silently.
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent


def human(n: float) -> str:
    return f"{n / 1048576:.2f} MB"


def report_corruption() -> None:
    """Guard against shipping non-JPEG payloads under public/images."""
    candidates = sorted((ROOT / "public" / "images").glob("*.jpg"))
    if not candidates:
        print("== public/images: no JPEG assets (corrupted set removed) ==")
        return
    print("== public/images JPEG integrity ==")
    for path in candidates:
        data = path.read_bytes()
        marker = data.count(b"\xef\xbf\xbd")
        try:
            Image.open(path).load()
            state = "readable"
        except Exception:
            state = "not decodable"
        print(f"  {path.name}: {len(data) / 1024:.0f} KB, U+FFFD x{marker}, {state}")


def optimize_favicon() -> None:
    src = ROOT / "public" / "favicon.ico"
    before = src.stat().st_size
    with Image.open(src) as im:
        frames = {size: im.copy() for size in [(16, 16), (32, 32), (48, 48)]}
    large = frames[(48, 48)].resize((256, 256), Image.LANCZOS)
    tmp = src.with_suffix(".ico.tmp")
    frames[(16, 16)].save(
        tmp,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (256, 256)],
        append_images=[frames[(32, 32)], frames[(48, 48)], large],
    )
    after = tmp.stat().st_size
    if after < before:
        tmp.replace(src)
    else:
        tmp.unlink()
    print(f"== favicon ==\n  favicon.ico: {human(before)} -> {human(src.stat().st_size)}")


def main() -> int:
    report_corruption()
    optimize_favicon()
    return 0


if __name__ == "__main__":
    sys.exit(main())
