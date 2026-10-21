#!/usr/bin/env python3
"""Build EN + BN step videos: StyleARZ look (no name), Thingkers HUD only at end."""

from __future__ import annotations

import subprocess
from pathlib import Path

import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
GRAPHICS = ROOT / "graphics"
AUDIO = ROOT / "audio"
OUT = ROOT / "out"
SIZE = 1080
FPS = 30
# StyleARZ design system (product UI)
BG = (14, 14, 14)
ACCENT = (255, 106, 0)
# Thingkers Intelligence (end card only)
TK_CYAN = (56, 189, 248)
TK_CYAN_SOFT = (125, 211, 252)
TK_SILVER = (203, 213, 225)
TK_NAVY = (6, 10, 24)
WEB = "thingkers.com"
WA = "+8801916642465"

# Unique image per step. Thingkers identity only on the final HUD card.
STEPS = [
    {
        "image": GRAPHICS / "01-open-home.png",
        "en": ("Step 1", "Online portal for your organization"),
        "bn": ("ধাপ ১", "প্রতিষ্ঠানের অনলাইন পোর্টাল"),
        "sec": 3.2,
        "soft": True,  # short hold, minimal zoom
    },
    {
        "shot": "02-shop.png",
        "en": ("Step 2", "Product catalog & collections"),
        "bn": ("ধাপ ২", "প্রোডাক্ট ক্যাটালগ ও কালেকশন"),
        "sec": 4.8,
    },
    {
        "shot": "04-inventory.png",
        "en": ("Step 3", "Inventory — stock at a glance"),
        "bn": ("ধাপ ৩", "ইনভেন্টরি — স্টক এক নজরে"),
        "sec": 5.0,
    },
    {
        "shot": "14-inventory-add.png",
        "en": ("Step 4", "Add item — photo, details, review"),
        "bn": ("ধাপ ৪", "আইটেম যোগ — ছবি, ডিটেইলস, রিভিউ"),
        "sec": 5.0,
    },
    {
        "shot": "15-inventory-expand.png",
        "en": ("Step 5", "Sizes, colours & stock rows"),
        "bn": ("ধাপ ৫", "সাইজ, রং ও স্টক সারি"),
        "sec": 4.8,
    },
    {
        "shot": "10-barcodes.png",
        "en": ("Step 6", "Barcode generation & label print"),
        "bn": ("ধাপ ৬", "বারকোড তৈরি ও লেবেল প্রিন্ট"),
        "sec": 5.0,
    },
    {
        "shot": "13-categories.png",
        "en": ("Step 7", "Category management"),
        "bn": ("ধাপ ৭", "ক্যাটাগরি ম্যানেজমেন্ট"),
        "sec": 4.4,
    },
    {
        "shot": "12-products.png",
        "en": ("Step 8", "Products grid & ordering"),
        "bn": ("ধাপ ৮", "প্রোডাক্ট গ্রিড ও সাজানো"),
        "sec": 4.6,
    },
    {
        "shot": "05-home-collections.png",
        "en": ("Step 9", "Home collections — edit & arrange"),
        "bn": ("ধাপ ৯", "হোম কালেকশন — এডিট ও সাজানো"),
        "sec": 4.6,
    },
    {
        "shot": "03-admin.png",
        "en": ("Step 10", "Admin dashboard & alerts"),
        "bn": ("ধাপ ১০", "অ্যাডমিন ড্যাশবোর্ড ও অ্যালার্ট"),
        "sec": 4.4,
    },
    {
        "shot": "06-pos.png",
        "en": ("Step 11", "POS on any phone or tablet"),
        "bn": ("ধাপ ১১", "যেকোনো ফোন/ট্যাবলেটে পিওএস"),
        "sec": 4.8,
    },
    {
        "shot": "07-pos-solo.png",
        "en": ("Step 12", "Solo mode — scan & sell"),
        "bn": ("ধাপ ১২", "সোলো মোড — স্ক্যান ও বিক্রি"),
        "sec": 4.6,
    },
    {
        "shot": "08-pos-scan.png",
        "en": ("Step 13", "Mobile phone as barcode scanner"),
        "bn": ("ধাপ ১৩", "মোবাইল ফোন বারকোড স্ক্যানার"),
        "sec": 4.8,
    },
    {
        "shot": "09-pos-scan-offline.png",
        "en": ("Step 14", "Offline dual-device pairing"),
        "bn": ("ধাপ ১৪", "অফলাইন ডুয়াল ডিভাইস পেয়ার"),
        "sec": 4.8,
    },
    {
        "image": GRAPHICS / "fb-offline-dual.jpg",
        "en": ("Step 15", "Prepare offline — sell without net"),
        "bn": ("ধাপ ১৫", "অফলাইন প্রস্তুত — নেট ছাড়া বিক্রি"),
        "sec": 4.6,
    },
    {
        "shot": "11-pos-sales.png",
        "en": ("Step 16", "Sales tracking & POS history"),
        "bn": ("ধাপ ১৬", "সেলস ট্র্যাক ও পিওএস হিস্টরি"),
        "sec": 4.8,
    },
    {
        "image": GRAPHICS / "offer-onestop.jpg",
        "en": ("Step 17", "Phone-based one-stop: POS + inventory + domain + hosting"),
        "bn": ("ধাপ ১৭", "ফোনভিত্তিক ওয়ান-স্টপ: পিওএস + ইনভেন্টরি + ডোমেইন + হোস্টিং"),
        "sec": 6.2,
    },
    {
        "image": GRAPHICS / "offer-outside-dhaka.jpg",
        "en": ("Step 18", "৳20,010 / 3 months — outside Dhaka organizations only"),
        "bn": ("ধাপ ১৮", "৳২০,০১০ / ৩ মাস — শুধু ঢাকার বাইরের প্রতিষ্ঠানের জন্য"),
        "sec": 6.5,
    },
    {
        "image": GRAPHICS / "offer-training.jpg",
        "en": ("Step 19", "Free on-hand training at your organization"),
        "bn": ("ধাপ ১৯", "প্রতিষ্ঠানে ফ্রি হাতে-কলমে প্রশিক্ষণ"),
        "sec": 5.8,
    },
    # Single end card — HUD mark + contacts (Thingkers colors/fonts)
    {
        "end": True,
        "en": ("Contact", "Thingkers Intelligence"),
        "bn": ("যোগাযোগ", "Thingkers Intelligence"),
        "sec": 8.5,
        "thingkers": True,
    },
]


def font(size: int, bangla: bool = False):
    paths = (
        (
            "/System/Library/Fonts/KohinoorBangla.ttc",
            "/System/Library/Fonts/Supplemental/Bangla MN.ttc",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        )
        if bangla
        else (
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        )
    )
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def tk_font(size: int, *, light: bool = False):
    """Prefer clean tech sans close to thingkers.com wordmark."""
    paths = (
        (
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        )
        if light
        else (
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        )
    )
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def resolve(item: dict, lang: str) -> Path | None:
    if item.get("end"):
        return GRAPHICS / "thingkers-hud.png"
    if "image" in item:
        path = Path(item["image"])
        if path.exists():
            return path
        if path.name == "01-open-home.png":
            for candidate in (ROOT / f"shots-{lang}" / "01-home.png", ROOT / "shots-bn" / "01-home.png"):
                if candidate.exists():
                    return candidate
        return None
    name = item["shot"]
    for folder in (ROOT / f"shots-{lang}", ROOT / "shots-bn", ROOT / "shots-en"):
        path = folder / name
        if path.exists():
            return path
    return None


def fit_screen(path: Path) -> Image.Image:
    src = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", (SIZE, SIZE), BG)
    max_w, max_h = SIZE - 36, SIZE - 210
    fitted = ImageOps.contain(src, (max_w, max_h), method=Image.Resampling.LANCZOS)
    x = (SIZE - fitted.width) // 2
    y = 88 + (max_h - fitted.height) // 2
    card = Image.new("RGB", (fitted.width + 18, fitted.height + 18), (28, 28, 28))
    canvas.paste(card, (x - 9, y - 9))
    canvas.paste(fitted, (x, y))
    return canvas


def make_end_card(bangla: bool) -> Image.Image:
    """HUD centerpiece + Thingkers contact — no full website screenshot."""
    canvas = Image.new("RGB", (SIZE, SIZE), TK_NAVY)
    draw = ImageDraw.Draw(canvas)

    # subtle radial glow
    for r in range(420, 40, -18):
        c = 8 + int(18 * (1 - r / 420))
        draw.ellipse(
            (SIZE // 2 - r, 120 - r // 3, SIZE // 2 + r, 120 + r * 1.1),
            fill=(c, c + 6, c + 18),
        )

    hud = Image.open(GRAPHICS / "thingkers-hud.png").convert("RGBA")
    fitted = ImageOps.contain(hud, (720, 720), method=Image.Resampling.LANCZOS)
    hx = (SIZE - fitted.width) // 2
    hy = 70
    canvas.paste(fitted, (hx, hy), fitted)

    # Brand + contact under HUD (thingkers.com palette)
    name_f = tk_font(48)
    sub_f = tk_font(18, light=True)
    line_f = tk_font(32)
    small_f = tk_font(22, light=True)
    bn_f = font(22, bangla=True) if bangla else small_f

    y = hy + fitted.height + 8
    title = "Thingkers"
    bb = draw.textbbox((0, 0), title, font=name_f)
    draw.text(((SIZE - (bb[2] - bb[0])) / 2, y), title, fill=TK_CYAN, font=name_f)
    y += 54
    intel = "INTELLIGENCE"
    # letter-spacing simulation
    spacing = 8
    widths = [draw.textbbox((0, 0), ch, font=sub_f)[2] for ch in intel]
    total = sum(widths) + spacing * (len(intel) - 1)
    x = (SIZE - total) / 2
    for ch, w in zip(intel, widths):
        draw.text((x, y), ch, fill=TK_SILVER, font=sub_f)
        x += w + spacing
    y += 48

    # divider
    draw.rectangle((SIZE // 2 - 60, y, SIZE // 2 + 60, y + 2), fill=TK_CYAN)
    y += 28

    white = (248, 250, 252)
    if bangla:
        draw.text(((SIZE - draw.textbbox((0, 0), "ওয়েবসাইট", font=bn_f)[2]) / 2, y), "ওয়েবসাইট", fill=TK_CYAN_SOFT, font=bn_f)
        y += 30
    draw.text(((SIZE - draw.textbbox((0, 0), WEB, font=line_f)[2]) / 2, y), WEB, fill=white, font=line_f)
    y += 50
    if bangla:
        draw.text(((SIZE - draw.textbbox((0, 0), "WhatsApp", font=bn_f)[2]) / 2, y), "WhatsApp", fill=TK_CYAN_SOFT, font=bn_f)
        y += 30
    else:
        draw.text(((SIZE - draw.textbbox((0, 0), "WhatsApp", font=small_f)[2]) / 2, y), "WhatsApp", fill=TK_CYAN_SOFT, font=small_f)
        y += 30
    draw.text(((SIZE - draw.textbbox((0, 0), WA, font=line_f)[2]) / 2, y), WA, fill=white, font=line_f)

    # top ribbon
    draw.rectangle((0, 0, SIZE, 56), fill=(4, 8, 20))
    ribbon = "Thingkers Intelligence"
    rb = draw.textbbox((0, 0), ribbon, font=tk_font(20))
    draw.text(((SIZE - (rb[2] - rb[0])) / 2, 16), ribbon, fill=TK_CYAN, font=tk_font(20))
    return canvas


def draw_step(img: Image.Image, step: str, topic: str, *, bangla: bool, thingkers: bool) -> Image.Image:
    draw = ImageDraw.Draw(img)
    if thingkers:
        return img  # end card already painted

    top_bg, accent, ribbon_c = (10, 10, 10), ACCENT, (255, 200, 160)
    ribbon = "Portal · Inventory · POS" if not bangla else "পোর্টাল · ইনভেন্টরি · পিওএস"

    small = font(20, bangla=bangla)
    step_f = font(26, bangla=bangla)
    topic_f = font(30 if len(topic) > 42 else 34, bangla=bangla)

    draw.rectangle((0, 0, SIZE, 64), fill=top_bg)
    rb = draw.textbbox((0, 0), ribbon, font=small)
    draw.text(((SIZE - (rb[2] - rb[0])) / 2, 20), ribbon, fill=ribbon_c, font=small)

    chip = f"{step}"
    cb = draw.textbbox((0, 0), chip, font=step_f)
    cw, ch = cb[2] - cb[0], cb[3] - cb[1]
    chip_x, chip_y = 36, SIZE - 150
    draw.rounded_rectangle(
        (chip_x, chip_y, chip_x + cw + 28, chip_y + ch + 18),
        radius=12,
        fill=accent,
    )
    draw.text((chip_x + 14, chip_y + 8), chip, fill=(255, 255, 255), font=step_f)

    tb = draw.textbbox((0, 0), topic, font=topic_f)
    tw = tb[2] - tb[0]
    tx = max(28, (SIZE - tw) // 2)
    if tw > SIZE - 56:
        tx = 28
    draw.rectangle((0, SIZE - 78, SIZE, SIZE), fill=top_bg)
    draw.text((tx, SIZE - 60), topic[:72], fill=(255, 255, 255), font=topic_f)
    return img


def build_lang(lang: str) -> Path:
    bangla = lang == "bn"
    frames: list[tuple[Image.Image | Path, str, str, float, bool, bool]] = []
    for item in STEPS:
        step, topic = item[lang]
        thingkers = bool(item.get("thingkers"))
        soft = bool(item.get("soft"))
        if item.get("end"):
            frames.append((make_end_card(bangla), step, topic, float(item["sec"]), True, True))
            continue
        path = resolve(item, lang)
        if not path:
            print("skip", item.get("shot") or item.get("image"))
            continue
        frames.append((path, step, topic, float(item["sec"]), thingkers, soft))

    duration = sum(f[3] for f in frames)
    print(f"[{lang}] {len(frames)} steps · {duration:.1f}s")

    raw = OUT / f"_tmp_{lang}.mp4"
    writer = imageio.get_writer(
        str(raw),
        fps=FPS,
        codec="libx264",
        quality=7,
        pixelformat="yuv420p",
        macro_block_size=None,
        ffmpeg_log_level="error",
    )
    try:
        for i, (src, step, topic, secs, thingkers, soft) in enumerate(frames, 1):
            print(f"  {i}/{len(frames)} {step} — {topic}")
            if isinstance(src, Image.Image):
                canvas = src
            else:
                canvas = fit_screen(src)
            base = draw_step(canvas.copy(), step, topic, bangla=bangla, thingkers=thingkers)
            arr = np.asarray(base)
            n_each = max(12, int(round(secs * FPS)))
            zoom_amt = 0.006 if soft or thingkers else 0.012
            for f in range(n_each):
                t = f / max(1, n_each - 1)
                if thingkers:
                    # gentle pulse on HUD end card
                    scale = 1.0 + 0.01 * (0.5 - abs(t - 0.5))
                else:
                    scale = 1.0 + zoom_amt * t
                side = int(SIZE / scale)
                left = (SIZE - side) // 2
                top = (SIZE - side) // 2
                punched = Image.fromarray(arr).crop((left, top, left + side, top + side)).resize(
                    (SIZE, SIZE), Image.Resampling.LANCZOS
                )
                punched = draw_step(punched, step, topic, bangla=bangla, thingkers=thingkers)
                writer.append_data(np.asarray(punched))
    finally:
        writer.close()

    music = AUDIO / "soothy-bits.mp3"
    if not music.exists():
        music = AUDIO / "robotic-eco.mp3"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out = OUT / f"thingkers-pos-inventory-{'bn' if bangla else 'en'}.mp4"
    fade = max(1.0, duration - 2.2)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(raw),
            "-stream_loop",
            "-1",
            "-i",
            str(music),
            "-filter_complex",
            f"[1:a]volume=0.34,afade=t=in:st=0:d=1.6,afade=t=out:st={fade}:d=2.0[a]",
            "-map",
            "0:v",
            "-map",
            "[a]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-t",
            f"{duration:.2f}",
            str(out),
        ],
        check=True,
    )
    raw.unlink(missing_ok=True)

    if bangla:
        legacy = OUT / "your-store-ecommerce-pos-demo-fb.mp4"
        legacy.write_bytes(out.read_bytes())

    stills = OUT / f"stills-{lang}"
    stills.mkdir(exist_ok=True)
    for i, (src, step, topic, _, thingkers, _) in enumerate(frames, 1):
        canvas = src.copy() if isinstance(src, Image.Image) else fit_screen(src)
        draw_step(canvas, step, topic, bangla=bangla, thingkers=thingkers).save(
            stills / f"{i:02d}.jpg", quality=90
        )

    print(f"✓ {out}")
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    assets = Path("/Users/neemnagorik/.cursor/projects/Volumes-THINGKERS-developments-styleARZ/assets")
    hud = assets / "image-36bac89b-64bf-4002-a512-9f6232e19211.png"
    if hud.exists():
        (GRAPHICS / "thingkers-hud.png").write_bytes(hud.read_bytes())
    for name in ("fb-offline-dual.jpg", "fb-phone-pos.jpg"):
        src = assets / name
        if src.exists() and not (GRAPHICS / name).exists():
            (GRAPHICS / name).write_bytes(src.read_bytes())

    # ensure offer cards + music exist
    subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "make_offer_cards.py")], check=True)
    if not (AUDIO / "soothy-bits.mp3").exists():
        subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "gen_soothy_bits.py")], check=True)

    build_lang("en")
    build_lang("bn")


if __name__ == "__main__":
    main()
