#!/usr/bin/env python3
"""Soothy continuous pad with bright high-bit shimmer (~160s)."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parent
OUT_WAV = ROOT / "audio" / "soothy-bits.wav"
OUT_MP3 = ROOT / "audio" / "soothy-bits.mp3"
SR = 44100
DUR = 160.0


def main() -> None:
    n = int(DUR * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)

    # warm continuous pads (no hard loops)
    mix = np.zeros(n, dtype=np.float64)
    roots = [130.81, 164.81, 196.00, 220.00, 261.63]  # C3–C4-ish
    for i, f0 in enumerate(roots):
        phase = rng.uniform(0, 2 * np.pi)
        slow = 0.55 + 0.45 * np.sin(2 * np.pi * (0.03 + 0.01 * i) * t + phase)
        mix += 0.055 * slow * np.sin(2 * np.pi * f0 * t + phase)
        mix += 0.028 * slow * np.sin(2 * np.pi * f0 * 1.5 * t + phase * 0.7)
        mix += 0.018 * slow * np.sin(2 * np.pi * f0 * 2.0 * t + phase * 1.3)

    # soft sub bed
    mix += 0.04 * np.sin(2 * np.pi * 55 * t) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.05 * t))

    # continuous high bits / shimmer (bright, not percussive drops)
    shimmer = np.zeros(n, dtype=np.float64)
    for k in range(18):
        f = float(rng.uniform(2400, 7800))
        amp = float(rng.uniform(0.004, 0.012))
        beat = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(0.08, 0.35) * t + rng.uniform(0, 6))
        # mild FM for “bit” texture
        mod = np.sin(2 * np.pi * rng.uniform(3, 11) * t)
        shimmer += amp * beat * np.sin(2 * np.pi * f * t + 0.35 * mod)

    # airy noise veil (highpassed-ish via diff)
    noise = rng.normal(0, 1, n)
    noise = np.diff(np.concatenate([[0.0], noise]))
    noise = noise / (np.max(np.abs(noise)) + 1e-9)
    # smooth envelope so it stays continuous
    veil = 0.012 * noise * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t))

    mix = mix + shimmer + veil
    peak = np.max(np.abs(mix)) + 1e-9
    mix = mix / peak * 0.82

    fade = int(2.0 * SR)
    mix[:fade] *= np.linspace(0, 1, fade)
    mix[-fade:] *= np.linspace(1, 0, fade)

    OUT_WAV.parent.mkdir(parents=True, exist_ok=True)
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(str(OUT_WAV), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-i", str(OUT_WAV), "-codec:a", "libmp3lame", "-q:a", "3", str(OUT_MP3)],
        check=True,
        capture_output=True,
    )
    print("wrote", OUT_MP3)


if __name__ == "__main__":
    main()
