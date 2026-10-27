"""Synthesize the demo's sound effects, so the video carries no third-party SFX.

whoosh.wav  airy swept-noise pass for scene transitions (stereo pan L -> R)
whoosh_soft.wav  quieter, shorter variant for small motions
pop.wav     soft bubble pop for text and cards landing
click.wav   crisp mouse click
chime.wav   bright two-note "ding" for the logo reveal
success.wav rising three-note tick for a correct caption
wrong.wav   low two-note "uh-oh" buzz for a wrong transcript

usage: make_sfx.py <out_dir>
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def write(name, y):
    y = y / (np.abs(y).max() + 1e-9) * 0.9
    sf.write(out / name, y.astype(np.float32), SR, subtype="PCM_16")


def whoosh(dur=0.75, lo=250, hi=4200, gain=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # Sweep a band-pass up then down by filtering short overlapping blocks.
    y = np.zeros(n)
    block, hop = 1024, 256
    win = np.hanning(block)
    for s in range(0, n - block, hop):
        k = (s + block / 2) / n
        centre = lo + (hi - lo) * np.sin(np.pi * k) ** 1.5
        sos = butter(2, [max(60, centre * 0.6), min(SR / 2 - 100, centre * 1.6)], btype="band", fs=SR, output="sos")
        y[s:s + block] += sosfilt(sos, noise[s:s + block]) * win
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2.2
    y = y * env * gain
    pan = np.clip(t / dur, 0, 1)
    return np.stack([y * np.cos(pan * np.pi / 2), y * np.sin(pan * np.pi / 2)], 1)


def pop():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 28) + 260
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t * 38)
    return np.stack([y, y], 1)


def click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 2400 * t) * 0.6 + rng.standard_normal(n) * 0.25) * np.exp(-t * 160)
    return np.stack([y, y], 1)


def bell(freq, dur, t0, n):
    t = np.arange(n) / SR - t0
    t = np.where(t < 0, 0, t)
    on = (np.arange(n) / SR >= t0).astype(float)
    y = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t * d)
            for m, a, d in [(1, 1.0, 3.2), (2.0, 0.45, 5.0), (3.01, 0.22, 7.0), (4.2, 0.1, 9.0)])
    return y * on


def chime():
    n = int(1.8 * SR)
    y = bell(1046.5, 1.6, 0.0, n) * 0.8 + bell(1568.0, 1.6, 0.12, n)
    return np.stack([y, y], 1)


def success():
    n = int(0.9 * SR)
    y = bell(784, 0.6, 0, n) * 0.6 + bell(988, 0.6, 0.07, n) * 0.6 + bell(1175, 0.8, 0.14, n) * 0.7
    return np.stack([y, y], 1)


def wrong():
    # Two falling square-ish tones, soft-clipped: an "error" buzz without harshness.
    out = []
    for f, d in [(392, 0.16), (262, 0.30)]:
        t = np.arange(int(d * SR)) / SR
        y = np.tanh(2.2 * np.sin(2 * np.pi * f * t)) * 0.6 + 0.25 * np.sin(2 * np.pi * f * 2 * t)
        env = np.minimum(1, t / 0.008) * np.exp(-t / (d * 0.7))
        out += [y * env, np.zeros(int(0.03 * SR))]
    y = np.concatenate(out)
    return sosfilt(butter(4, 3500, "low", fs=SR, output="sos"), y)


write("whoosh.wav", whoosh())
write("whoosh_soft.wav", whoosh(0.5, 400, 3000) * 0.6)
write("pop.wav", pop())
write("click.wav", click())
write("chime.wav", chime())
write("success.wav", success())
write("wrong.wav", wrong())
print("wrote", sorted(p.name for p in out.glob("*.wav")))
