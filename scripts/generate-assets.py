from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "apps" / "frontend" / "public" / "assets"
COVERS = ASSET_ROOT / "covers"
ICONS = ASSET_ROOT / "icons"


PALETTES = {
    "afterglow-loop.png": ((21, 39, 52), (30, 215, 96), (255, 180, 84)),
    "blue-hour-signal.png": ((13, 28, 49), (88, 166, 255), (139, 233, 201)),
    "velvet-static.png": ((35, 20, 30), (255, 107, 138), (126, 87, 194)),
    "glass-coast.png": ((10, 24, 29), (139, 233, 201), (245, 245, 245)),
    "low-orbit.png": ((15, 18, 30), (122, 162, 255), (30, 215, 96)),
    "sunday-frequency.png": ((31, 24, 17), (255, 180, 84), (255, 231, 180)),
}


def lerp(left: int, right: int, amount: float) -> int:
    return int(left + (right - left) * amount)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(lerp(a[i], b[i], amount) for i in range(3))


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, rows: list[bytes]) -> None:
    raw = b"".join(b"\x00" + row for row in rows)
    payload = b"\x89PNG\r\n\x1a\n"
    payload += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    payload += png_chunk(b"IDAT", zlib.compress(raw, 9))
    payload += png_chunk(b"IEND", b"")
    path.write_bytes(payload)


def make_cover(path: Path, base: tuple[int, int, int], accent: tuple[int, int, int], light: tuple[int, int, int]) -> None:
    size = 512
    rows: list[bytes] = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            nx = x / (size - 1)
            ny = y / (size - 1)
            color = mix(base, accent, 0.18 + 0.48 * nx)
            wave = (math.sin((x * 0.035) + (y * 0.018)) + 1) / 2
            color = mix(color, light, 0.12 * wave)
            cx, cy = size * 0.68, size * 0.36
            distance = math.hypot(x - cx, y - cy) / size
            if distance < 0.24:
                color = mix(color, light, (0.24 - distance) * 1.65)
            band = abs(y - (size * 0.68 + math.sin(x * 0.035) * 20))
            if band < 9:
                color = mix(color, accent, 0.65)
            if 118 < x < 392 and 120 < y < 392:
                ring = abs(math.hypot(x - size / 2, y - size / 2) - 122)
                if ring < 5:
                    color = mix(color, light, 0.7)
            row.extend(color)
        rows.append(bytes(row))
    write_png(path, size, size, rows)


def make_icon(path: Path, size: int) -> None:
    rows: list[bytes] = []
    base = (11, 15, 20)
    green = (30, 215, 96)
    blue = (88, 166, 255)
    for y in range(size):
        row = bytearray()
        for x in range(size):
            nx = x / (size - 1)
            ny = y / (size - 1)
            color = mix(base, blue, 0.18 * nx)
            distance = math.hypot(x - size / 2, y - size / 2) / size
            if distance < 0.34:
                color = mix(color, green, 0.82)
            stem = size * 0.47 < x < size * 0.55 and size * 0.25 < y < size * 0.62
            head = math.hypot(x - size * 0.61, y - size * 0.27) < size * 0.09
            dot = math.hypot(x - size * 0.41, y - size * 0.68) < size * 0.09
            if stem or head or dot:
                color = (6, 17, 9)
            row.extend(color)
        rows.append(bytes(row))
    write_png(path, size, size, rows)


def main() -> None:
    COVERS.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    for filename, palette in PALETTES.items():
        make_cover(COVERS / filename, *palette)
    make_icon(ICONS / "vibe-icon-192.png", 192)
    make_icon(ICONS / "vibe-icon-512.png", 512)
    print(f"Generated assets in {ASSET_ROOT}")


if __name__ == "__main__":
    main()
