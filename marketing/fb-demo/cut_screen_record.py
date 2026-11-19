#!/usr/bin/env python3
"""
Cut posInventory.mov for FB promo:
  - drop 2:31–2:41
  - drop any spans with a detected face
  - square 1080 crop + hip-hop bed + optional text-only captions later
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
SRC = REPO / "posInventory.mov"
OUT_DIR = ROOT / "out"
AUDIO = ROOT / "audio"
SKIP = (151.0, 161.0)  # 2:31–2:41
SAMPLE_EVERY = 0.5  # seconds
PAD = 0.6  # expand each face hit so we don't leave edges
MIN_FACE = 48  # px on downscaled frame
FACE_REPORT = OUT_DIR / "face-segments.json"
CLEAN_MP4 = OUT_DIR / "posInventory-clean.mp4"
FB_MP4 = OUT_DIR / "thingkers-pos-inventory-screencap.mp4"


def ff() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe_duration(path: Path) -> float:
    # imageio ffmpeg binary folder may not include ffprobe — use opencv
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    if frames > 0 and fps > 0:
        return frames / fps
    # fallback: ffmpeg
    r = subprocess.run(
        [ff(), "-i", str(path)],
        capture_output=True,
        text=True,
    )
    for line in (r.stderr or "").splitlines():
        if "Duration:" in line:
            # Duration: 00:10:45.88
            part = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = part.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError("could not probe duration")


def extract_thumbs(path: Path, thumbs: Path, every: float) -> None:
    if thumbs.exists():
        for old in thumbs.glob("*.jpg"):
            old.unlink()
    else:
        thumbs.mkdir(parents=True)
    # 1 frame every `every` seconds, downscaled
    fps = 1.0 / every
    subprocess.run(
        [
            ff(),
            "-y",
            "-i",
            str(path),
            "-vf",
            f"fps={fps:.4f},scale=640:-2",
            "-q:v",
            "5",
            str(thumbs / "f%05d.jpg"),
        ],
        check=True,
        capture_output=True,
    )


def detect_face_times(path: Path) -> list[float]:
    thumbs = OUT_DIR / "_face_thumbs"
    print(f"extracting thumbs every {SAMPLE_EVERY}s…", flush=True)
    extract_thumbs(path, thumbs, SAMPLE_EVERY)
    files = sorted(thumbs.glob("f*.jpg"))
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    profile = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    hits: list[float] = []
    print(f"scanning {len(files)} frames…", flush=True)
    for i, img_path in enumerate(files):
        t = i * SAMPLE_EVERY
        gray = cv2.equalizeHist(cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE))
        if gray is None:
            continue
        faces = cascade.detectMultiScale(
            gray, scaleFactor=1.12, minNeighbors=5, minSize=(MIN_FACE, MIN_FACE)
        )
        if len(faces) == 0:
            faces = profile.detectMultiScale(
                gray, scaleFactor=1.12, minNeighbors=5, minSize=(MIN_FACE, MIN_FACE)
            )
        if len(faces) > 0:
            hits.append(round(t, 2))
            print(f"  face @ {t:7.2f}s  ({len(faces)})", flush=True)
        elif i % 40 == 0:
            print(f"  … {t:7.1f}s", flush=True)
    return hits


def hits_to_ranges(hits: list[float], pad: float, duration: float) -> list[tuple[float, float]]:
    if not hits:
        return []
    ranges: list[tuple[float, float]] = []
    start = max(0.0, hits[0] - pad)
    end = min(duration, hits[0] + pad)
    for t in hits[1:]:
        a, b = max(0.0, t - pad), min(duration, t + pad)
        if a <= end + 0.25:
            end = max(end, b)
        else:
            ranges.append((start, end))
            start, end = a, b
    ranges.append((start, end))
    return ranges


def merge_ranges(ranges: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not ranges:
        return []
    ranges = sorted(ranges)
    out = [ranges[0]]
    for a, b in ranges[1:]:
        sa, sb = out[-1]
        if a <= sb + 0.05:
            out[-1] = (sa, max(sb, b))
        else:
            out.append((a, b))
    return out


def invert_ranges(drop: list[tuple[float, float]], duration: float) -> list[tuple[float, float]]:
    keep: list[tuple[float, float]] = []
    cursor = 0.0
    for a, b in drop:
        if a > cursor + 0.05:
            keep.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < duration - 0.05:
        keep.append((cursor, duration))
    return [(a, b) for a, b in keep if b - a >= 0.4]


def cut_and_concat(src: Path, keep: list[tuple[float, float]], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    parts_dir = OUT_DIR / "_cut_parts"
    parts_dir.mkdir(exist_ok=True)
    for old in parts_dir.glob("*.mp4"):
        old.unlink()
    list_file = OUT_DIR / "_concat.txt"
    lines: list[str] = []
    for i, (a, b) in enumerate(keep):
        part = parts_dir / f"p{i:03d}.mp4"
        # re-encode for clean cuts (screen record keyframes are sparse)
        subprocess.run(
            [
                ff(),
                "-y",
                "-ss",
                f"{a:.3f}",
                "-to",
                f"{b:.3f}",
                "-i",
                str(src),
                "-an",
                "-vf",
                "scale=1920:-2",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                str(part),
            ],
            check=True,
            capture_output=True,
        )
        lines.append(f"file '{part}'")
        print(f"  keep {a:7.2f}–{b:7.2f} → {part.name}")
    list_file.write_text("\n".join(lines) + "\n")
    subprocess.run(
        [
            ff(),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(dest),
        ],
        check=True,
        capture_output=True,
    )
    print("wrote", dest)


def mux_fb(clean: Path, dest: Path) -> None:
    music = AUDIO / "hiphop.mp3"
    if not music.exists():
        subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "gen_hiphop.py")], check=True)
    # square center crop 1080, loop hip-hop, fade
    # probe clean duration via opencv
    cap = cv2.VideoCapture(str(clean))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    duration = n / fps if n and fps else 60.0
    fade = max(1.0, duration - 2.2)
    vf = (
        "scale=1080:1080:force_original_aspect_ratio=increase,"
        "crop=1080:1080,setsar=1"
    )
    subprocess.run(
        [
            ff(),
            "-y",
            "-i",
            str(clean),
            "-stream_loop",
            "-1",
            "-i",
            str(music),
            "-filter_complex",
            f"[0:v]{vf}[v];[1:a]volume=0.34,afade=t=in:st=0:d=1.6,afade=t=out:st={fade}:d=2.0[a]",
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-t",
            f"{duration:.2f}",
            "-pix_fmt",
            "yuv420p",
            str(dest),
        ],
        check=True,
    )
    print("wrote", dest, f"({duration:.1f}s)")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(SRC)
    print(f"source {SRC.name} · {duration:.1f}s")

    hits = detect_face_times(SRC)
    face_ranges = hits_to_ranges(hits, PAD, duration)
    drop = merge_ranges([SKIP, *face_ranges])
    keep = invert_ranges(drop, duration)

    report = {
        "duration": duration,
        "forced_skip": list(SKIP),
        "face_hits": hits,
        "face_ranges": face_ranges,
        "drop": drop,
        "keep": keep,
        "kept_seconds": sum(b - a for a, b in keep),
    }
    FACE_REPORT.write_text(json.dumps(report, indent=2))
    print("drop ranges:", drop)
    print(f"kept ~{report['kept_seconds']:.1f}s of {duration:.1f}s · report {FACE_REPORT}")

    cut_and_concat(SRC, keep, CLEAN_MP4)
    mux_fb(CLEAN_MP4, FB_MP4)


if __name__ == "__main__":
    main()
