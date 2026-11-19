#!/usr/bin/env python3
"""
FB step video from short screencap clips (not the full recording).
Same sequence/captions as build_video.py · fit to 1080² · hip-hop · no VO.
Clips timed on out/posInventory-clean.mp4 (faces + 2:31–2:41 already cut).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import cv2
import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from build_video import (
    ACCENT,
    AUDIO,
    BG,
    FPS,
    GRAPHICS,
    OUT,
    ROOT,
    SIZE,
    STEPS,
    draw_step,
    font,
    make_end_card,
)

SRC = OUT / "posInventory-clean.mp4"
CLIPS_DIR = OUT / "_step_clips"

# (start_sec on clean video, None = use still/graphic from STEPS)
# Verified against clean frames; avoid model-face shop grids.
CLIP_START: list[float | None] = [
    201.5,  # 1 portal hero (store interior — crop faces below)
    292.0,  # 2 product detail (no model face grid)
    15.5,  # 3 inventory list
    320.0,  # 4 add item form
    346.0,  # 5 sizes / variants
    48.0,  # 6 barcodes / labels
    250.0,  # 7 categories
    452.0,  # 8 products admin grid
    213.0,  # 9 home collections edit
    11.0,  # 10 admin overview
    71.0,  # 11 POS
    92.0,  # 12 solo cart / sell
    81.0,  # 13 phone scanner
    None,  # 14 offline dual graphic
    None,  # 15 offline prepare graphic
    530.0,  # 16 POS sales history
    None,  # 17 offer
    None,  # 18 price
    None,  # 19 training
    None,  # 20 end card
]


def ff() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def prep_capture(img: Image.Image, *, crop_bottom: float = 0.02) -> Image.Image:
    """Crop browser chrome, hide brand, keep app UI fitted for square."""
    img = img.convert("RGB")
    w, h = img.size
    # drop mac/browser chrome (tabs + bookmarks)
    top = int(h * 0.11)
    bottom = int(h * crop_bottom)
    left = int(w * 0.01)
    right = int(w * 0.01)
    img = img.crop((left, top, w - right, h - bottom))
    w, h = img.size
    d = ImageDraw.Draw(img)
    # site logo lockup (top-left after chrome crop)
    d.rectangle((0, 0, int(w * 0.20), int(h * 0.09)), fill=(16, 16, 16))
    return img


def fit_frame(frame: Image.Image, *, crop_bottom: float = 0.02) -> Image.Image:
    frame = prep_capture(frame, crop_bottom=crop_bottom)
    canvas = Image.new("RGB", (SIZE, SIZE), BG)
    max_w, max_h = SIZE - 36, SIZE - 210
    fitted = ImageOps.contain(frame, (max_w, max_h), method=Image.Resampling.LANCZOS)
    x = (SIZE - fitted.width) // 2
    y = 88 + (max_h - fitted.height) // 2
    card = Image.new("RGB", (fitted.width + 18, fitted.height + 18), (28, 28, 28))
    canvas.paste(card, (x - 9, y - 9))
    canvas.paste(fitted, (x, y))
    return canvas


def extract_clip(start: float, sec: float, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    span = sec + 0.35
    # trim filter — -ss is unreliable on the concat clean file
    vf = f"trim=start={start:.3f}:duration={span:.3f},setpts=PTS-STARTPTS,scale=1440:-2"
    subprocess.run(
        [
            ff(),
            "-y",
            "-i",
            str(SRC),
            "-an",
            "-vf",
            vf,
            "-r",
            str(FPS),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(dest),
        ],
        check=True,
        capture_output=True,
    )
    if dest.stat().st_size < 2000:
        raise RuntimeError(f"empty clip {dest} @ {start}s")


def frames_from_clip(path: Path, n_needed: int) -> list[Image.Image]:
    cap = cv2.VideoCapture(str(path))
    raw: list[Image.Image] = []
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        raw.append(Image.fromarray(rgb))
    cap.release()
    if not raw:
        raise RuntimeError(f"no frames in {path}")
    out: list[Image.Image] = []
    for i in range(n_needed):
        out.append(raw[min(i, len(raw) - 1)])
    return out


def still_path(item: dict) -> Path | None:
    if item.get("end"):
        return None
    if "image" in item:
        p = Path(item["image"])
        return p if p.exists() else None
    name = item["shot"]
    for folder in (ROOT / "shots-en", ROOT / "shots-bn", ROOT / "shots"):
        p = folder / name
        if p.exists():
            return p
    return None


def mux(raw: Path, duration: float, bangla: bool) -> Path:
    music = AUDIO / "hiphop.mp3"
    if not music.exists():
        subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "gen_hiphop.py")], check=True)
    out = OUT / f"thingkers-pos-inventory-{'bn' if bangla else 'en'}.mp4"
    fade = max(1.0, duration - 2.2)
    subprocess.run(
        [
            ff(),
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
    return out


def build_lang(lang: str) -> Path:
    bangla = lang == "bn"
    assert len(CLIP_START) == len(STEPS)

    # extract clips once
    for i, (item, start) in enumerate(zip(STEPS, CLIP_START)):
        if start is None:
            continue
        dest = CLIPS_DIR / f"step{i:02d}.mp4"
        if not dest.exists():
            print(f"extract step {i+1} @ {start:.1f}s ({item['sec']}s)")
            extract_clip(start, float(item["sec"]), dest)

    duration = sum(float(s["sec"]) for s in STEPS)
    raw = OUT / f"_tmp_sc_{lang}.mp4"
    writer = imageio.get_writer(
        str(raw),
        fps=FPS,
        codec="libx264",
        quality=7,
        pixelformat="yuv420p",
        macro_block_size=None,
        ffmpeg_log_level="error",
    )
    stills = OUT / f"stills-sc-{lang}"
    stills.mkdir(exist_ok=True)

    try:
        print(f"[{lang}] {len(STEPS)} steps · {duration:.1f}s (screencap clips)")
        for i, (item, start) in enumerate(zip(STEPS, CLIP_START)):
            step, topic = item[lang]
            thingkers = bool(item.get("thingkers"))
            secs = float(item["sec"])
            n = max(12, int(round(secs * FPS)))
            print(f"  {i+1}/{len(STEPS)} {step} — {topic}")

            if item.get("end"):
                canvas = make_end_card(bangla)
                fitted_frames = [canvas] * n
            elif start is not None:
                clip = CLIPS_DIR / f"step{i:02d}.mp4"
                # home hero: crop lower category tiles (often have model faces)
                bottom = 0.28 if i == 0 else 0.02
                fitted_frames = [fit_frame(fr, crop_bottom=bottom) for fr in frames_from_clip(clip, n)]
            else:
                path = still_path(item)
                if path is None:
                    raise FileNotFoundError(item)
                base = fit_frame(Image.open(path))
                # soft zoom on stills
                soft = bool(item.get("soft"))
                fitted_frames = []
                arr0 = np.asarray(base)
                zoom = 0.006 if soft else 0.012
                for f in range(n):
                    t = f / max(1, n - 1)
                    scale = 1.0 + zoom * t
                    side = int(SIZE / scale)
                    left = (SIZE - side) // 2
                    top = (SIZE - side) // 2
                    punched = Image.fromarray(arr0).crop((left, top, left + side, top + side)).resize(
                        (SIZE, SIZE), Image.Resampling.LANCZOS
                    )
                    fitted_frames.append(punched)

            for fi, canvas in enumerate(fitted_frames):
                framed = draw_step(canvas.copy(), step, topic, bangla=bangla, thingkers=thingkers)
                writer.append_data(np.asarray(framed))
                if fi == n // 2:
                    framed.save(stills / f"{i+1:02d}.jpg", quality=90)
    finally:
        writer.close()

    out = mux(raw, duration, bangla)
    raw.unlink(missing_ok=True)
    if bangla:
        (OUT / "your-store-ecommerce-pos-demo-fb.mp4").write_bytes(out.read_bytes())
    print(f"✓ {out}")
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC} — run cut_screen_record.py first")
    OUT.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    # refresh clips if map changed
    for old in CLIPS_DIR.glob("step*.mp4"):
        old.unlink()
    if not (AUDIO / "hiphop.mp3").exists():
        subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "gen_hiphop.py")], check=True)
    build_lang("en")
    build_lang("bn")


if __name__ == "__main__":
    main()
