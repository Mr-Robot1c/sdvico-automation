# Plan: Vá đợt 1 theo review Codex cho luồng bài content theo clip (9/10)

Nền: commit 86d80f7 và 45908bf (clip-guard.mjs, buildClipContentTopic, fabricatedWitnessSentences). Hai bản social.mjs (apps/approval-ui/lib/gen cho Vercel, packages/marketing/src cho rotate-run.mjs local). Hai đường xoay bài: apps/approval-ui/app/api/rotate/route.ts và packages/marketing/src/rotate-run.mjs.

## C1 (ưu tiên 1). Cảnh báo bị mất trên đường tới người duyệt
- generateContentPost (cả 2 bản) trả thêm `genFlags`: `{ witness_kept, witness_cut, lost_closing_question }`. Sau khi cắt câu, kiểm lại câu hỏi kết (bản Vercel chạy lại scanPlaybook, bản local dùng hasClosingQuestion cùng luật).
- Cả 2 đường rotate, nhánh bài content: ghi `brief.gen_flags` vào mkt_content và `payload.gen_flags` vào approval_queue khi có ít nhất 1 mục không rỗng. Có `witness_kept` hoặc `lost_closing_question` thì tiêu đề phiếu thêm "⚠️ Cần sửa: " và risk tối thiểu amber.
- Giao diện duyệt: khối nền đỏ nhạt `GenFlagsNotice` đọc `payload.gen_flags`.

## C2 (ưu tiên 2). Chặn nhánh chân dung tự dựng người
- generateContentPost (cả 2 bản): type portrait đổi sang engage (console.warn), hàm thuần `safeContentType` / `safeContentChoice` trong clip-guard.mjs.
- rotate-run.mjs đặt trọng số portrait 0 cho khớp route.ts, thêm giới hạn 1 video content mỗi ngày.

## C3 (ưu tiên 3). Không viết bài từ TÊN clip khi thiếu mô tả
- `hasUsableClipDescription` (mô tả chính từ 60 ký tự) và `filterContentClips` trong clip-guard.mjs; cả 2 đường rotate lọc trước pickFreshClips.

## C4. Prompt
- Câu mô tả công ty và vai SDVICO có điều kiện trong system prompt generateContentPost.
- buildClipContentTopic: chỉ nói người trong clip là đội SDVICO khi mô tả hoặc tên clip ghi rõ.
- Bài theo clip dùng temperature 0.7 (`topic.fromClip`), bài thường 1.05.

## Kiểm
test:clipguard, test:clip, test:video, test:scene, test:price, test:compliance, test:skills, test:pheu; `node --check` các .mjs; `npx tsc --noEmit` trong apps/approval-ui (chỉ còn lỗi có sẵn lib/tiktok.ts(120)).
