#!/usr/bin/env python3
"""Generate non-repetitive robotic / eco drop bed (~150s)."""

from pathlib import Path

import struct
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parent
OUT_WAV = ROOT / "audio" / "robotic-eco.wav"
OUT_MP3 = ROOT / "audio" / "robotic-eco.mp3"
SR = 44100
DUR = 150.0


def env(n, attack=0.01, release=0.08):
    e = np.ones(n, dtype=np.float64)
    a = min(n // 3, max(1, int(attack * SR)))
    r = min(n // 3, max(1, int(release * SR)))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] = np.linspace(1, 0, r)
    return e


def tone(freq, length, amp=0.12, wave="sine"):
    n = int(length * SR)
    t = np.arange(n) / SR
    if wave == "sine":
        x = np.sin(2 * np.pi * freq * t)
    elif wave == "tri":
        x = 2 * np.abs(2 * ((t * freq) % 1) - 1) - 1
    else:  # soft square
        x = np.tanh(3 * np.sin(2 * np.pi * freq * t))
    return (x * amp * env(n)).astype(np.float64)


def noise_hit(length, amp=0.08, band=None):
    n = int(length * SR)
    x = np.random.randn(n)
    if band:
        # crude one-pole HP / LP via cumulative difference
        for _ in range(band):
            x = np.diff(np.concatenate([[0], x]))
    x = x / (np.max(np.abs(x)) + 1e-9)
    return (x * amp * env(n, 0.002, length * 0.7)).astype(np.float64)


def main() -> None:
    n = int(DUR * SR)
    mix = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(42)

    # evolving eco pad — slow moving fifths, no tight loop
    pad_notes = [110, 146.83, 164.81, 196, 220, 246.94, 293.66]
    t = 0.0
    while t < DUR - 4:
        f = float(rng.choice(pad_notes)) * (1 + 0.01 * rng.normal())
        length = float(rng.uniform(3.5, 7.5))
        amp = float(rng.uniform(0.035, 0.07))
        seg = tone(f, length, amp=amp, wave="tri")
        # gentle LFO
        lfo = 0.7 + 0.3 * np.sin(2 * np.pi * rng.uniform(0.05, 0.18) * np.arange(len(seg)) / SR)
        seg *= lfo
        i0 = int(t * SR)
        i1 = min(n, i0 + len(seg))
        mix[i0:i1] += seg[: i1 - i0]
        t += rng.uniform(1.8, 3.4)

    # robotic pulse drops — sparse, changing interval
    t = 1.2
    pulse_base = 55.0
    while t < DUR - 1:
        length = float(rng.uniform(0.18, 0.45))
        f = pulse_base * float(rng.choice([1, 1.5, 2, 2.5]))
        hit = tone(f, length, amp=rng.uniform(0.1, 0.18), wave="soft")
        # click layer
        click = noise_hit(0.04, amp=0.06, band=2)
        i0 = int(t * SR)
        for layer in (hit, click):
            i1 = min(n, i0 + len(layer))
            mix[i0:i1] += layer[: i1 - i0]
        # irregular spacing (avoids loop feel)
        t += float(rng.choice([0.75, 1.0, 1.25, 1.5, 2.0, 2.5])) * float(rng.uniform(0.9, 1.15))

    # high robotic ticks — occasional
    t = 0.5
    while t < DUR - 0.5:
        if rng.random() < 0.55:
            tick = tone(float(rng.uniform(1800, 4200)), 0.03, amp=0.025, wave="sine")
            i0 = int(t * SR)
            i1 = min(n, i0 + len(tick))
            mix[i0:i1] += tick[: i1 - i0]
        t += float(rng.uniform(0.4, 1.6))

    # mid eco “drop” whooshes every ~12–20s
    t = 8.0
    while t < DUR - 3:
        length = float(rng.uniform(1.2, 2.2))
        whoosh = noise_hit(length, amp=0.05, band=1)
        # pitch down by resampling-ish: lowpass via moving average
        k = 40
        whoosh = np.convolve(whoosh, np.ones(k) / k, mode="same")
        i0 = int(t * SR)
        i1 = min(n, i0 + len(whoosh))
        mix[i0:i1] += whoosh[: i1 - i0]
        t += float(rng.uniform(12, 20))

    # soft sub bed
    sub_t = np.arange(n) / SR
    sub = 0.04 * np.sin(2 * np.pi * 48 * sub_t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * sub_t))
    mix += sub

    peak = np.max(np.abs(mix)) + 1e-9
    mix = mix / peak * 0.85
    # fade in/out
    fade = int(1.5 * SR)
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
    print("wrote", OUT_MP3, f"{DUR:.0f}s")


if __name__ == "__main__":
    main()
