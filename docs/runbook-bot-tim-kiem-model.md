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
