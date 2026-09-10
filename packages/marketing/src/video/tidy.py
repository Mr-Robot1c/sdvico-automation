"""Don mot khuc giong doc VieNeu (WAV) truoc khi ghep: cat lang 2 dau, nen khoang lang ben trong,
mo dan hai dau, va do cao do trung vi (f0) de build-video.mjs chuan hoa ve moc chung.

Vi sao khong dung silenceremove cua ffmpeg (10/9, Thanh nghe "tach tach tach"): ban ffmpeg dong goi
(2018) khi nen lang giua khuc (stop_periods=-1) bat tat lien tuc quanh nguong tren tieng on nen, bam
song thanh tung manh cach nhau ~40 ms -> chuoi tieng tach deu. O day: quyet dinh lang/tieng theo
khung 10 ms co DO TRE (lang phai keo dai >= 80 ms moi tinh), moi cho cat deu mo dan cheo 10 ms.

Goi:  python tidy.py <in.wav> <out.wav> [--thresh -40] [--maxgap 0.25] [--fade 0.015]
In ra 1 dong JSON: {"f0": Hz, "n": so khung co tieng, "dur": giay, "cuts": so cho cat}.
Chi can numpy. WAV vao/ra: PCM 16-bit, giu sample rate goc; nhieu kenh thi tron mono.
"""
import argparse
import json
import sys
import wave

import numpy as np


def load(path):
    w = wave.open(path)
    sr = w.getframerate()
    ch = w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return sr, x


def save(path, sr, x):
    x = np.clip(x, -1.0, 1.0)
    w = wave.open(path, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((x * 32767.0).astype(np.int16).tobytes())
    w.close()


def f0_median(x, sr, fmin=120, fmax=400):
    win = int(0.04 * sr)
    hop = int(0.02 * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    vals = []
    for s in range(0, len(x) - win, hop):
        fr = x[s:s + win]
        if np.sqrt(np.mean(fr ** 2)) < 0.03:
            continue
        fr = fr - fr.mean()
        ac = np.correlate(fr, fr, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        if seg.size == 0:
            continue
        k = int(np.argmax(seg)) + lo
        if ac[k] / ac[0] > 0.5:
            vals.append(sr / k)
    if not vals:
        return 0.0, 0
    return float(np.median(vals)), len(vals)


def voiced_mask(x, sr, thresh_db, frame=0.01, min_sil=0.08):
    """True o khung co tieng. Khung 10 ms theo RMS; doan lang ngan hon min_sil coi nhu tieng."""
    n = int(frame * sr)
    nf = len(x) // n
    if nf == 0:
        return np.ones(0, dtype=bool)
    rms = np.sqrt(np.mean(x[:nf * n].reshape(nf, n) ** 2, axis=1))
    db = 20 * np.log10(rms + 1e-9)
    v = db > thresh_db
    # do tre: lap doan lang ngan (< min_sil) thanh tieng de khong bam
    k = int(round(min_sil / frame))
    i = 0
    while i < nf:
        if not v[i]:
            j = i
            while j < nf and not v[j]:
                j += 1
            if j - i < k and i > 0 and j < nf:
                v[i:j] = True
            i = j
        else:
            i += 1
    return v


def crossfade_join(a, b, sr, dur=0.01):
    m = min(int(dur * sr), len(a), len(b))
    if m <= 0:
        return np.concatenate([a, b])
    ramp = np.linspace(0.0, 1.0, m, dtype=np.float32)
    mid = a[-m:] * (1 - ramp) + b[:m] * ramp
    return np.concatenate([a[:-m], mid, b[m:]])


def tidy(x, sr, thresh_db=-40.0, maxgap=0.25, fade=0.015, frame=0.01):
    n = int(frame * sr)
    v = voiced_mask(x, sr, thresh_db, frame)
    if v.size == 0 or not v.any():
        return x, 0
    first = int(np.argmax(v))
    last = int(len(v) - np.argmax(v[::-1]))  # khung sau khung co tieng cuoi
    # giu 1 khung (10 ms) lang moi dau roi mo dan
    s0 = max(0, (first - 1) * n)
    s1 = min(len(x), (last + 1) * n)
    x = x[s0:s1]
    v = v[max(0, first - 1):min(len(v), last + 1)]
    # nen khoang lang ben trong dai hon maxgap: giu maxgap/2 dau + maxgap/2 cuoi, noi mo dan cheo
    keep = int(maxgap * sr / 2)
    out = None
    cuts = 0
    i = 0
    seg_start = 0
    nf = len(v)
    while i < nf:
        if not v[i]:
            j = i
            while j < nf and not v[j]:
                j += 1
            gap = (j - i) * n
            if gap > 2 * keep + int(0.02 * sr) and i > 0 and j < nf:
                a = x[seg_start:i * n + keep]
                out = a if out is None else crossfade_join(out, a, sr)
                seg_start = j * n - keep
                cuts += 1
            i = j
        else:
            i += 1
    tail = x[seg_start:]
    out = tail if out is None else crossfade_join(out, tail, sr)
    # mo dan hai dau
    m = min(int(fade * sr), len(out) // 2)
    if m > 0:
        ramp = np.linspace(0.0, 1.0, m, dtype=np.float32)
        out[:m] *= ramp
        out[-m:] *= ramp[::-1]
    return out, cuts


def main():
    p = argparse.ArgumentParser()
    p.add_argument("inp")
    p.add_argument("out")
    p.add_argument("--thresh", type=float, default=-40.0)
    p.add_argument("--maxgap", type=float, default=0.25)
    p.add_argument("--fade", type=float, default=0.015)
    a = p.parse_args()
    try:
        sr, x = load(a.inp)
        y, cuts = tidy(x, sr, a.thresh, a.maxgap, a.fade)
        save(a.out, sr, y)
        f0, nv = f0_median(y, sr)
        print(json.dumps({"f0": round(f0, 1), "n": nv, "dur": round(len(y) / sr, 3), "cuts": cuts}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"f0": 0, "n": 0, "error": str(e)[:200]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
