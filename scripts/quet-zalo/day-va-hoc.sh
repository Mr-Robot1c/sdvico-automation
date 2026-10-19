#!/bin/bash
# day-va-hoc.sh — bước sau khi phiên Claude quét Zalo xong (19/10/2026, Mac mini):
#   1. gộp file quét (kho/quet) vào kho tổng, tách tin mới thành Zalo/zalo-tin-<ngày>-<nhóm>.md
#   2. đẩy Zalo/ lên bucket kho-tri-thuc-noi-bo/zalo/
#   3. AI Data 1 tóm tắt file mới bằng Gemma trên máy (Ollama), lỗi thì lùi Gemini flash-lite
#   4. file đã đẩy và học xong chuyển sang da-day/, lần sau không đẩy lại
#   5. ghép thành DATA/drive/zalo-<ngày giờ>.md, xoá bản lẻ
#   6. day-len-drive.mjs đẩy file đó lên Google Drive (riêng tư) rồi xoá bản trên máy
# Chạy: bash scripts/quet-zalo/day-va-hoc.sh   (cần Ollama đang chạy + model sdvico-gemma, .env ở gốc repo)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="${ZALO_DATA_DIR:-$HOME/Desktop/SDVICO/ZALO-Data}"
export ZALO_DATA_DIR="$DATA"
export MKT_MODEL_DATA1="${MKT_MODEL_DATA1:-ollama:sdvico-gemma}"
LOG="$DATA/nhat-ky.log"
mkdir -p "$DATA/Zalo" "$DATA/da-day"
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M') day-va-hoc ==="

node "$REPO/scripts/quet-zalo/gop-zalo.mjs" gop

if ! ls "$DATA/Zalo"/zalo-tin-*.md >/dev/null 2>&1; then echo "Không có tin mới, dừng."; exit 0; fi

node "$REPO/packages/marketing/src/upload-zalo-to-bucket.mjs" "$DATA/Zalo"
node "$REPO/apps/approval-ui/scripts/run-knowledge-now.mjs" --only-internal

mv "$DATA/Zalo"/zalo-tin-*.md "$DATA/da-day/"
# 5. ghép thành một file trong DATA/drive cho phiên Claude đẩy lên Google Drive, xoá bản trên máy, cắt kho tổng 30 ngày
node "$REPO/scripts/quet-zalo/gop-zalo.mjs" dong-goi
# 6. đẩy lên Google Drive (riêng tư) rồi xoá bản trên máy; chưa cấu hình Drive thì giữ file, lần sau đẩy lại
node "$REPO/scripts/quet-zalo/day-len-drive.mjs"
echo "Xong: đã đẩy bucket, học, và đẩy Drive"
