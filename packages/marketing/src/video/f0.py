"""Do cao do trung vi (f0, Hz) cua mot file WAV mono 16-bit bang tu tuong quan.

Dung cho buoc chuan hoa cao do tung cau (build-video.mjs, 10/9): VieNeu doc moi cau mot lan goi,
cao do lech 220 toi 260 Hz giua cac cau nen nghe "moi cau mot tone". Node goi:
    python f0.py <wav>
In ra 1 dong JSON: {"f0": <Hz>, "n": <so khung co tieng>}. f0 = 0 khi khong do duoc.
Chi can numpy (CI da co qua librosa; may local co numpy). Khong dung librosa de khoi nang.
"""
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


if __name__ == "__main__":
    try:
        sr, x = load(sys.argv[1])
        f0, n = f0_median(x, sr)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"f0": 0, "n": 0, "error": str(e)[:200]}))
        sys.exit(0)
    print(json.dumps({"f0": round(f0, 1), "n": n}))
