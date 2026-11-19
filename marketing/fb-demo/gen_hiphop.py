#!/usr/bin/env python3
"""Instrumental hip-hop bed for FB demo (~160s) — kick/snare/hats + 808 bass."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parent
OUT_WAV = ROOT / "audio" / "hiphop.wav"
OUT_MP3 = ROOT / "audio" / "hiphop.mp3"
SR = 44100
DUR = 160.0
BPM = 92.0


def env_exp(n: int, decay: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (SR * decay))


def kick(n: int) -> np.ndarray:
    t = np.arange(n) / SR
    # pitch sweep + click
    freq = 150 * np.exp(-t * 28) + 42
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    click = np.sin(2 * np.pi * 1800 * t) * env_exp(n, 0.008) * 0.35
    return (body * env_exp(n, 0.22) + click) * 0.95


def snare(n: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    noise = noise / (np.max(np.abs(noise)) + 1e-9)
    tone = np.sin(2 * np.pi * 190 * t) * env_exp(n, 0.08)
    return (0.55 * noise * env_exp(n, 0.12) + 0.45 * tone) * 0.72


def hat(n: int, rng: np.random.Generator, open_: bool = False) -> np.ndarray:
    noise = rng.normal(0, 1, n)
    # crude highpass
    noise = np.diff(np.concatenate([[0.0], noise]))
    noise = noise / (np.max(np.abs(noise)) + 1e-9)
    decay = 0.18 if open_ else 0.035
    return noise * env_exp(n, decay) * (0.22 if open_ else 0.16)


def bass_note(freq: float, n: int) -> np.ndarray:
    t = np.arange(n) / SR
    # 808-ish sine with soft square edge
    fund = np.sin(2 * np.pi * freq * t)
    edge = np.tanh(2.2 * fund)
    return edge * env_exp(n, 0.55) * 0.55


def stab(freq: float, n: int) -> np.ndarray:
    t = np.arange(n) / SR
    wave_ = (
        0.55 * np.sin(2 * np.pi * freq * t)
        + 0.28 * np.sin(2 * np.pi * freq * 2 * t)
        + 0.12 * np.sin(2 * np.pi * freq * 3 * t)
    )
    return wave_ * env_exp(n, 0.28) * 0.18


def place(mix: np.ndarray, sample: np.ndarray, at: int) -> None:
    end = min(len(mix), at + len(sample))
    mix[at:end] += sample[: end - at]


def main() -> None:
    n = int(DUR * SR)
    mix = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(42)

    beat = 60.0 / BPM
    bar = beat * 4
    # Am minor-ish 808 roots (Hz)
    roots = [55.00, 65.41, 73.42, 82.41]  # A1 D2 E2 F2-ish cycle
    stab_freqs = [220.00, 261.63, 293.66, 329.63]

    t0 = 0.0
    bar_i = 0
    while t0 < DUR - 0.5:
        root = roots[bar_i % len(roots)]
        stf = stab_freqs[bar_i % len(stab_freqs)]
        # variation every 4 bars: denser hats / open hat on 3
        dense = (bar_i % 4) == 3

        for step in range(16):  # 16th notes
            t_step = t0 + step * (beat / 4)
            at = int(t_step * SR)
            if at >= n:
                break

            # kick on 1 and 3 (+ occasional ghost)
            if step in (0, 8) or (dense and step == 6):
                place(mix, kick(int(0.45 * SR)), at)
            if step == 4 and (bar_i % 2 == 1):
                place(mix, kick(int(0.28 * SR)) * 0.55, at)

            # snare / clap on 2 and 4
            if step in (4, 12):
                place(mix, snare(int(0.35 * SR), rng), at)

            # closed hats on 8ths; open on offbeat when dense
            if step % 2 == 0:
                place(mix, hat(int(0.12 * SR), rng, open_=False), at)
            if dense and step in (3, 7, 11, 15):
                place(mix, hat(int(0.22 * SR), rng, open_=True) * 0.85, at)
            elif step % 4 == 2:
                place(mix, hat(int(0.08 * SR), rng, open_=False) * 0.7, at)

        # bass on downbeats
        for bstep in (0, 4, 8, 12):
            at = int((t0 + bstep * (beat / 4)) * SR)
            note_len = int(0.42 * SR) if bstep in (0, 8) else int(0.28 * SR)
            f = root if bstep != 8 else root * (4 / 3)  # brief fifth lift
            place(mix, bass_note(f, note_len), at)

        # sparse stab on bar start + mid
        place(mix, stab(stf, int(0.35 * SR)), int(t0 * SR))
        if bar_i % 2 == 0:
            place(mix, stab(stf * 1.5, int(0.22 * SR)) * 0.7, int((t0 + beat * 2) * SR))

        t0 += bar
        bar_i += 1

    # soft vinyl-ish hiss (very low)
    hiss = rng.normal(0, 1, n)
    hiss = np.diff(np.concatenate([[0.0], hiss]))
    hiss = hiss / (np.max(np.abs(hiss)) + 1e-9)
    mix += 0.018 * hiss

    peak = np.max(np.abs(mix)) + 1e-9
    mix = mix / peak * 0.88

    fade = int(1.8 * SR)
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
