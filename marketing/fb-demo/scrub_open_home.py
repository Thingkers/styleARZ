#!/usr/bin/env python3
"""Crop browser chrome from attached homepage and remove StyleARZ branding."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SRC = Path(
    "/Users/neemnagorik/.cursor/projects/Volumes-THINGKERS-developments-styleARZ/assets/"
    "image-b360634c-6280-4f63-92ad-d29a81e62396.jpg"
)
OUT = ROOT / "graphics" / "01-open-home.png"


def font(size: int):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    cropped = img.crop((0, 78, w, h))
    cw, ch = cropped.size
    draw = ImageDraw.Draw(cropped)

    header_bg = (16, 16, 16)
    hero_bg = (32, 32, 32)

    # Logo lockup (top-left)
    draw.rectangle((6, 14, 220, 100), fill=header_bg)
    # Hero STYLE ARZ capsule above headline
    draw.rectangle((24, 112, 220, 172), fill=hero_bg)
    draw.rectangle((0, 105, 40, 180), fill=hero_bg)

    f_big = font(32)
    f_tag = font(13)
    lx, ly = 16, 26
    draw.text((lx, ly), "PORT", fill=(255, 255, 255), font=f_big)
    bb = draw.textbbox((lx, ly), "PORT", font=f_big)
    ox = bb[2] + 4
    al = "AL"
    abb = draw.textbbox((0, 0), al, font=f_big)
    pad_x, pad_y = 6, 2
    draw.rectangle(
        (
            ox - pad_x,
            ly - pad_y,
            ox + (abb[2] - abb[0]) + pad_x,
            ly + (abb[3] - abb[1]) + pad_y + 4,
        ),
        fill=(255, 106, 0),
    )
    draw.text((ox, ly), al, fill=(255, 255, 255), font=f_big)
    draw.text((lx, ly + 38), "Inventory · POS", fill=(170, 170, 170), font=f_tag)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(OUT, quality=95)
    print("wrote", OUT, cropped.size)


if __name__ == "__main__":
    main()
