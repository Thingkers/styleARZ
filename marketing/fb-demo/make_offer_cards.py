#!/usr/bin/env python3
"""Generate offer message cards (EN-neutral visuals; captions carry EN/BN)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "graphics"
SIZE = 1080
BG = (18, 18, 18)
ORANGE = (255, 106, 0)
WHITE = (255, 255, 255)
MUTED = (190, 190, 190)


def font(size: int, bold: bool = True):
    paths = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def card(lines: list[tuple[str, tuple[int, int, int], int]], path: Path, accent_bar: bool = True):
    img = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)
    # soft corner glow
    for r in range(280, 0, -20):
        a = int(18 * (1 - r / 280))
        draw.ellipse((SIZE - 420 - r, -120 - r, SIZE + 80 + r, 360 + r), fill=(ORANGE[0] // 8 + a, ORANGE[1] // 16, 0))

    y = 220
    for text, color, size in lines:
        f = font(size, bold=size >= 42)
        bb = draw.textbbox((0, 0), text, font=f)
        tw = bb[2] - bb[0]
        draw.text(((SIZE - tw) / 2, y), text, fill=color, font=f)
        y += int(size * 1.35)
        if accent_bar and text == lines[0][0]:
            draw.rectangle((SIZE // 2 - 40, y - 8, SIZE // 2 + 40, y - 2), fill=ORANGE)
            y += 28

    img.save(path, quality=94)
    print("wrote", path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    card(
        [
            ("Phone-based", ORANGE, 64),
            ("one-stop solution", WHITE, 52),
            ("POS + Inventory", WHITE, 40),
            ("+ Domain + Hosting", MUTED, 36),
        ],
        OUT / "offer-onestop.jpg",
    )
    card(
        [
            ("৳20,010", ORANGE, 72),
            ("pay across 3 months", WHITE, 40),
            ("For organizations", WHITE, 36),
            ("outside Dhaka only", ORANGE, 44),
        ],
        OUT / "offer-outside-dhaka.jpg",
    )
    card(
        [
            ("Free on-hand", ORANGE, 64),
            ("training included", WHITE, 52),
            ("We train your team", MUTED, 34),
            ("at your organization", MUTED, 34),
        ],
        OUT / "offer-training.jpg",
    )


if __name__ == "__main__":
    main()
