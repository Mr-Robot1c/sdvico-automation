# -*- coding: utf-8 -*-
r"""SDVICO local TTS server — engine VieNeu-TTS v3 Turbo (pnnbao-ump, Apache 2.0).

Thay engine F5-TTS (local-tts-server.py) sau khi user 28/8 chê giọng F5 clone Leda
"đơ như edge". VieNeu v3: chuyên tiếng Việt, 21 giọng preset 3 miền, 48 kHz,
chạy ONNX trên CPU nhanh hơn realtime (không chiếm VRAM của việc dựng video).

Cùng contract HTTP với server cũ nên build-video.mjs không đổi gì:
  GET  /health -> {"ok": true, ...}
  POST /tts    {"text": "..."} -> audio/wav

Cài đặt trên máy chủ (đã làm 28/8):
  D:\Python\python.exe -m venv C:\Users\ADMIN\sdvico-voice\vieneu-venv
  vieneu-venv\Scripts\python.exe -m pip install vieneu flask
Chạy qua start-server.bat (Startup folder gọi sdvico-voice-server.vbs).

Đổi giọng: sửa VOICE bên dưới hoặc đặt env SDVICO_TTS_VOICE trước khi chạy.
Giọng nữ: Thùy Dung/Kim Thanh/Mỹ Duyên/Thục Đoan (Nam), Trúc Ly/Ngọc Linh/
Đoan Trang/Mai Anh/Quỳnh Anh/Ngọc Huyền (Bắc), Ngọc Trân (Trung).
"""
import io
import os
import threading

import soundfile as sf
from flask import Flask, jsonify, request, Response

VOICE = os.environ.get("SDVICO_TTS_VOICE", "Mỹ Duyên")  # user chốt 28/8: "thích giọng này nhất"
PORT = int(os.environ.get("SDVICO_TTS_PORT", "8199"))
SAMPLE_RATE = 48000
# User 28/8: "điều chỉnh cho nó đọc cảm xúc lên xuống". temperature mặc định 0.8 của VieNeu
# đọc hơi đều; 1.0 cho ngữ điệu lên xuống rõ hơn mà chưa sinh artifact. Chỉnh qua env nếu cần.
TEMPERATURE = float(os.environ.get("SDVICO_TTS_TEMP", "1.0"))
TOP_P = float(os.environ.get("SDVICO_TTS_TOP_P", "0.95"))

print(f"[vieneu] dang nap model (giong: {VOICE})...", flush=True)
from vieneu import Vieneu  # noqa: E402 — import sau print để log sớm khi khởi động chậm

tts = Vieneu()  # v3turbo, ONNX CPU
tts.infer("Khởi động.", voice=VOICE)  # warm-up + fail sớm nếu tên giọng sai
print("[vieneu] san sang", flush=True)

app = Flask(__name__)
lock = threading.Lock()  # 1 infer mỗi lúc, tránh tranh CPU khi Watcher gọi dồn


@app.get("/health")
def health():
    return jsonify({"ok": True, "engine": "vieneu-v3-turbo", "voice": VOICE, "temperature": TEMPERATURE, "model": "pnnbao-ump/VieNeu-TTS-v3-Turbo"})


@app.post("/tts")
def tts_route():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip()
    if not text:
        return jsonify({"ok": False, "error": "thieu text"}), 400
    # 28/8 (user: "thêm biểu cảm cho từng loại bài để không 1 màu"): caller được chỉnh
    # temperature/top_p/voice theo TỪNG lần gọi (build-video map theo loại bài). Kẹp biên
    # để giá trị lạ không phá giọng; sai kiểu thì rơi về mặc định.
    try:
        temp = min(1.3, max(0.6, float(data.get("temperature") or TEMPERATURE)))
    except (TypeError, ValueError):
        temp = TEMPERATURE
    try:
        top_p = min(1.0, max(0.5, float(data.get("top_p") or TOP_P)))
    except (TypeError, ValueError):
        top_p = TOP_P
    voice = str(data.get("voice") or VOICE)
    try:
        tts.get_preset_voice(voice)  # tên giọng lạ -> rơi về giọng mặc định, không 500
    except Exception:
        voice = VOICE
    with lock:
        wav = tts.infer(text, voice=voice, temperature=temp, top_p=top_p)
    buf = io.BytesIO()
    sf.write(buf, wav, SAMPLE_RATE, format="WAV")
    return Response(buf.getvalue(), mimetype="audio/wav")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, threaded=True)
