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

## Blog, content, bài bán bằng model trên máy (chưa dùng được trên máy 16 GB)

`lib/gen/llm-client.mjs` nhận tên model dạng `ollama:<tên>`, đặt qua biến sẵn có:

```
MKT_MODEL_BLOG=ollama:sdvico-gemma
MKT_MODEL_CONTENT=ollama:sdvico-gemma
MKT_MODEL_SOCIAL=ollama:sdvico-gemma
```

Lượt gọi đi qua Ollama (`MKT_OLLAMA_URL`, mặc định `http://localhost:11434/v1`), dùng chung đường vá Gemma:
lọc JSON, thử lại, lỗi thì lùi flash-lite. Ollama chưa bật thì lùi ngay, không thử lại. `MKT_OLLAMA_REASONING`
mặc định `none` (tắt suy nghĩ); đặt rỗng để không gửi. Vẫn cần `GEMINI_API_KEY` thật: blog chỉ gọi model
khi có khóa, và lượt dự phòng chạy trên Gemini. Chỉ dùng với `scripts/rotate-now.mjs` chạy trên máy;
cron Vercel và GitHub Actions không thấy localhost.

Đo 19/10/2026 trên MacBook M6 16 GB, `gemma4:12b-it-qat`, đã tắt suy nghĩ, quỹ thời gian nâng lên 400 giây:

| Việc | Thời gian | Kết quả |
|---|---|---|
| Bài bán SEA-40 (Facebook) | 114 giây | Có bài, nhưng lẫn chữ Thái, dính chữ, câu kêu bình luận sai nguyên văn, thừa câu hỏi mở cuối bài (luật 11/9 cấm) |
| Blog 3 định dạng | quá 300 giây | Chưa xong, bị cắt, lùi dự phòng |

So với Gemma 4 26B trên Gemini API (khoảng 16 tới 107 giây, chấm mù 6,4): bản 12B trên máy 16 GB vừa chậm hơn
vừa sai luật nhiều hơn, KHÔNG thay được. Muốn chạy viết bài trên máy thì cần máy từ 32 GB để chạy
`gemma4:26b`, đo lại bảng trên rồi mới đổi biến. Bot hỏi đáp (mục trên) thì chạy được trên máy 16 GB vì
câu trả lời ngắn.

## Bot hỏi đáp với kho thật (đo 19/10/2026)

Kho thật 21 dòng hỏi đáp + 126 thông số, prompt khoảng 16.000 token, Gemma 4 12B trên máy, chỉ đọc. Câu đầu
62 tới 78 giây (nạp kho), các câu sau 4 tới 19 giây. Đã sửa hai lỗi đo được:

- Hỏi trả góp (kho không có), bot khẳng định "chưa có chính sách trả góp". Nay luật 2 cấm tự trả lời có hay
  không cho chính sách kho không nhắc tới, và máy chèn câu "Kho SDVICO chưa có thông tin này" khi model báo
  found = false mà không nói.
- Bot bê giọng chốt đơn của mục E ("Anh cho em hỏi tàu mình...") vào câu trả lời cho nhân viên. Nay luật 8
  (câu đầu là đáp án, như ô trả lời của Google) và luật 9 (người hỏi là nhân viên), máy cắt câu hỏi ngược cuối bài.

Muốn bot tìm tin mới như Google thì vẫn cần `TAVILY_API_KEY` hoặc `SERPER_API_KEY` (Bước 1 ở trên).

## AI DATA 1 trên máy nội bộ (đã bật 19/10/2026)

`scripts/day-kho-zalo*.bat` đặt `MKT_MODEL_DATA1=ollama:sdvico-gemma` trước khi gọi
`run-knowledge-now.mjs --only-internal`. Máy chưa cài Ollama hoặc chưa tạo `sdvico-gemma` thì lượt gọi lỗi
ngay và lùi Gemini flash-lite như cũ. Muốn ép về Gemini: đặt `MKT_MODEL_DATA1=gemini-flash-lite-latest`
trong `.env` của máy.

Đo trên 3 file Zalo thật (1.300 tới 2.300 ký tự), so với tóm tắt flash-lite đã lưu: 8 tới 9 giây một file,
ý chính tương đương, có 1 lỗi gõ ("kỹ gia thuật"). Nội dung Zalo nội bộ không còn gửi ra Google. Bucket
hiện chỉ có văn bản (.md, .jsonl), chưa đo đường đọc ảnh chụp.

## Agent nào chạy trên máy được (19/10/2026, máy 16 GB)

| Agent | Kết luận |
|---|---|
| Trợ lý hỏi đáp | Được, khi chạy approval-ui trên máy. Bản Vercel vẫn Gemini |
| DATA 1 (tóm tắt Zalo) | Đã bật, xem mục trên |
| Blog, content, bài bán (SEO, tạo kịch bản) | Không: chậm 114 tới hơn 300 giây, sai luật bài bán |
| BOSS (kế hoạch) | Không: prompt 17.000 tới 39.000 token vượt ngữ cảnh 32K, mỗi lượt nạp hơn 1 phút, quyết định quan trọng cần model mạnh |
| DATA 2 (quét mạng) | Không: cần tìm Google (grounding), model trên máy không tự tìm web |
| Kịch bản video | Không: prompt rất dài như BOSS |
| Video, giọng nói | Đã chạy trên máy từ trước (ffmpeg, VieNeu) |
