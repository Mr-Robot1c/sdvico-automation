# PLAN: Bài content theo clip thật không được bịa trải nghiệm (review 8/10)

## Bằng chứng
Bài afd3d0ec (rotate 8/10, post_kind content, content_video true, clip bắt buộc 638c2e82 "Thu nghiem phan mem dieu khien tau tu dong SDNavi"). Caption sinh ra:
"Hôm nay đứng trên boong nhìn anh em kỹ thuật thử nghiệm hệ thống lái tự động mới trên tàu, thấy biển khơi giờ hiện đại thật. Nhớ lại mấy chục năm trước anh em mình toàn canh vô lăng mỏi nhừ tay giữa đêm giông bão. Theo các bác, nếu chọn giữa việc canh lái thủ công quen thuộc và giao cho máy tự động lo, anh em mình có dám tin tưởng tuyệt đối không?"
Reviewer chê: (1) tự nhận người chứng kiến sự kiện không có trong tư liệu; (2) tự dựng ký ức "mấy chục năm trước", Page thương hiệu đóng vai ngư dân lâu năm; (3) câu hỏi ép lựa chọn "có dám tin tưởng tuyệt đối không"; (4) SDVICO chỉ xuất hiện qua hashtag, không rõ quan hệ với thiết bị. Lỗi gốc: "AI phải phân biệt điều tư liệu thể hiện với câu chuyện nó tự thêm vào".
Sự thật clip (brand_assets.description): quay MÀN HÌNH MÁY TÍNH trong VĂN PHÒNG, phần mềm mô phỏng (Gzweb Sim, QGroundControl), không có người, không có tàu thật. Đây là R&D nội bộ lọt vào kho Content (đã gắn lại nhãn tay "R&D nội bộ"). Hai clip SDNavi khác trước đó cũng đã phải gắn tay.

## Nguyên nhân trong code
1. `apps/approval-ui/app/api/rotate/route.ts` và `packages/marketing/src/rotate-run.mjs` (HAI đường cùng logic) chỉ đưa TÊN clip vào topic, kèm lệnh "kể người thật việc thật". Model không biết clip có gì nên tự dựng nhân vật và cảnh.
2. Kho Content nhận clip R&D vì bước nhập clip Zalo tự động (source 'zalo-auto', `packages/marketing/src/up-media-kho-tu-lieu.mjs`) xếp hết vào 'Content'.
3. `generateContentPost` (social.mjs) không có rào chặn lời tự xưng người chứng kiến / ký ức bịa.

## Việc làm
### V1. Topic bám MÔ TẢ clip, giọng Page
`buildClipContentTopic(title, description)` trong `clip-guard.mjs` (một nguồn cho cả 2 đường): kèm mô tả clip cắt 600 ký tự (bỏ phần "| Hợp cảnh / Từ khoá"), cấm xưng người chứng kiến, cấm ký ức bịa, cấm đóng vai ngư dân, kết bằng MỘT câu hỏi cụ thể, không "tuyệt đối", "có dám". Clip không có description thì giữ tên clip kèm toàn bộ phần cấm. Select brand_assets thêm `description` ở cả 2 đường.

### V2. Chặn clip R&D khỏi kho Content
a. `up-media-kho-tu-lieu.mjs`: sau khi có description, nếu title + description + bản tóm tắt khớp `looksLikeInternalRnD` thì folder 'Content' đổi thành 'R&D nội bộ'.
b. Hai đường rotate lọc clip qua `dropInternalRnDClips` trước `pickFreshClips` (không sửa `video/fresh-clip.mjs` vì nằm trong video pipeline). Folder 'R&D nội bộ' loại khỏi `eligible` của vòng bán hàng.

### V3. Rào cứng trong generateContentPost
`fabricatedWitnessSentences(text)` bắt: tự xưng chứng kiến, ký ức bịa, câu hỏi ép chọn. Sinh tối đa 3 lần kèm lời nhắc `witnessRetryNote`; hết lượt thì cắt câu dính (giữ hashtag); cắt hết thân bài thì giữ nguyên, đặt `assessment.flags.witness` và nâng risk none lên amber để người duyệt thấy. Áp ở cả `apps/approval-ui/lib/gen/social.mjs` (đường Vercel) và `packages/marketing/src/social.mjs` (đường rotate-run).

## Kiểm
`npm run test:clipguard` (test mới, gồm kiểm 2 bản sao clip-guard.mjs giống nhau), test:clip, test:video, test:scene, test:price, test:compliance, test:skills, test:pheu; `npx tsc --noEmit` trong apps/approval-ui.
