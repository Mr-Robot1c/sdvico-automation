"""TTS giọng Việt bằng edge-tts. Đọc kịch bản -> file mp3.

Dùng:
  python tts.py --text-file narration.txt --out narration.mp3 --voice vi-VN-NamMinhNeural --rate +0%

Voice giọng Việt: vi-VN-NamMinhNeural (nam), vi-VN-HoaiMyNeural (nữ).
In JSON kết quả ra stdout để node đọc.
"""
import argparse
import asyncio
import json
import sys

import edge_tts


async def synth(text: str, out: str, voice: str, rate: str, volume: str, pitch: str) -> None:
    # edge-tts thỉnh thoảng lỗi mạng/NoAudioReceived -> thử lại vài lần.
    last = None
    for i in range(4):
        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume, pitch=pitch)
            await communicate.save(out)
            import os
            if os.path.getsize(out) > 0:
                return
            last = RuntimeError("file rong")
        except Exception as e:  # noqa: BLE001
            last = e
        await asyncio.sleep(1.5 * (i + 1))
    raise last if last else RuntimeError("tts that bai")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default="vi-VN-HoaiMyNeural")
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--volume", default="+0%")
    ap.add_argument("--pitch", default="+0Hz")
    args = ap.parse_args()

    with open(args.text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        print(json.dumps({"ok": False, "error": "text rong"}), flush=True)
        return 1

    try:
        asyncio.run(synth(text, args.out, args.voice, args.rate, args.volume, args.pitch))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        return 1

    print(json.dumps({"ok": True, "out": args.out, "voice": args.voice, "chars": len(text)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
