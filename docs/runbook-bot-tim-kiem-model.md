# Runbook: Bot hỏi đáp tìm được như Google và đổi model

> 15/9/2026, sếp: "agent trợ lý hỏi đáp chưa thật sự phát huy tác dụng do chưa thể cung cấp được thông tin
> như trên Google (có thể tìm 1 model được không? Model Trung Quốc chẳng hạn)". Thanh chốt làm cả hai.
> Nguyên nhân gốc: bot vẫn là Gemini 3.6 Flash nhưng "tìm Google" (grounding) trên key miễn phí bị Google
> trả 429 ngay lập tức, nên thực tế bot chưa từng tìm được gì. Vấn đề là NGUỒN TÌM, không phải model.

## Đã làm trong code (không cần khoá vẫn chạy như cũ)

1. **API tìm web** (`lib/web-search.ts`): có `TAVILY_API_KEY` (ưu tiên) hoặc `SERPER_API_KEY` thì mỗi câu hỏi
   bot tìm web trước (5 kết quả, 7 giây), nhét vào prompt, trả nguồn cho người xem. Số liệu SDVICO vẫn chỉ
   lấy từ kho hỏi đáp (luật cũ giữ nguyên).
2. **Lớp đổi model** (`lib/hoi-dap-bot.ts`): đặt đủ `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` thì
   model đó (bất kỳ hãng nào theo chuẩn OpenAI: DeepSeek, Qwen, Kimi, OpenAI) chạy đầu tiên, Gemini thành
   dự phòng. `OPENAI_LABEL` là tên hiện ở thẻ AI. `BOT_PROVIDER=gemini` ép về Gemini.
3. Thẻ "AI trợ lý hỏi đáp" ở trang Agent tự ghi model + nguồn tìm đang dùng.

## Bước 1. Đăng ký API tìm web (chọn một)

- **Tavily** (khuyên dùng, trả sẵn nội dung trang, có gói miễn phí 1.000 lượt/tháng): https://tavily.com →
  đăng ký → API key dạng `tvly-...`.
- **Serper** (kết quả Google thô, 2.500 lượt miễn phí, sau đó trả phí): https://serper.dev → API key.

Đặt trên Vercel (Production): `TAVILY_API_KEY=...` hoặc `SERPER_API_KEY=...`. Redeploy.

## Bước 2 (tuỳ chọn). Model Trung Quốc

Ví dụ DeepSeek (rẻ, tiếng Việt ổn): https://platform.deepseek.com → nạp tiền → API key. Vercel:

```
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=deepseek-chat
OPENAI_LABEL=DeepSeek V3
```

Qwen (Alibaba): `OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, `OPENAI_MODEL=qwen-plus`.

Lưu ý điều cấm 6: bot không gửi dữ liệu ứng viên; câu hỏi nội bộ của nhân viên và kho hỏi đáp sẽ đi qua
máy chủ của hãng model đã chọn — sếp cân nhắc trước khi dùng hãng ngoài Google.

## Bước 3. Kiểm tra

Trang Agent → ô Hỏi bot → hỏi "giá dầu diesel hôm nay bao nhiêu" (câu cần web). Trả lời phải có dòng nguồn
ngoài; thẻ AI trợ lý hỏi đáp ghi "tìm web bằng Tavily" (hoặc Serper) và tên model đang dùng. Nhật ký
`run_log` task `mkt.hoi_dap_bot` cột `model` ghi rõ lượt nào dùng gì.

## Chạy bot bằng Gemma trên máy nội bộ (Ollama)

> 19/10/2026: thử bot hỏi đáp bằng Gemma 4 chạy ngay trên máy, câu hỏi và kho không rời máy công ty
> (hợp điều cấm 6 hơn hãng ngoài), không tốn hạn mức Gemini. Chỉ dùng khi chạy approval-ui TRÊN MÁY
> (`npm run dev`): bản trên Vercel không gọi được localhost của máy nội bộ.

Chọn model theo RAM: máy 16 GB dùng `gemma4:12b-it-qat` (tải 7,2 GB). Bản `gemma4:26b` (16 tới 19 GB,
đang dùng cho blog qua Gemini API) cần máy từ 32 GB.

```
brew install ollama && brew services start ollama
ollama pull gemma4:12b-it-qat
printf 'FROM gemma4:12b-it-qat\nPARAMETER num_ctx 32768\n' > Modelfile
ollama create sdvico-gemma -f Modelfile
```

Bước `ollama create` là bắt buộc: cổng chuẩn OpenAI của Ollama không nhận độ dài ngữ cảnh theo từng lượt
gọi, mặc định ngắn sẽ CẮT ngầm kho hỏi đáp (không báo lỗi, bot trả lời như kho trống). Bản `sdvico-gemma`
mở sẵn 32.768 token.

`apps/approval-ui/.env.local`:

```
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=sdvico-gemma
OPENAI_LABEL=Gemma 4 12B (máy nội bộ)
OPENAI_TIMEOUT_MS=120000
OPENAI_REASONING_EFFORT=none
```

- `OPENAI_API_KEY` Ollama không kiểm, đặt chữ bất kỳ cho đủ 3 biến.
- `OPENAI_REASONING_EFFORT=none` tắt chế độ suy nghĩ của Gemma 4. Đo trên MacBook M6 16 GB, kho giả rỗng:
  bật suy nghĩ 97 tới hơn 180 giây một câu, tắt còn 5 tới 13 giây.
- `OPENAI_TIMEOUT_MS` mặc định 25 giây; lượt đầu Ollama nạp model vào RAM mất thêm vài chục giây.
- Gemma hỏng hoặc quá giờ thì bot tự lùi về Gemini như cũ (cần `GEMINI_API_KEY`).

Chưa đo với kho thật (500 dòng hỏi đáp + product_facts): prompt dài hơn nhiều nên sẽ chậm hơn con số trên.
