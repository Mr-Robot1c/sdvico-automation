# local-tts-server.py — TTS server tieng Viet chay tren MAY LOCAL (28/8, sep che giong edge).
#
# Model: zalopay/vietnamese-tts (F5-TTS fine-tune 200h tieng Viet, license CC-BY-4.0 — dung
# thuong mai duoc, ghi cong ZaloPay). Giong tham chieu: ref/leda.wav (sinh 1 lan bang Gemini
# TTS Leda) — F5 zero-shot clone nen giong doc ra RAT GAN Leda, chay hoan toan local.
#
# Contract voi Watcher (build-video.mjs engine 'local', env TTS_LOCAL_URL=http://127.0.0.1:8199):
#   POST /tts  body {"text": "cau tieng Viet"}  -> audio/wav bytes
#   GET  /health                                 -> {"ok": true}
#
# Cai dat (da lam san tren may chu 28/8, ghi lai de dung lai khi doi may):
#   py -m venv C:\Users\ADMIN\sdvico-voice\venv
#   C:\Users\ADMIN\sdvico-voice\venv\Scripts\pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
#   C:\Users\ADMIN\sdvico-voice\venv\Scripts\pip install f5-tts flask
#   Tai model: https://huggingface.co/zalopay/vietnamese-tts (model_1290000.pt + vocab.txt)
#     -> C:\Users\ADMIN\sdvico-voice\model\
#   Ref giong: C:\Users\ADMIN\sdvico-voice\ref\leda.wav + leda.txt (transcript dung cua file)
#   Chay: C:\Users\ADMIN\sdvico-voice\start-server.bat (Task Scheduler bat khi logon)

import io
import os
import sys
import tempfile
import threading

from flask import Flask, jsonify, request

BASE = os.environ.get("SDVICO_VOICE_DIR", r"C:\Users\ADMIN\sdvico-voice")
CKPT = os.path.join(BASE, "model", "model_1290000.pt")
VOCAB = os.path.join(BASE, "model", "vocab.txt")
REF_WAV = os.path.join(BASE, "ref", "leda.wav")
REF_TXT = os.path.join(BASE, "ref", "leda.txt")
PORT = int(os.environ.get("TTS_PORT", "8199"))

with open(REF_TXT, "r", encoding="utf-8") as f:
    REF_TEXT = f.read().strip()

print("[tts] loading F5-TTS model (lan dau mat ~10-30s)...", flush=True)
from f5_tts.api import F5TTS  # noqa: E402

# zalopay checkpoint fine-tune tu F5-TTS Base.
tts = F5TTS(model="F5TTS_Base", ckpt_file=CKPT, vocab_file=VOCAB)
print("[tts] model loaded. device:", getattr(tts, "device", "?"), flush=True)

app = Flask(__name__)
lock = threading.Lock()  # GPU 8GB — moi luc 1 request infer


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": "zalopay/vietnamese-tts", "ref": os.path.basename(REF_WAV)})


@app.post("/tts")
def synth():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "thieu text"}), 400
    # F5 vocab tieng Viet train dang lowercase (theo README model) — ha chu cho khop vocab.
    gen_text = text.lower()
    with lock:
        with tempfile.TemporaryDirectory() as td:
            out = os.path.join(td, "out.wav")
            tts.infer(ref_file=REF_WAV, ref_text=REF_TEXT, gen_text=gen_text, file_wave=out)
            with open(out, "rb") as f:
                wav = f.read()
    return app.response_class(wav, mimetype="audio/wav")


if __name__ == "__main__":
    print(f"[tts] serving on http://127.0.0.1:{PORT}", flush=True)
    app.run(host="127.0.0.1", port=PORT, threaded=True)
