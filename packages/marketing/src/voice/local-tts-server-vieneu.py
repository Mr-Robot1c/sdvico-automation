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

import numpy as np
import soundfile as sf
from flask import Flask, jsonify, request, Response

VOICE = os.environ.get("SDVICO_TTS_VOICE", "Mỹ Duyên")  # user chốt 28/8: "thích giọng này nhất"
PORT = int(os.environ.get("SDVICO_TTS_PORT", "8199"))
SAMPLE_RATE = 48000
# User 28/8: "điều chỉnh cho nó đọc cảm xúc lên xuống". temperature mặc định 0.8 của VieNeu
# đọc hơi đều; 1.0 cho ngữ điệu lên xuống rõ hơn mà chưa sinh artifact. Chỉnh qua env nếu cần.
TEMPERATURE = float(os.environ.get("SDVICO_TTS_TEMP", "1.0"))
TOP_P = float(os.environ.get("SDVICO_TTS_TOP_P", "0.95"))
# 28/8 tối: user thử nhanh 10% (librosa time_stretch) nhưng chê "rè và dở" -> mặc định 1.0
# (tốc độ gốc, không qua time_stretch). Cơ chế giữ lại, chỉnh env/"speed" từng lần nếu cần.
SPEED = float(os.environ.get("SDVICO_TTS_SPEED", "1.0"))
# 29/8 (user: "giọng cứ bị lặp / mỗi video một giọng"): đường CPU của VieNeu lấy mẫu bằng
# np.random.choice — không seed thì mỗi lần gọi (mỗi cảnh, mỗi video) trạng thái ngẫu nhiên
# khác nhau, màu giọng dao động nghe như đổi giọng. SEED CỐ ĐỊNH trước MỖI lần infer để mọi
# cảnh/video cùng một "màu"; phạt lặp nâng 1.2 -> 1.35 để bớt lặp âm cuối câu.
SEED = int(os.environ.get("SDVICO_TTS_SEED", "42"))
REP_PENALTY = float(os.environ.get("SDVICO_TTS_REP_PENALTY", "1.35"))

print(f"[vieneu] dang nap model (giong: {VOICE})...", flush=True)
from vieneu import Vieneu  # noqa: E402 — import sau print để log sớm khi khởi động chậm

tts = Vieneu()  # v3turbo, ONNX CPU
tts.infer("Khởi động.", voice=VOICE)  # warm-up + fail sớm nếu tên giọng sai
print("[vieneu] san sang", flush=True)

app = Flask(__name__)
lock = threading.Lock()  # 1 infer mỗi lúc, tránh tranh CPU khi Watcher gọi dồn


@app.get("/health")
def health():
    return jsonify({"ok": True, "engine": "vieneu-v3-turbo", "voice": VOICE, "temperature": TEMPERATURE, "speed": SPEED, "model": "pnnbao-ump/VieNeu-TTS-v3-Turbo"})


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
        # 29/8: trần hạ 1.3 -> 1.0 — trên 1.0 giọng dao động mạnh giữa các lần gọi (nghe như
        # đổi giọng giữa các cảnh/video) và dễ lặp âm.
        temp = min(1.0, max(0.6, float(data.get("temperature") or TEMPERATURE)))
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
    try:
        speed = min(1.4, max(0.8, float(data.get("speed") or SPEED)))
    except (TypeError, ValueError):
        speed = SPEED
    try:
        seed = int(data.get("seed") or SEED)  # per-request để thử/chọn seed mở đầu sạch
    except (TypeError, ValueError):
        seed = SEED
    with lock:
        np.random.seed(seed)  # cùng seed mọi lần gọi -> màu giọng nhất quán giữa cảnh/video
        wav = tts.infer(text, voice=voice, temperature=temp, top_p=top_p, repetition_penalty=REP_PENALTY)
    # 29/8 (user: "vào phải mất 1-2s mới chịu đọc"): model hay nhả ~0,5s câm ở đầu (đo được
    # 0,46s), vào video cộng dồn nghe thành 1-2 giây chết. Cắt lặng 2 đầu rồi đệm lại 0,12s
    # cho tự nhiên. top_db 32: chỉ coi là lặng khi thật sự câm, không cắt phụ âm nhẹ.
    import librosa
    wav = np.asarray(wav, dtype="float32")
    wav, _ = librosa.effects.trim(wav, top_db=32)
    pad = np.zeros(int(0.12 * SAMPLE_RATE), dtype="float32")
    wav = np.concatenate([pad, wav, pad])
    if abs(speed - 1.0) > 0.01:
        wav = librosa.effects.time_stretch(wav, rate=speed)
    buf = io.BytesIO()
    sf.write(buf, wav, SAMPLE_RATE, format="WAV")
    return Response(buf.getvalue(), mimetype="audio/wav")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, threaded=True)
