"""Score + sound design for 《斗破苍穹·续：无尽火域》第一卷 3D 动画 (68 s).

Run from the repo root:  python3 anime/doupo-vol1/audio.py   -> anime/doupo-vol1/out/audio.wav
Timings follow js/timeline.js. D 羽 (minor pentatonic colour), resolving to F major at the end.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lib', 'audio'))
import mgaudio as mg  # noqa: E402
from mgaudio import synth, drums, sfx, pluck, wind, filters  # noqa: E402
from mgaudio.core import SR, Sound, noise_st, breakpoints  # noqa: E402

DUR = 68.0
m = mg.Mix(DUR, bpm=84, anchor=0.0)
m.group('music').level = -20
BEAT = 60 / 84

# ------------------------------------------------------------------ helpers
def bed(dur, color, lo, hi, env, seed, trem=None):
    """Filtered stereo noise bed with breakpoint envelope [(t, gain 0..1), ...]."""
    n = int(dur * SR)
    x = noise_st(n, color, seed=seed, corr=0.3)
    x = filters.bpf(x, lo, hi) if hi else filters.lpf(x, lo)
    e = breakpoints(env, n)
    if trem:
        rate, depth = trem
        tt = np.arange(n) / SR
        e = e * (1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * rate * tt + 0.7 * np.sin(2 * np.pi * 0.3 * tt))))
    return Sound((x * e).astype(np.float32))


def crackle(dur, rate, seed, env):
    r = np.random.default_rng(seed); n = int(dur * SR); y = np.zeros((2, n), np.float32)
    k = int(dur * rate)
    for _ in range(k):
        p = int(r.integers(0, n - 2000)); L = int(r.integers(60, 900)); a = r.uniform(0.2, 1.0)
        burst = r.standard_normal(L) * np.exp(-np.arange(L) / (L / 4)) * a
        ch = r.uniform(0.2, 1.0); y[0, p:p + L] += burst * ch; y[1, p:p + L] += burst * (1.2 - ch)
    y = filters.hpf(y, 1800)
    return Sound(y * breakpoints(env, n))


def pad_seq(track, seq, kind, vel=0.7, attack=0.8, release=1.6):
    for t0, t1, notes in seq:
        track.add(synth.pad(notes, t1 - t0, vel, kind, attack=attack, release=release), t0)


Dm, Dm_lo = [50, 57, 62, 65], [38, 50, 57, 62]
Bb, Bbmaj7, Gm, C, F, A, Eb = [46, 53, 58, 62], [46, 53, 57, 62], [43, 50, 55, 58, 62], [48, 55, 60, 64], [41, 53, 57, 60, 65], [45, 52, 57, 61, 64], [51, 58, 63, 67]
Asus = [45, 52, 57, 62, 64]

# ------------------------------------------------------------------ strings / choir beds
strings = m.track('strings', level=-23, sends={'hall': -8})
pad_seq(strings, [
    (0.0, 6.6, Dm_lo), (6.5, 9.6, Bbmaj7), (9.5, 12.6, Gm),
    (12.5, 14.8, F), (14.7, 17.0, C), (16.9, 19.3, Dm), (19.2, 21.6, Bb),
    (21.5, 23.3, Bb), (23.2, 25.1, F), (25.0, 26.8, Gm), (26.7, 28.6, Asus),
    (28.5, 32.1, Dm_lo), (32.0, 33.5, Bb), (33.4, 34.9, C), (34.8, 36.6, Dm),
    (36.5, 39.0, Eb), (38.9, 41.6, Dm_lo),
    (41.5, 45.1, Dm_lo), (45.0, 49.6, [34, 46, 50, 53, 58]),
    (49.5, 51.0, Dm), (50.9, 52.4, Bb), (52.3, 53.8, C), (53.7, 55.7, A), (55.6, 57.6, Dm_lo),
    (57.5, 59.6, F), (59.5, 61.6, C), (61.5, 63.4, Dm), (63.3, 64.4, Bb), (64.3, 68.0, [41, 53, 60, 65, 69, 72])
], 'strings', vel=0.7)
strings.automate('lpf', [(0, 1400), (12, 2500), (28, 3000), (32, 9000), (36.5, 2500), (45, 2200), (49.5, 11000), (57.5, 6000), (64, 9000), (68, 6000)])
strings.automate('gain', [(0, -4), (12, -1), (28.5, -2), (32, 1.5), (36.5, -2), (41.5, -3), (45, 0), (49.5, 2), (55.6, 2), (57.5, 0), (64.3, 1.5)])

choir = m.track('choir', level=-27, sends={'hall': -6})
pad_seq(choir, [(32.0, 36.6, [62, 65, 69]), (49.5, 55.7, [62, 65, 69, 74]), (55.6, 57.8, [62, 69, 74]), (64.3, 68.0, [65, 69, 72, 77])], 'choir', vel=0.65, attack=0.6)
dark = m.track('dark', level=-28, sends={'hall': -10})
pad_seq(dark, [(6.4, 12.7, [38, 45, 51]), (36.5, 41.6, [38, 44, 51]), (45.0, 49.6, [34, 41, 47])], 'dark', vel=0.7, attack=1.0)
glass = m.track('glass', level=-30, sends={'hall': -6})
pad_seq(glass, [(41.5, 45.2, [74, 81, 86])], 'glass', vel=0.5, attack=1.2)

# ------------------------------------------------------------------ melodies
xiao = m.track('xiao', level=-24, sends={'hall': -7}, pan=-0.05)
xiao.add(wind.wind_line([(0.0, 1.9, 'A4', 0.6, 'slide'), (1.9, 1.0, 'G4', 0.55), (2.9, 1.4, 'F4', 0.6, 'grace'), (4.3, 1.9, 'D4', 0.55, 'fall')], 'xiao', seed=1), 1.0)
xiao.add(wind.wind_line([(0.0, 1.0, 'D5', 0.6), (1.0, 0.6, 'C5', 0.55), (1.6, 1.6, 'A4', 0.6, 'fall')], 'xiao', seed=2), 25.3)

dizi = m.track('dizi', level=-23, sends={'hall': -8}, pan=0.08)
dizi.add(wind.wind_line([(0.0, 0.8, 'F5', 0.6, 'grace'), (0.8, 0.6, 'G5', 0.6), (1.4, 1.1, 'A5', 0.7, 'trill'), (2.5, 0.35, 'C6', 0.6), (2.85, 0.9, 'A5', 0.6, 'fall')], 'dizi', seed=3), 21.7)
dizi.add(wind.wind_line([(0.0, 0.9, 'A5', 0.65, 'slide'), (0.9, 0.55, 'C6', 0.65), (1.45, 1.4, 'D6', 0.75, 'trill'), (2.85, 0.5, 'C6', 0.6), (3.35, 0.5, 'A5', 0.6),
                         (3.85, 0.8, 'G5', 0.6, 'grace'), (4.65, 1.5, 'A5', 0.7, 'fall')], 'dizi', seed=4), 57.9)

gz = m.track('guzheng', level=-22, sends={'hall': -9, 'room': -16}, pan=-0.12)
for t, n, d, orn in [(12.9, 'D5', 2.0, 'rou'), (13.6, 'A5', 2.0, None), (15.1, 'G5', 1.5, None), (15.8, 'F5', 2.2, 'rou'), (17.6, 'D5', 2.5, 'slide_down'),
                     (19.4, 'A4', 1.5, None), (19.9, 'C5', 1.5, None), (20.4, 'D5', 2.5, 'rou')]:
    gz.add(pluck.guzheng(n, d, 0.7, orn=orn), t)
# lotus ostinato: 16ths in D yu over the battle
pool = [62, 65, 67, 69, 72, 74]
t = 49.6; i = 0
while t < 55.5:
    n = pool[[0, 2, 3, 5, 4, 3, 2, 1][i % 8]] + (12 if (i // 16) % 2 else 0)
    gz.add(pluck.guzheng(n, 0.5, 0.55 + 0.15 * ((i % 4) == 0)), t); t += BEAT / 4; i += 1
gl = m.track('gliss', level=-21, sends={'hall': -7})
gl.add(pluck.guzheng_gliss('D4', 'D6', dur=0.7, key='D', mode='yu', vel=0.75), 12.85)
gl.add(pluck.guzheng_gliss('A4', 'A6', dur=0.6, key='F', mode='gong', vel=0.75), 57.75)
gl.add(pluck.guzheng_gliss('F4', 'F6', dur=0.8, key='F', mode='gong', vel=0.85), 64.3)

bass = m.track('bass', level=-22)
t = 45.9
while t < 49.45:
    bass.add(synth.bass(38 if int((t - 45.9) / BEAT) % 4 != 3 else 41, BEAT / 2 * 0.9, 0.8, 'sub'), t); t += BEAT / 2
bass.automate('gain', [(45.9, -8), (49.4, 0)])

# ------------------------------------------------------------------ drums
dr = m.track('drums', level=-19, sends={'hall': -12})
acc = [28.7, 29.45, 30.1, 30.6, 31.0, 31.3, 31.53, 31.7, 31.82, 31.91]
for k, tt in enumerate(acc):
    dr.add(drums.taiko('tanggu' if k > 3 else 'taiko', 0.5 + 0.05 * k), tt)
dr.add(drums.taiko('taiko', 1.0), 32.0); dr.add(drums.gong('chinese', 0.9), 32.02)
t = 32.0 + BEAT * 2
while t < 36.3:
    k = round((t - 32.0) / BEAT) % 4
    dr.add(drums.taiko('dagu' if k == 0 else 'tanggu', 0.8 if k == 0 else 0.5), t); t += BEAT
t = 45.9
while t < 49.4:
    dr.add(drums.taiko('dagu', 0.35 + 0.15 * (t - 45.9) / 3.5), t); t += BEAT
dr.add(drums.taiko('taiko', 1.0), 49.5)
t = 49.5 + BEAT; k = 1
while t < 55.4:
    pat = k % 8
    if pat in (0, 3, 4, 6): dr.add(drums.taiko('taiko' if pat == 0 else 'dagu', 0.85 if pat == 0 else 0.6), t)
    if pat in (2, 6): dr.add(drums.taiko('tanggu', 0.55), t + BEAT / 2)
    if pat == 4: dr.add(drums.bo('nao', 0.5), t)
    t += BEAT / 2 * 2 if pat not in (5, 7) else BEAT; k += 1
roll = [54.3 + 0.7 * (1 - (1 - i / 11) ** 1.6) for i in range(12)]
for i, tt in enumerate(roll): dr.add(drums.taiko('tanggu', 0.4 + 0.04 * i), tt)
dr.add(drums.taiko('taiko', 1.0), 64.3); dr.add(drums.gong('chinese', 0.85), 64.32)
dr.add(drums.taiko('dagu', 0.5), 13.4)

# ------------------------------------------------------------------ ambience beds (sfx group)
m.sfx(bed(13.0, 'pink', 250, 1400, [(0, 0), (1.5, 0.7), (6, 0.6), (6.6, 0.3), (9.5, 0.5), (12.3, 0.4), (13.0, 0)], 11, trem=(0.15, 0.5)), 0.0, gain=-10)
m.sfx(bed(16.5, 'pink', 300, 2600, [(0, 0), (1.0, 0.9), (7.5, 1.0), (8.2, 0.5), (9.0, 0.2), (16.0, 0.05), (16.5, 0)], 12, trem=(0.25, 0.45)), 41.4, gain=-7)
m.sfx(bed(5.2, 'brown', 160, None, [(0, 0), (1.0, 0.8), (4.6, 0.9), (5.2, 0)], 13, trem=(0.9, 0.3)), 36.4, gain=-6)
m.sfx(bed(3.8, 'brown', 380, None, [(0, 0), (1.0, 0.5), (3.4, 1.0), (3.8, 0.2)], 14, trem=(7.0, 0.55)), 45.8, gain=-5)
m.sfx(bed(18.5, 'brown', 900, None, [(0, 0), (0.4, 1.0), (6.0, 0.9), (8.0, 0.7), (10.5, 0.5), (18.5, 0.25)], 15, trem=(0.4, 0.25)), 49.5, gain=-7)
m.sfx(crackle(18.5, 45, 16, [(0, 0), (0.5, 1.0), (8.0, 0.9), (18.0, 0.5), (18.5, 0)]), 49.5, gain=-9)

# ------------------------------------------------------------------ sound design at the cues
m.sfx(sfx.magic(2.4, key='D', mode='minor_pentatonic', up=False), 6.8, gain=-6, verb=-10)
m.sfx(sfx.boom(2.5, f0=38), 9.55, gain=-10)
m.sfx(sfx.sparkle(2.4, density=10, key='D', mode='minor_pentatonic', lo=76, hi=96), 9.9, gain=-10)
m.sfx(sfx.reverse_cymbal(1.0), 12.5, gain=-10)
m.sfx(sfx.shimmer_hit(74), 13.4, gain=-4, verb=-8)
m.sfx(drums.gong('small', 0.6).loud(-18), 13.42, gain=-8)
m.sfx(sfx.impact('soft'), 17.32, gain=-8, verb=-10)
m.sfx(sfx.sparkle(1.8, density=16, key='D', mode='minor_pentatonic'), 19.3, gain=-8)
m.sfx(sfx.whoosh(0.9, 'air', direction=1), 21.5, gain=-9)
m.sfx(sfx.whoosh(0.9, 'air', direction=-1), 25.0, gain=-10)
m.sfx(sfx.whoosh(0.7, 'cloth', direction=0), 25.95, gain=-12)
m.sfx(sfx.reverse_cymbal(1.2), 28.5, gain=-10)
m.sfx(sfx.whoosh(1.0, 'fire', direction=0), 29.5, gain=-4)
m.sfx(sfx.whoosh(1.8, 'fire', direction=1, peak=0.35), 30.4, gain=-1)
m.sfx(sfx.riser(1.9, 'hybrid', note='D3'), 32.0, gain=-5)
m.sfx(sfx.impact('trailer', size=1.2), 32.0, gain=1, verb=-8)
m.sfx(drums.gong('tamtam', 0.9).loud(-18), 32.02, gain=-4)
m.sfx(bed(3.0, 'brown', 120, None, [(0, 0), (0.4, 1.0), (2.2, 0.8), (3.0, 0)], 21, trem=(3.0, 0.4)), 32.1, gain=-5)
m.sfx(sfx.whoosh(1.4, 'air', direction=1, peak=0.5), 35.2, gain=-6)
m.sfx(sfx.whoosh(0.8, 'heavy', direction=0), 36.5, gain=-3)
for tt, d in [(37.4, 1), (38.4, -1), (40.4, 1)]: m.sfx(sfx.whoosh(0.7, 'sci', direction=d), tt, gain=-9)
m.sfx(sfx.impact('metal', size=0.8), 39.15, gain=-3, verb=-8)
m.sfx(sfx.shimmer_hit(81), 39.18, gain=-5, verb=-6)
m.sfx(sfx.reverse_cymbal(1.0), 41.5, gain=-6)
m.sfx(sfx.whoosh(0.9, 'heavy', direction=0), 41.5, gain=-5)
m.sfx(sfx.boom(2.4, f0=34), 45.15, gain=-3)
m.sfx(sfx.whoosh(1.2, 'heavy', direction=0, peak=0.4), 45.3, gain=-5)
m.sfx(sfx.impact('cinematic', size=1.2), 49.5, gain=0, verb=-8)
m.sfx(sfx.whoosh(2.0, 'fire', direction=1, peak=0.25), 49.9, gain=-1)
m.sfx(sfx.boom(2.5, f0=42), 49.52, gain=-4)
m.sfx(sfx.magic(2.4, key='D', mode='minor_pentatonic', up=True), 51.7, gain=-7, verb=-8)
m.sfx(sfx.charge(3.2), 55.0, gain=-8)
m.sfx(sfx.shimmer_hit(86), 53.5, gain=-6, verb=-6)
m.sfx(sfx.whoosh(0.9, 'fire', direction=1, peak=0.4), 55.3, gain=-1)
m.sfx(sfx.impact('trailer', size=1.4), 55.62, gain=2, verb=-6)
m.sfx(sfx.boom(3.0, f0=32), 55.63, gain=-1)
m.sfx(sfx.sub_drop(), 55.64, gain=-4)
m.sfx(drums.gong('tamtam', 1.0).loud(-18), 55.66, gain=-3)
m.sfx(sfx.whoosh(1.0, 'soft', direction=1), 57.5, gain=-10)
m.sfx(sfx.shimmer_hit(77), 64.3, gain=-5, verb=-6)
m.sfx(sfx.sparkle(2.5, density=12, key='F', mode='major_pentatonic'), 64.5, gain=-10)

os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
res = m.export(os.path.join(HERE, 'out', 'audio.wav'), lufs=-14, tp=-1)
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'longest_gap') if k in res})
print('warnings:', res.get('warnings'))
