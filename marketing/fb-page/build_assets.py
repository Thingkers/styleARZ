#!/usr/bin/env python3
"""Generate StyleARZ Facebook Page assets matched to stylearz.com brand."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "out"
WINTER = ROOT / "winter-images"
IMAGES = ROOT / "images"
SHOTS = ROOT / ".shots"

ORANGE = (255, 102, 0)  # --orange / bag PMS 1585 C
ORANGE_DEEP = (227, 90, 0)
INK = (10, 10, 10)
PAPER = (243, 243, 241)
WHITE = (251, 251, 251)
CHARCOAL = (31, 31, 31)
MUTED = (106, 106, 106)

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_ITAL = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def cover_safe_rect(w: int, h: int) -> tuple[int, int, int, int]:
    """Desktop-safe text zone for FB cover (1640×924). Avoid avatar + mobile crop."""
    # Avatar sits bottom-left; mobile crops sides. Keep copy in central band.
    return (int(w * 0.28), int(h * 0.18), int(w * 0.94), int(h * 0.72))


def fit_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    src = img.convert("RGB")
    scale = max(tw / src.width, th / src.height)
    nw, nh = int(src.width * scale), int(src.height * scale)
    src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = max(0, (nh - th) // 3)  # bias upward so racks stay visible
    return src.crop((left, top, left + tw, top + th))


def darken(img: Image.Image, factor: float = 0.45) -> Image.Image:
    return ImageEnhance.Brightness(img).enhance(factor)


def draw_wordmark(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    size: int,
    style_fill=WHITE,
    arz_fill=ORANGE,
) -> int:
    """Draw STYLE+ARZ lockup; returns total width."""
    x, y = xy
    f = font(FONT_BOLD, size)
    style = "STYLE"
    arz = "ARZ"
    sw = draw.textlength(style, font=f)
    aw = draw.textlength(arz, font=f)
    draw.text((x, y), style, fill=style_fill, font=f)
    draw.text((x + sw, y), arz, fill=arz_fill, font=f)
    return int(sw + aw)


def add_orange_rule(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, thickness: int = 4):
    draw.rectangle((x, y, x + w, y + thickness), fill=ORANGE)


def make_cover() -> Path:
    """1640×924 cover — store photo + brand lockup + opening CTA."""
    w, h = 1640, 924
    base = fit_cover(Image.open(WINTER / "w2.jpeg"), (w, h))
    base = darken(base, 0.42)
    # Soft vignette
    overlay = Image.new("RGB", (w, h), INK)
    base = Image.blend(base, overlay, 0.28)

    # Left brand panel
    panel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rectangle((0, 0, int(w * 0.42), h), fill=(10, 10, 10, 210))
    # Orange accent strip
    pd.rectangle((int(w * 0.42) - 6, 0, int(w * 0.42), h), fill=(*ORANGE, 255))
    base = Image.alpha_composite(base.convert("RGBA"), panel).convert("RGB")

    draw = ImageDraw.Draw(base)
    # Logo
    draw_wordmark(draw, (72, 210), 92)
    tag = font(FONT_ITAL, 28)
    draw.text((74, 320), "your personal fashion statement", fill=PAPER, font=tag)
    add_orange_rule(draw, 74, 372, 220, 5)

    # Opening message
    head = font(FONT_BOLD, 44)
    draw.text((74, 420), "GRAND OPENING", fill=ORANGE, font=head)
    sub = font(FONT_REG, 26)
    draw.text((74, 480), "Inauguration 27 November · Pabna", fill=WHITE, font=sub)
    draw.text((74, 520), "Grade A export casuals · Men · Women · Kids", fill=(200, 200, 198), font=sub)

    # CTA chip
    cta = "stylearz.com"
    cf = font(FONT_BOLD, 24)
    cw = int(draw.textlength(cta, font=cf))
    pad_x, pad_y = 28, 16
    box = (74, 590, 74 + cw + pad_x * 2, 590 + 24 + pad_y * 2)
    draw.rounded_rectangle(box, radius=999, fill=ORANGE)
    draw.text((74 + pad_x, 590 + pad_y), cta, fill=WHITE, font=cf)

    # Right edge feature pills (safe on desktop)
    features = ["SHOP", "LOOKBOOK", "STUDIO", "QUIZ"]
    ff = font(FONT_BOLD, 18)
    fx = w - 220
    fy = 280
    for label in features:
        tw = int(draw.textlength(label, font=ff))
        draw.rounded_rectangle(
            (fx, fy, fx + tw + 36, fy + 40),
            radius=8,
            outline=ORANGE,
            width=2,
            fill=(10, 10, 10, ),
        )
        # fill without alpha on RGB
        draw.rounded_rectangle((fx, fy, fx + tw + 36, fy + 40), radius=8, fill=INK, outline=ORANGE, width=2)
        draw.text((fx + 18, fy + 10), label, fill=ORANGE, font=ff)
        fy += 56

    path = OUT / "cover-1640x924.jpg"
    base.save(path, quality=92, optimize=True)
    # Also export classic 820×312 crop for older layouts
    classic = base.resize((820, 462), Image.Resampling.LANCZOS).crop((0, 75, 820, 387))
    classic.save(OUT / "cover-820x312.jpg", quality=92, optimize=True)
    return path


def make_avatar() -> Path:
    """1080×1080 profile — black field, orange ARZ lockup."""
    size = 1080
    img = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(img)
    # Soft ring
    margin = 48
    draw.ellipse(
        (margin, margin, size - margin, size - margin),
        outline=ORANGE,
        width=10,
    )
    # Inner subtle ring
    draw.ellipse(
        (margin + 28, margin + 28, size - margin - 28, size - margin - 28),
        outline=(60, 60, 60),
        width=2,
    )

    f = font(FONT_BOLD, 118)
    style, arz = "STYLE", "ARZ"
    sw = draw.textlength(style, font=f)
    aw = draw.textlength(arz, font=f)
    total = sw + aw
    x = (size - total) / 2
    y = size * 0.38
    draw.text((x, y), style, fill=WHITE, font=f)
    draw.text((x + sw, y), arz, fill=ORANGE, font=f)

    tag = font(FONT_ITAL, 36)
    tagline = "your personal fashion statement"
    tw = draw.textlength(tagline, font=tag)
    draw.text(((size - tw) / 2, y + 140), tagline, fill=(180, 180, 178), font=tag)

    path = OUT / "avatar-1080.jpg"
    img.save(path, quality=94, optimize=True)
    img.resize((400, 400), Image.Resampling.LANCZOS).save(OUT / "avatar-400.jpg", quality=94)
    return path


def make_post_card(
    filename: str,
    eyebrow: str,
    title: str,
    body: str,
    photo: Path | None = None,
    cta: str = "stylearz.com",
) -> Path:
    """1200×630 link / feed card."""
    w, h = 1200, 630
    if photo and photo.exists():
        bg = fit_cover(Image.open(photo), (w, h))
        bg = darken(bg, 0.38)
        overlay = Image.new("RGB", (w, h), INK)
        bg = Image.blend(bg, overlay, 0.35)
    else:
        bg = Image.new("RGB", (w, h), INK)
        # subtle gradient via blur blot
        blot = Image.new("RGB", (w, h), CHARCOAL)
        draw_b = ImageDraw.Draw(blot)
        draw_b.ellipse((-200, -100, 700, 500), fill=(40, 28, 18))
        draw_b.ellipse((700, 200, 1400, 800), fill=(28, 28, 28))
        blot = blot.filter(ImageFilter.GaussianBlur(80))
        bg = Image.blend(bg, blot, 0.55)

    draw = ImageDraw.Draw(bg)
    draw.rectangle((0, 0, 12, h), fill=ORANGE)
    draw_wordmark(draw, (56, 48), 42)
    ef = font(FONT_BOLD, 22)
    draw.text((56, 130), eyebrow.upper(), fill=ORANGE, font=ef)
    add_orange_rule(draw, 56, 168, 80, 4)

    title_font = font(FONT_BOLD, 54 if len(title) < 36 else 42)
    # wrap title
    words = title.split()
    lines: list[str] = []
    cur = ""
    max_w = w - 120
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=title_font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    ty = 200
    for line in lines[:3]:
        draw.text((56, ty), line, fill=WHITE, font=title_font)
        ty += int(title_font.size * 1.15)

    bf = font(FONT_REG, 26)
    # wrap body
    words = body.split()
    blines: list[str] = []
    cur = ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=bf) <= max_w:
            cur = trial
        else:
            blines.append(cur)
            cur = word
    if cur:
        blines.append(cur)
    by = ty + 24
    for line in blines[:3]:
        draw.text((56, by), line, fill=(190, 190, 188), font=bf)
        by += 34

    cf = font(FONT_BOLD, 22)
    cw = int(draw.textlength(cta, font=cf))
    box = (56, h - 90, 56 + cw + 40, h - 42)
    draw.rounded_rectangle(box, radius=999, fill=ORANGE)
    draw.text((56 + 20, h - 82), cta, fill=WHITE, font=cf)

    path = OUT / filename
    bg.save(path, quality=92, optimize=True)
    return path


def make_story() -> Path:
    """1080×1920 story — grand opening."""
    w, h = 1080, 1920
    bg = fit_cover(Image.open(WINTER / "w1.jpeg"), (w, h))
    bg = darken(bg, 0.4)
    overlay = Image.new("RGB", (w, h), INK)
    bg = Image.blend(bg, overlay, 0.3)
    draw = ImageDraw.Draw(bg)
    draw.rectangle((0, h - 16, w, h), fill=ORANGE)
    draw.rectangle((0, 0, w, 16), fill=ORANGE)

    draw_wordmark(draw, (80, 220), 72)
    tag = font(FONT_ITAL, 28)
    draw.text((82, 320), "your personal fashion statement", fill=PAPER, font=tag)

    head = font(FONT_BOLD, 64)
    draw.text((80, 720), "GRAND\nOPENING", fill=ORANGE, font=head)
    sub = font(FONT_REG, 32)
    draw.text((80, 920), "27 November · Radhanagar, Pabna", fill=WHITE, font=sub)
    body = font(FONT_REG, 28)
    draw.text(
        (80, 1000),
        "First 10: 20% off\nNext 20: 15% off\nNext 20: 10% off\n+ lifetime 10% · in store",
        fill=(210, 210, 208),
        font=body,
    )
    cf = font(FONT_BOLD, 28)
    cta = "Shop stylearz.com"
    cw = int(draw.textlength(cta, font=cf))
    box = (80, 1280, 80 + cw + 48, 1280 + 64)
    draw.rounded_rectangle(box, radius=999, fill=ORANGE)
    draw.text((80 + 24, 1294), cta, fill=WHITE, font=cf)

    path = OUT / "story-grand-opening-1080x1920.jpg"
    bg.save(path, quality=92, optimize=True)
    return path


def make_highlight_icons() -> list[Path]:
    """Circular highlight covers for FB Page story highlights."""
    labels = [
        ("Shop", ORANGE),
        ("Studio", WHITE),
        ("Lookbook", ORANGE),
        ("Opening", WHITE),
        ("Pabna", ORANGE),
    ]
    paths = []
    for name, fill in labels:
        size = 400
        img = Image.new("RGB", (size, size), INK)
        draw = ImageDraw.Draw(img)
        draw.ellipse((20, 20, size - 20, size - 20), outline=ORANGE, width=8)
        f = font(FONT_BOLD, 42 if len(name) < 8 else 34)
        tw = draw.textlength(name.upper(), font=f)
        draw.text(((size - tw) / 2, size / 2 - 24), name.upper(), fill=fill, font=f)
        path = OUT / f"highlight-{name.lower()}.jpg"
        img.save(path, quality=92)
        paths.append(path)
    return paths


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("cover:", make_cover())
    print("avatar:", make_avatar())
    print(
        "post:",
        make_post_card(
            "post-grand-opening.jpg",
            "Inauguration · 27 November",
            "Grand Opening in Pabna",
            "Export-floor casuals for everyday wear. First visitors get opening discounts + lifetime 10%.",
            WINTER / "w2.jpeg",
        ),
    )
    print(
        "post:",
        make_post_card(
            "post-studio.jpg",
            "Style Studio",
            "Build the look before you buy",
            "Mix & match · Colour match · Build on a budget — free on stylearz.com",
            WINTER / "w3.jpeg",
        ),
    )
    print(
        "post:",
        make_post_card(
            "post-shop.jpg",
            "01 — Casuals",
            "Opening pieces from the export floor",
            "Men · Women · Children. Bangladesh Grade A RMG for daily wear.",
            WINTER / "w4.jpeg",
        ),
    )
    print(
        "post:",
        make_post_card(
            "post-lookbook.jpg",
            "Lookbook",
            "Casual looks for real days",
            "Weekend ease, city casuals, kids edits — open the lookbook on the site.",
            WINTER / "w1.jpeg",
        ),
    )
    print(
        "post:",
        make_post_card(
            "post-features.jpg",
            "On stylearz.com",
            "Shop · Studio · Quiz · Wardrobe",
            "Same Grade A programmes that ship worldwide — edited for everyday wear at home.",
            None,
        ),
    )
    print("story:", make_story())
    for p in make_highlight_icons():
        print("highlight:", p)
    print("done →", OUT)


if __name__ == "__main__":
    main()
