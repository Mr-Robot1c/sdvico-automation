"""Canh phụ đề tiếng Việt bằng faster-whisper (GPU) -> file SRT.

Dùng:
  python subtitle.py --audio narration.mp3 --out sub.srt --model medium --prompt "S-Tracking, Thuraya..."

Chạy GPU nếu có (device=cuda, float16), không có thì rớt về CPU (int8).
initial_prompt nạp từ điển thuật ngữ để nghe đúng tên riêng.
In JSON kết quả ra stdout.
"""
import argparse
import glob
import json
import os
import sys


def add_cuda_dll_dirs() -> None:
    """Windows: nạp thư mục DLL của gói nvidia-*-cu12 để ctranslate2 tìm được cublas/cudnn."""
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return
    for base in sys.path:
        for d in glob.glob(os.path.join(base, "nvidia", "*", "bin")):
            try:
                os.add_dll_directory(d)
            except OSError:
                pass


def fmt_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="medium")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--lang", default="vi")
    args = ap.parse_args()

    add_cuda_dll_dirs()
    from faster_whisper import WhisperModel

    def transcribe_on(device, compute):
        model = WhisperModel(args.model, device=device, compute_type=compute)
        segments, info = model.transcribe(
            args.audio,
            language=args.lang,
            initial_prompt=args.prompt or None,
            beam_size=5,
            vad_filter=True,
        )
        return list(segments), info  # materialize ở đây để lỗi CUDA nổ trong try

    want_gpu = False
    try:
        import torch  # noqa: F401
        want_gpu = torch.cuda.is_available()
    except Exception:  # noqa: BLE001
        want_gpu = False

    device, compute = ("cuda", "float16") if want_gpu else ("cpu", "int8")
    try:
        segs, info = transcribe_on(device, compute)
    except Exception as e:  # noqa: BLE001 - GPU thiếu lib CUDA 12 thì rớt CPU
        if device != "cpu":
            device, compute = "cpu", "int8"
            segs, info = transcribe_on(device, compute)
        else:
            raise e

    lines = []
    count = 0
    for seg in segs:
        text = (seg.text or "").strip()
        if not text:
            continue
        count += 1
        lines.append(str(count))
        lines.append(f"{fmt_ts(seg.start)} --> {fmt_ts(seg.end)}")
        lines.append(text)
        lines.append("")

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(json.dumps({
        "ok": True, "out": args.out, "segments": count,
        "device": device, "compute": compute, "lang": info.language,
    }), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
