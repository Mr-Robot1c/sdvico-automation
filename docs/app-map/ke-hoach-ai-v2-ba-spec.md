# ba-spec: Kế hoạch AI v2 và mở rộng kênh (SEO, Social đa kênh, AD trả phí)

> Load khi: task chạm bot Kế hoạch (`/ke-hoach`, `lib/plan.ts`), nguồn tri thức nội bộ/public cho Kế hoạch, SEO backlink, mở rộng kênh Social, hoặc quảng cáo trả phí (AD) của mảng Marketing.
covers: apps/approval-ui/app/ke-hoach, apps/approval-ui/lib/plan.ts, apps/approval-ui/app/api/plan, packages/marketing/src, supabase/migrations
last_verified: 2026-08-18
ttl_days: 90
<!-- re-verified: 2026-08-19 - Xuong san xuat form (san-xuat/form.tsx) input/select dung .note bi max-width 320px cua .note (dung cho o ghi chu hang doi) -> cot phai trong. Scope override .sx-field .note {max-width:none; width:100%} de field lap full cot form. -->
<!-- re-verified: 2026-08-19 - Giong doc video quay lai NamMinh (nam), rate +8%. -->
<!-- re-verified: 2026-08-19 - Giong doc video AI mac dinh HoaiMy nu (thay NamMinh nam) + nut zoom video trong composer TikTok. Khong doi NV/AC. -->
<!-- re-verified: 2026-08-19 - NGUOI GIAO VIEC doi muc tieu/focus -> BOSS sinh lai ke hoach ngay + ap dung (goal-actions.ts regeneratePlanAndApply; plan.ts noi mkt_focus vao goal). Them ?plan=1 o route metrics-pull + workflow force_plan. -->
<!-- re-verified: 2026-08-19 - Vong lap kin: phan hoi hien truong (cap tren Zalo) ve bai SEA-40 duoc ghi vao mkt_knowledge_internal (feedback/2026-08-19-sea40-nuoc-dam-tau) + ma hoa thanh product-guard cho Creator. Khong doi NV/AC. -->
<!-- re-verified: 2026-08-19 - Them co che mkt_focus (tap trung san pham tuan) o /api/rotate: loc eligible + bo qua huong di ke hoach ngoai focus. Khong doi NV/AC; la rang buoc dau vao cho Creator (nguoi giao viec chot san pham tuan). -->
<!-- re-verified: 2026-08-19 - packages/marketing/src/social.mjs prompt portrait doi sang viet HOAN CHINH voi nhan vat dien hinh (sep chot 19/8, thay khung suon dien tay); rotate-run.mjs portrait weight 1, khong needsGov. Khong dong toi NV/AC ke hoach AI v2. -->
<!-- re-verified: 2026-08-18 - NV1 van hanh: buoc 'tha file vao bucket' nay TU DONG qua task Windows 16:30 (upload-zalo-to-bucket) sau phien Cowork 16:00; file cung ten noi dung moi duoc them ban dated de AC-1 (import idempotent theo source_path) van dung ma tin moi van duoc hoc. Hanh vi AC-1 KHONG doi. -->
<!-- re-verified: 2026-08-18 - Doi chieu bumpers.mjs + assemble.mjs (redesign intro/outro theo sep): thuan hinh thuc trinh bay video, hanh vi NV6/AC-8 KHONG doi. -->
<!-- re-verified: 2026-08-18 - Doi chieu build-video-all.mjs sau fix race (doc lai brief truoc khi tat co): hanh vi NV6/AC-8 KHONG doi, chi sua loi ky thuat lam mat video da gan. -->
<!-- re-verified: 2026-08-18 - v1.8: NV6/AC-8 DOI HANH VI theo user - bai ban hang co clip goc: video AI GAN VAO CHINH BAI (khong tao bai video rieng), dang Post + Reel + TikTok tu 1 lan duyet. build-video.mjs generator=rotation -> update brief bai goc; actions.ts publishReelToFacebook. -->
<!-- re-verified: 2026-08-18 - Doi chieu lan 2: build-video.mjs bo tag kenh trong ngoac khoi tieu de queue, hanh vi NV6/NV11 KHONG doi; quy tac trinh bay v1.7(c) mo rong: tieu de hang cho chi la ten bai, khong tag kenh/loai (kenh hien bang nhan phu). AC-8 assert nhan chua "Shorts" van dung. -->
<!-- re-verified: 2026-08-18 - Doi chieu build-video.mjs (packages/marketing/src/video) sau khi bo prefix A/B khoi nhan queue: hanh vi NV6/AC-8 KHONG doi (short mode van bat theo ab_pair_id, bai video van ke thua variant + ma cap "<pair>-video"); chi doi cach ghi nhan hien thi. AC-8 assert nhan chua "Shorts" van dung. Them History v1.7. -->

> **Mục đích**: oracle HÀNH VI cho khối tính năng "Kế hoạch AI v2 + kênh mở rộng" — phản hồi của sếp trên whiteboard Bạn B trình bày ngày 18/8/2026 (xem [marketing.md](marketing.md) cho luồng hiện có, [../roadmap-marketing.md](../roadmap-marketing.md) cho lịch 5 tuần). KHÔNG mô tả giao diện.

---

## 1. Vấn đề & JTBD

- **Job**: Khi một tuần làm việc mới bắt đầu, Bạn B muốn có một bản kế hoạch nội dung được đúc kết từ dữ liệu thật (nội bộ công ty + tri thức ngành cá cập nhật), không chỉ từ số đo lường cũ, để định hướng dây chuyền sản xuất tốt hơn — đồng thời công ty cần thêm ba năng lực còn thiếu mà sếp chỉ ra: SEO, Social đa kênh, và quảng cáo trả phí (AD).
- **Vì sao làm bây giờ**: sếp chê whiteboard hiện tại của Bạn B "còn thiếu", cụ thể Kế hoạch AI v1 (đã chạy) chỉ đọc `mkt_metrics`, chưa chủ động học; SEO/Social đa kênh/AD gần như chưa có gì.
- **Đo thành công bằng**: kế hoạch tuần sinh đúng lịch có ghi rõ nguồn đã học; không có nghiệp vụ mới nào phá vỡ bảy điều cấm hoặc "không phá rào nền tảng" (CLAUDE.md mục 7); phần phụ thuộc quyết định người khác được khoanh vùng rõ, không chặn phần làm được ngay (chi tiết từng chỉ tiêu ở §8).

## 2. User registry

| User (role/tier) | Là ai | Vòng đời | Thiết bị/bối cảnh chính |
|---|---|---|---|
| Bạn B | chủ dự án Marketing, vận hành hệ thống, duyệt kế hoạch và nội dung | quen | desktop |
| Phòng Kinh doanh | chốt dữ liệu sản phẩm thật, có thể chọn mục tiêu SEO địa phương | quen | — |
| Sếp / cấp quản lý | duyệt nội dung `needs_gov_review`, duyệt ngân sách AD | quen | — |
| Nhân viên phụ trách nạp tri thức nội bộ | định kỳ chuyển kết quả trích xuất từ Zalo (Cowork hoặc công cụ khác Bạn B tự chọn) thành file, thả vào bucket Supabase; hệ thống đọc file (KHÔNG phải bot tự vào Zalo — xem §5 NV1 lý do) | mới, vai trò cần Bạn B giao (hoặc Bạn B tự làm) | mobile hoặc desktop |
| Hệ thống Kế hoạch AI (cron) | actor tự động: học dữ liệu, tổng hợp, sinh kế hoạch tuần | — | nền, GitHub Actions |
| Hệ thống Dây chuyền nội dung (đã có) | actor tự động hiện có, nhận trọng số/định hướng từ Kế hoạch | — | nền |

## 3. User × Nghiệp vụ

| # | Nghiệp vụ | Owner-user | User liên quan (cross) | Phụ thuộc NV | Tần suất | Ưu tiên |
|---|---|---|---|---|---|---|
| NV1 | Nạp tri thức nội bộ vào Kho tri thức (thả file đã trích xuất từ Zalo vào bucket) | Nhân viên phụ trách nạp tri thức nội bộ | Hệ thống Kế hoạch AI (đọc lại làm nguyên liệu) | — | tuỳ ý, không bắt buộc mỗi tuần | Must — build khung ngay, việc vận hành chờ Bạn B giao người (xem §11) |
| NV2 | Tự học tri thức public ngành cá/thủy sản | Hệ thống Kế hoạch AI | — | — | mỗi ngày (RSS); Chủ nhật thêm lượt quét sâu | Must |
| NV3 | Tổng hợp và sinh Kế hoạch (kèm hướng đi cho Creator) | Hệ thống Kế hoạch AI | Bạn B (nhận để xem) | NV2 (bắt buộc), NV1 (tuỳ có) | Thứ 2 từ 8h sáng (kế hoạch tuần) và Thứ 6 từ 8h sáng (cập nhật lần 1, đủ 4 ngày số liệu); mỗi ngày tối đa 1 bản tự động | Must |
| NV4 | Xem, duyệt và áp dụng Kế hoạch tuần (mở rộng hiển thị nguồn học của bản v1 đã có) | Bạn B | Hệ thống Dây chuyền nội dung (nhận trọng số) | NV3 | mỗi tuần | Must |
| NV5 | Đề xuất và duyệt mục tiêu SEO backlink theo từ khóa | Hệ thống (đề xuất), Bạn B (duyệt) | Phòng Kinh doanh (nếu mục tiêu chạm nội dung sản phẩm/giá) | — | theo lô | Should — chờ chốt phạm vi, xem §11 |
| NV6 | Dựng thêm bản Video Shorts 10-20 giây cho đa kênh | Hệ thống Dây chuyền video (đã có) | Bạn B (duyệt như video hiện tại) | — | mỗi video được yêu cầu | Should |
| NV7 | Seeding hội nhóm ngoài (đăng video/bài vào group qua tài khoản cá nhân hoặc fanpage) | Bạn B (người thao tác) | — | — | theo lô | Could — chờ chốt tài khoản, xem §11 |
| NV8 | Đề xuất và duyệt ngân sách quảng cáo trả phí (AD) | Bạn B (đề xuất) | Sếp / cấp quản lý (duyệt ngân sách) | — | theo chiến dịch | Should — chờ chốt ngân sách, xem §11 |
| NV9 | Đo lường hiệu quả AD (CPC, điểm chạm) | Hệ thống (đọc report Ads) | Bạn B (xem ở Đo lường) | NV8 | định kỳ | Should |
| NV10 | Giao mục tiêu tuần cho Kế hoạch AI (flowchart v3: khối MỤC TIÊU) | Bạn B / Sếp | Hệ thống Kế hoạch AI (đọc khi sinh kế hoạch và hướng đi) | — | mỗi tuần hoặc khi đổi ưu tiên | Must |
| NV11 | Sinh cặp bài thử A/B cho một hướng đi (flowchart v3: AI Creator) | Hệ thống Dây chuyền nội dung | Bạn B (duyệt cả cặp như bài thường) | NV3 (có hướng đi) | mỗi lần vòng xoay chạy có hướng đi chưa dùng | Must |
| NV12 | Đánh giá cặp A/B và ghi kết quả ngược về Kho tri thức (flowchart v3: AI Evaluator, vòng lặp kín) | Hệ thống Kế hoạch AI | — | NV11 (có cặp) + số liệu Đo lường | hằng ngày (kết luận ghi đè theo cặp, số liệu lớn dần tự cập nhật) | Must |

> NV1, NV5, NV8, NV7 có phần **bị khoá bởi quyết định người khác chưa chốt** — không phải nghiệp vụ mồ côi, chỉ chưa đủ điều kiện build phần vận hành thật. Chi tiết Scope §7 và Open questions §11.

## 4. Cross-user handoff map

| Chặng | Nghiệp vụ | Từ user | → User nhận | Điều kiện chuyển | Điểm kết nếu KHÔNG ai nhận |
|---|---|---|---|---|---|
| H1 | NV1→NV3 | Nhân viên phụ trách (đã thả file vào bucket) | Hệ thống Kế hoạch AI (đọc file làm nguyên liệu) | file trong bucket được import thành bản ghi tri thức trước sáng Chủ nhật | không ai thả file tuần đó → Kế hoạch AI vẫn chạy, chỉ dùng NV2 và `mkt_metrics`, ghi rõ trong bản kế hoạch là thiếu nguồn nội bộ tuần này, KHÔNG chặn cả tiến trình |
| H2 | NV3→NV4 | Hệ thống Kế hoạch AI (đã sinh bản kế hoạch) | Bạn B (xem và quyết định áp dụng) | bản kế hoạch ở trạng thái mới sinh | Bạn B chưa xem → bản kế hoạch cũ đang áp dụng (nếu có) tiếp tục có hiệu lực, KHÔNG tự động thay bằng bản mới (giữ nguyên tắc máy đề xuất, người quyết) |
| H3 | NV4→Dây chuyền nội dung | Bạn B (đã xác nhận áp dụng trọng số) | Hệ thống Dây chuyền nội dung (nhận trọng số) | trạng thái áp dụng = có hiệu lực | đã có sẵn ở bản v1, không đổi |
| H4 | NV5 | Hệ thống (đã đề xuất danh sách mục tiêu backlink) | Bạn B (duyệt trước khi đăng ký ngoài) | danh sách ở trạng thái chờ duyệt | không duyệt → không mục tiêu nào được đăng ký, mặc định an toàn |
| H5 | NV8 | Bạn B (đã đề xuất ngân sách + chiến dịch cụ thể) | Sếp / cấp quản lý (duyệt ngân sách) | đề xuất có số tiền, kênh, thời gian cụ thể | sếp chưa duyệt → chiến dịch ở trạng thái chờ duyệt ngân sách vô thời hạn, KHÔNG tự chạy trên nền tảng quảng cáo |

## 5. Flows (Input → Steps → Output)

### Flow NV1 — Nạp tri thức nội bộ vào Kho tri thức · owner: Nhân viên phụ trách nạp tri thức nội bộ
- **Vì sao không phải bot tự đọc Zalo**: đã xác minh Zalo không có API chính thức nào cho ứng dụng bên ngoài đọc lịch sử tin nhắn của một nhóm chat nội bộ có sẵn (Zalo OA chỉ có GMF — nhóm do chính OA tạo để chăm sóc khách hàng, không áp dụng cho nhóm nội bộ nhân viên). Cách duy nhất để tự động hoá việc đọc là dùng thư viện không chính thức mô phỏng đăng nhập Zalo cá nhân, có rủi ro thật bị khoá tài khoản và vi phạm điều khoản dịch vụ. Việc này vi phạm CLAUDE.md mục 7 "gặp rào chắn của nền tảng thì dừng, không phá rào". Do đó NV1 tách rõ hai phần: phần trích xuất từ Zalo do người phụ trách (hoặc công cụ ngoài như Cowork) tự xử lý; hệ thống chỉ tiếp nhận đầu ra dưới dạng file.
- **Start**: có kết quả trích xuất từ Zalo (nội dung tin nhắn nội bộ, phản hồi khách, câu hỏi hay gặp...) do người phụ trách chuyển sang file
- **Input**: file văn bản (`.txt`, `.md`, `.html`, `.json`) hoặc ảnh chụp màn hình (`.jpg`, `.png`) chứa nội dung trích xuất
- **Steps**: người phụ trách thả file vào bucket Supabase `kho-tri-thuc-noi-bo` (qua giao diện Kho tư liệu có sẵn) → hệ thống định kỳ (hoặc chạy tay) quét bucket → với mỗi file mới, đọc nội dung (văn bản trực tiếp hoặc ảnh qua Gemini vision), tóm tắt các điểm chính, lưu thành bản ghi tri thức nguồn nội bộ có gắn tên file gốc → đánh dấu file đã import để không xử lý lại
- **Output**: một hoặc nhiều bản ghi tri thức nguồn nội bộ, mỗi bản ghi gắn đường dẫn tệp gốc trong bucket, sẵn sàng cho Kế hoạch AI đọc ở NV3
- **End**: bản ghi xuất hiện trong danh sách Kho tri thức, file gốc vẫn nằm trong bucket (đánh dấu đã import)
- **Cross**: H1 (→ Hệ thống Kế hoạch AI)

### Flow NV2 — Tự học tri thức public ngành cá · owner: Hệ thống Kế hoạch AI
- **Start**: đến lịch chạy Chủ nhật (giờ Việt Nam)
- **Input**: không cần thao tác người; hệ thống tự tìm kiếm nội dung public liên quan ngành biển và thủy sản Việt Nam
- **Steps**: tìm kiếm → chọn nguồn có đường dẫn xác định → tóm tắt và đánh giá mức liên quan → nếu nội dung chạm quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư thì gắn cờ cần duyệt cấp quản lý → lưu thành bản ghi tri thức nguồn public, kèm đường dẫn nguồn
- **Output**: một hoặc nhiều bản ghi tri thức nguồn public, mỗi bản ghi có đường dẫn nguồn xác định; KHÔNG có bất kỳ bài nội dung hay hàng chờ duyệt nào được tạo ở bước này (chỉ là nguyên liệu định hướng, xem R3)
- **End**: bản ghi sẵn sàng cho NV3 dùng sáng Thứ 2
- **Cross**: không cross-user, chỉ chuyển tiếp nội bộ hệ thống sang NV3

### Flow NV3 — Tổng hợp và sinh Kế hoạch tuần v2 · owner: Hệ thống Kế hoạch AI
- **Start**: đến lịch chạy sáng Thứ 2 (hoặc chạy tay)
- **Input**: số đo lường 7 ngày gần nhất (như bản v1), bản ghi tri thức nguồn internal trong 7 ngày qua (NV1, có thể rỗng), bản ghi tri thức nguồn public trong 7 ngày qua (NV2)
- **Steps**: xếp hạng sản phẩm theo số liệu (giữ nguyên thuật toán v1) → đọc thêm các bản ghi tri thức internal và public liên quan tuần đó → sinh đoạn định hướng có nêu rõ đã dùng bao nhiêu nguồn mỗi loại → nếu một nguồn loại nào đó rỗng, đoạn định hướng phải nêu rõ thay vì im lặng bỏ qua
- **Output**: một bản kế hoạch mới, có thêm số lượng nguồn tri thức đã dùng theo từng loại, và trọng số phân bổ như bản v1
- **End**: bản kế hoạch ở trạng thái mới sinh, chờ Bạn B xem
- **Cross**: H2 (→ Bạn B)

### Flow NV4 — Xem, duyệt và áp dụng Kế hoạch tuần · owner: Bạn B (mở rộng luồng v1 đã có)
- **Start**: có bản kế hoạch mới từ NV3
- **Input**: bản kế hoạch (đoạn định hướng, bảng xếp hạng sản phẩm, số nguồn tri thức đã dùng)
- **Steps**: Bạn B xem trang Kế hoạch, xem chi tiết từng bản ghi tri thức đã dùng nếu cần → xác nhận áp dụng trọng số hoặc bỏ qua
- **Output**: nếu áp dụng, trọng số có hiệu lực cho vòng xoay sinh nội dung; nếu bỏ qua, trọng số cũ (nếu có) giữ nguyên hiệu lực
- **End**: trạng thái áp dụng được cập nhật
- **Cross**: H3 (→ Dây chuyền nội dung)

### Flow NV5 — Đề xuất và duyệt mục tiêu SEO backlink · owner: Hệ thống (đề xuất), Bạn B (duyệt)
- **Start**: có kho từ khóa đã phân loại theo ý định tìm kiếm
- **Input**: kho từ khóa (`mkt_keywords`), danh mục sản phẩm thật đã chốt (CLAUDE.md mục 2)
- **Steps**: hệ thống đề xuất một danh sách mục tiêu (từ khóa trọng tâm + loại nội dung đẩy công khai) → Bạn B duyệt danh sách → mục đã duyệt mới được thực hiện đăng ký/gửi ngoài hệ thống công ty
- **Output**: danh sách mục tiêu ở trạng thái chờ duyệt, sau khi duyệt chuyển thành việc cần làm ngoài code (đăng ký thư mục, trao đổi đối tác)
- **End**: mục tiêu đã duyệt được đánh dấu để người thực hiện tiếp tục ngoài hệ thống
- **Cross**: H4 (→ Bạn B); nếu mục tiêu chạm nội dung sản phẩm/giá chưa chốt thì cross thêm Phòng Kinh doanh trước khi đưa vào danh sách đề xuất

### Flow NV6 — Dựng thêm bản Video Shorts 10-20 giây · owner: Hệ thống Dây chuyền video (mở rộng pipeline đã có)
- **Start**: có bài đã có kịch bản/video từ dây chuyền hiện tại (`build-video.mjs`)
- **Input**: kịch bản gốc và video đã dựng (bản ngang FB, bản dọc TikTok)
- **Steps**: chọn đoạn mở đầu gây chú ý nhất từ kịch bản gốc → dựng thêm một bản ngắn 10-20 giây → đẩy vào cùng hàng chờ duyệt như video gốc
- **Output**: thêm một bản Shorts gắn với cùng bài, chờ duyệt như quy trình video hiện tại
- **End**: bản Shorts xuất hiện trong hàng chờ duyệt kèm bản gốc
- **Cross**: không cross-user mới, dùng lại luồng duyệt hiện có

### Flow NV7 — Seeding hội nhóm ngoài · owner: Bạn B (người thao tác)
- **Start**: có bài/video đã đăng chính thức trên Trang của công ty
- **Input**: bài/video đã duyệt, danh sách nhóm mục tiêu do Bạn B tự chọn
- **Steps**: hệ thống chuẩn bị sẵn nội dung gợi ý (đoạn giới thiệu ngắn + liên kết bài gốc) → Bạn B tự thao tác đăng vào từng nhóm bằng tài khoản cá nhân hoặc fanpage của mình
- **Output**: bài xuất hiện trong nhóm ngoài do Bạn B tự đăng
- **End**: không có bản ghi tự động nào xác nhận (nghiệp vụ thủ công, ngoài hệ thống)
- **Cross**: không cross-user; KHÔNG tự động hoá đăng nhập tài khoản cá nhân vào nhóm ngoài — cùng lý do rủi ro khoá tài khoản như NV1

### Flow NV8 — Đề xuất và duyệt ngân sách quảng cáo trả phí (AD) · owner: Bạn B (đề xuất), Sếp/cấp quản lý (duyệt)
- **Start**: Bạn B muốn chạy một chiến dịch quảng cáo trả phí
- **Input**: kênh (FB, Google, TikTok, hoặc Zalo), số tiền ngân sách, thời gian chạy, mục tiêu click-to-action
- **Steps**: Bạn B gửi đề xuất chiến dịch cụ thể → Sếp/cấp quản lý xem và duyệt hoặc từ chối → chỉ chiến dịch đã duyệt mới được tạo thật trên nền tảng quảng cáo tương ứng
- **Output**: chiến dịch ở trạng thái đã duyệt (sẵn sàng tạo trên nền tảng) hoặc từ chối (kèm lý do)
- **End**: trạng thái chiến dịch rõ ràng, không có chiến dịch nào chạy ngoài luồng duyệt
- **Cross**: H5 (→ Sếp/cấp quản lý)

### Flow NV9 — Đo lường hiệu quả AD · owner: Hệ thống (đọc report Ads)
- **Start**: có ít nhất một chiến dịch đã chạy trên nền tảng quảng cáo
- **Input**: báo cáo từ nền tảng quảng cáo (chi phí, số click, số điểm chạm)
- **Steps**: kéo số liệu định kỳ → tính chi phí trên mỗi lượt click (CPC) → lưu vào bảng đo lường chung
- **Output**: số liệu CPC và điểm chạm gắn theo từng chiến dịch, hiển thị cùng trang Đo lường hiện có
- **End**: Bạn B xem được số liệu AD cạnh số liệu tổ chức tự nhiên hiện có
- **Cross**: không cross-user mới, Bạn B xem qua trang Đo lường hiện có

### Flow NV10 — Giao mục tiêu tuần · owner: Bạn B / Sếp
- **Start**: người quản lý muốn đổi ưu tiên tuần (sản phẩm, số cuộc gọi cần đạt, có chạy quảng cáo không)
- **Input**: một đoạn mục tiêu viết như giao việc cho nhân viên
- **Steps**: nhập mục tiêu trên trang Kế hoạch → hệ thống lưu (một bản duy nhất, ghi đè bản cũ) → mọi lần sinh kế hoạch và hướng đi sau đó đều đọc mục tiêu này đưa vào phần định hướng
- **Output**: bản kế hoạch và danh sách hướng đi bám mục tiêu; mục tiêu hiện nguyên văn đầu đoạn định hướng
- **End**: mục tiêu có hiệu lực tới khi người quản lý sửa lại
- **Cross**: không cross; hệ thống chỉ đọc

### Flow NV11 — Sinh cặp bài thử A/B · owner: Hệ thống Dây chuyền nội dung
- **Start**: vòng xoay chạy và kế hoạch đang áp dụng còn hướng đi chưa dùng
- **Input**: một hướng đi (tiêu đề, lý do, sản phẩm), tư liệu ảnh của folder sản phẩm khớp
- **Steps**: chọn đúng một hướng đi → sinh hai bài bán cùng sản phẩm: bản A theo góc của hướng đi, bản B theo góc đối chứng (ưu tiên ảnh khác nhau) → cả hai vào hàng chờ duyệt với nhãn phân biệt → đánh dấu hướng đi đã dùng
- **Output**: đúng 2 bài chờ duyệt cùng mã cặp, khác biến thể; cộng 1 bài content thường lệ là đủ hạn mức 3 bài/ngày
- **End**: người duyệt xử lý từng bài như bài thường (máy soạn, người bấm — điều cấm 1)
- **Cross**: không cross mới, dùng luồng duyệt hiện có

### Flow NV12 — Đánh giá cặp A/B và học ngược · owner: Hệ thống Kế hoạch AI
- **Start**: đến Thứ 4 hoặc Chủ nhật (trước bước sinh kế hoạch), có ít nhất một cặp A/B đã có số liệu
- **Input**: các cặp bài A/B 30 ngày qua và số liệu tương tác mới nhất của từng bài (khi quảng cáo trả phí chạy thì thêm CPC, điểm chạm)
- **Steps**: gom bài theo mã cặp → cặp nào đủ số liệu cả hai bên và không cùng bằng 0 thì so sánh → viết kết luận bản nào ăn khách hơn → ghi đè kết luận vào Kho tri thức nội bộ theo mã cặp (một cặp một bản ghi, số liệu lớn dần thì kết luận tự cập nhật)
- **Output**: bản ghi kết luận trong Kho tri thức; lần sinh kế hoạch và hướng đi kế tiếp tự đọc kết luận này làm nguyên liệu — vòng lặp kín, các AI cùng học từ kết quả thật
- **End**: cặp chưa đủ số liệu được bỏ qua chờ lần chạy sau, không kết luận ẩu
- **Cross**: không cross; đầu ra quay về chính Kho tri thức (H1)

## 6. Flow optimization log

| Flow | Candidate đã cân nhắc | Chọn / Loại | Lý do (theo rubric) | Đánh giá bởi | Conflict & xử (nếu có) |
|---|---|---|---|---|---|
| NV1 | A: bot tự động đăng nhập Zalo cá nhân đọc nhóm chat qua thư viện không chính thức · B: người phụ trách định kỳ nhập tay tổng hợp vào Kho tư liệu | Chọn B | A phá rào nền tảng (không có API chính thức, rủi ro khoá tài khoản, vi phạm điều khoản Zalo) — vi phạm CLAUDE.md mục 7 và rubric "định hướng" (nằm ngoài scope an toàn cho phép); B có input/output rõ, không treo khi thiếu người nhập (rubric #2, #3) | Domain-Specialist (xác minh kỹ thuật Zalo OA/GMF, xem §5 NV1) | Specialist veto A → Orchestrator chốt B |
| NV2 | A: AI tự do tìm kiếm và đưa thẳng kết quả vào bài đăng, không qua lọc · B: AI tìm kiếm định kỳ, chỉ tạo bản ghi tri thức có gắn nguồn, gắn cờ duyệt cấp quản lý nếu chạm quy định, không tự sinh bài đăng | Chọn B | A vi phạm điều cấm 3 và 5 (bịa/thiếu kiểm chứng nguồn, có thể chạm quy định nhà nước mà không qua duyệt); B giữ tri thức chỉ là nguyên liệu định hướng, mọi nội dung đăng thật vẫn qua luồng duyệt sẵn có (rubric "không dead-end", "cross tối thiểu") | Domain-Specialist (đối chiếu 7 điều cấm) + Optimizer | Không có, A bị loại thẳng vì vi phạm rule cứng |
| NV8 | A: Bạn B tự quyết ngân sách và chạy quảng cáo trực tiếp · B: Bạn B đề xuất, Sếp/cấp quản lý duyệt trước khi chiến dịch được tạo thật | Chọn B | A không có ai chốt thẩm quyền chi tiêu, rủi ro tài chính không kiểm soát (rubric "không dead-end" áp cho luồng tiền: chi tiêu không người duyệt = treo trách nhiệm); B theo đúng khuôn mẫu approval đã có trong hệ thống (tương tự điều cấm 1&2: máy/người đề xuất, người có thẩm quyền chốt) | Optimizer | Không có |
| NV7 | A: tự động hoá đăng nhập tài khoản cá nhân để seeding hàng loạt · B: hệ thống soạn sẵn nội dung gợi ý, người tự thao tác đăng | Chọn B | A cùng rủi ro khoá tài khoản như NV1, ngoài ra còn rủi ro bị nền tảng đánh dấu spam nếu đăng hàng loạt tự động vào nhiều nhóm; B giữ người trong vòng lặp, tuân "không phá rào" | Domain-Specialist + Optimizer | Specialist veto A → Orchestrator chốt B |

## 7. Scope & Priority

- **IN (build tuần 34, không phụ thuộc quyết định người khác)**:
  - NV2 — tự học tri thức public ngành cá (cron Chủ nhật)
  - NV3 — tổng hợp Kế hoạch tuần v2 dùng thêm nguồn NV2 (và NV1 nếu có)
  - NV4 — mở rộng hiển thị nguồn tri thức trên trang Kế hoạch (không đổi luồng duyệt/áp dụng hiện có)
  - NV1 — phần khung nhập liệu tổng hợp nội bộ ở Kho tư liệu (ai dùng khung này để nhập là việc vận hành, chờ Bạn B giao người — xem §11, nhưng bản thân khung nhập không phụ thuộc ai khác)
  - NV10 — ô giao mục tiêu tuần trên trang Kế hoạch (v1.3)
  - NV11 — vòng xoay sinh cặp bài thử A/B theo hướng đi (v1.3)
  - NV12 — đánh giá cặp A/B, ghi kết luận về Kho tri thức, chạy Thứ 4 và Chủ nhật (v1.3; thước đo tạm là tương tác, chờ AD để lên CPC)
  - NV6 — Video Shorts A/B: bài thuộc cặp thử tự dựng video chế độ Shorts 10-18 giây lõi, cặp video mang mã riêng để đánh giá tách khỏi cặp bài text (v1.4, user chốt "cứ làm đi" 18/8)
- **OUT (chờ chốt trước khi build phần vận hành thật — xem §11 Open questions)**:
  - NV1 (vận hành thật) — ai là người phụ trách, tần suất
  - NV5 — SEO backlink, danh sách mục tiêu do ai chọn (có thể gộp vào tuần 36 SEO địa phương đã có trong roadmap, tránh làm trùng)
  - NV6 — Video Shorts 10-20 giây, xác nhận ưu tiên thời gian với các việc khác trong tuần
  - NV7 — Seeding hội nhóm, dùng tài khoản nào
  - NV8, NV9 — AD trả phí, chờ ngân sách và kênh ưu tiên

## 8. Success metric

| Nghiệp vụ | Metric | Ngưỡng đạt |
|---|---|---|
| NV2 | tỷ lệ lần chạy cron Chủ nhật sinh được ít nhất 1 bản ghi tri thức public có nguồn hợp lệ | ≥ 90% trong 4 tuần đầu, đo qua `run_log` |
| NV3 | bản kế hoạch tuần có trường số nguồn tri thức đã dùng | 100% bản kế hoạch từ tuần 34 trở đi |
| NV1 | tỷ lệ tuần có ít nhất 1 bản ghi tổng hợp nội bộ mới (chỉ tính sau khi đã giao người phụ trách) | theo dõi, chưa đặt ngưỡng tới khi §11 mục 1 được chốt |
| NV8 | chiến dịch AD chạy thật trên nền tảng mà không có bản duyệt ngân sách trước đó | 0 (bắt buộc tuyệt đối, không có ngoại lệ) |

## 9. Rules & Invariants

| # | Rule | Edge case |
|---|---|---|
| R1 | Không có luồng nào tự động đăng nhập hoặc thao tác trên tài khoản Zalo/mạng xã hội cá nhân bằng thư viện không chính thức để đọc hoặc đăng thay người | nếu sau này nền tảng ra API chính thức phù hợp, phải chạy lại BA để đánh giá, không tự ý bật lại theo cách cũ |
| R2 | Mọi bản ghi tri thức nguồn public phải có đường dẫn nguồn xác định | tìm kiếm không ra nguồn nào hợp lệ tuần đó → không tạo bản ghi rỗng, chỉ ghi log, không giả lập nguồn |
| R3 | Tri thức có cờ cần duyệt cấp quản lý không được dùng để tạo trực tiếp bài nội dung hay hàng chờ duyệt ở bước học (NV2, NV3); nội dung sinh ra theo định hướng đó vẫn phải qua đúng luồng `needs_gov_review` hiện có | nếu Kế hoạch gợi ý một hướng nội dung dựa trên tri thức có cờ, bài content sinh ra theo hướng đó vẫn phải tự đặt `needs_gov_review=true` như luồng hiện tại, không có đường tắt |
| R4 | Chiến dịch AD không được tạo thật trên bất kỳ nền tảng quảng cáo nào nếu chưa có bản duyệt ngân sách ở trạng thái đã duyệt gắn số tiền cụ thể | không suy luận hoặc dùng ngân sách mặc định khi thiếu bản duyệt |
| R5 | Kế hoạch tuần không tự áp dụng trọng số mới; chỉ có hiệu lực khi Bạn B xác nhận (giữ nguyên nguyên tắc máy đề xuất, người quyết của bản v1) | bản kế hoạch mới sinh ra trong lúc bản cũ đang áp dụng → bản cũ tiếp tục có hiệu lực tới khi Bạn B xác nhận đổi |

## 10. Acceptance Criteria — ORACLE

> AC-1 đến AC-4 thuộc phần IN scope tuần 34 (§7), có thể build ngay. AC-5 đến AC-10 mô tả hành vi mục tiêu cho phần OUT scope, dùng làm oracle khi Open questions ở §11 được chốt.

### AC-1 — Import file từ bucket vào Kho tri thức nội bộ · Maps to flow: NV1 · Test: integration
- **Given** người phụ trách đã thả một file `.txt` (hoặc `.md`, `.html`, `.json`, ảnh) vào bucket `kho-tri-thuc-noi-bo` và file chưa từng được import
- **When** tiến trình quét bucket chạy (định kỳ hoặc chạy tay)
- **Then** một bản ghi tri thức mới nguồn nội bộ được tạo, có gắn đường dẫn tệp gốc trong bucket, có nội dung tóm tắt khác rỗng, và file được đánh dấu đã import để không xử lý lại
- **Assert**: sau khi tiến trình chạy xong, số bản ghi tri thức nguồn nội bộ gắn đường dẫn file đó == 1, nội dung tóm tắt của bản ghi khác rỗng, chạy lại tiến trình lần thứ hai không tạo thêm bản ghi trùng cho cùng file

### AC-2 — Kế hoạch AI tự học tri thức ngành cá hằng ngày · Maps to flow: NV2 · Test: integration
- **Given** tiến trình học tri thức public hằng ngày được kích hoạt (cron hoặc chạy tay) và nguồn tin ngành có bài mới chưa lưu
- **When** tiến trình chạy xong không lỗi
- **Then** có ít nhất một bản ghi tri thức mới nguồn public trong ngày đó, mỗi bản ghi có đường dẫn nguồn không rỗng, không trùng đường dẫn với bản ghi trong 30 ngày trước, và bản ghi nào có nội dung chạm quy định nhà nước/IUU/Cục Thủy sản/Kiểm ngư thì được gắn cờ cần duyệt cấp quản lý
- **Assert**: số bản ghi tri thức nguồn public tạo trong ngày đó >= 1, 100% số bản ghi đó có đường dẫn nguồn khác rỗng, và số bản ghi trùng đường dẫn trong 30 ngày == 0

### AC-3 — Kế hoạch nêu rõ số nguồn tri thức đã dùng · Maps to flow: NV3 · Test: integration
- **Given** đã có số đo lường 7 ngày qua, và có thể có hoặc không có bản ghi tri thức nội bộ và public trong 7 ngày qua
- **When** tiến trình sinh kế hoạch chạy (Thứ 2 kế hoạch tuần, Thứ 6 cập nhật lần 1, hoặc chạy tay)
- **Then** bản kế hoạch mới có một trường ghi rõ số bản ghi tri thức đã dùng theo từng loại (nội bộ, public); nếu một loại bằng 0 thì đoạn định hướng phải nêu rõ việc thiếu nguồn đó bằng chữ, không được bỏ qua im lặng
- **Assert**: bản kế hoạch mới có trường số nguồn tri thức là một cặp số nguyên không âm (nội bộ, public); nếu cả hai == 0 thì đoạn định hướng chứa cụm từ nêu rõ thiếu nguồn (kiểm bằng so khớp chuỗi)

### AC-14 — Mỗi ngày tối đa một bản kế hoạch tự động, đúng khung giờ · Maps to flow: NV3 · Test: integration
- **Given** hôm nay là Thứ 2 hoặc Thứ 6 theo giờ Việt Nam và tiến trình định kỳ chạy nhiều lần trong ngày (mỗi 30 phút)
- **When** các lần chạy trước 8 giờ sáng và các lần chạy sau khi đã có bản tự động trong ngày đi qua
- **Then** trước 8 giờ sáng không bản tự động nào được sinh; từ 8 giờ sáng chỉ lần chạy đầu tiên sinh đúng một bản (Thứ 2 mang nhãn kế hoạch tuần, Thứ 6 mang nhãn cập nhật giữa tuần, kèm hướng đi), các lần sau trong ngày không sinh thêm
- **Assert**: số bản kế hoạch nguồn tự động tạo trong một ngày Việt Nam <= 1, bản đó có thời điểm tạo >= 8 giờ sáng giờ Việt Nam và trường nhịp == "weekly" (Thứ 2) hoặc "update" (Thứ 6)

### AC-4 — Không tự tạo nội dung hay hàng chờ duyệt từ bước học tri thức · Maps to flow: NV2, NV3 · Test: integration
- **Given** một bản ghi tri thức nguồn public có cờ cần duyệt cấp quản lý
- **When** Kế hoạch AI dùng bản ghi đó để sinh đoạn định hướng của tuần
- **Then** đoạn định hướng chỉ tồn tại dưới dạng văn bản gợi ý trong bản kế hoạch; không có bài nội dung hay mục hàng chờ duyệt nào được tạo tự động từ bước này
- **Assert**: sau khi tiến trình chạy xong, số bài nội dung và số mục hàng chờ duyệt được tạo bởi chính tiến trình sinh kế hoạch trong lần chạy đó == 0

### AC-5 — Trang Kế hoạch hiển thị đúng số nguồn tri thức · Maps to flow: NV4 · Test: e2e
- **Given** có một bản kế hoạch mới nhất với số nguồn tri thức nội bộ bằng 2 và public bằng 5
- **When** Bạn B xem trang Kế hoạch
- **Then** trang hiển thị đúng hai con số đó gắn đúng nhãn loại nguồn tương ứng, kèm liên kết xem chi tiết từng bản ghi tri thức liên quan
- **Assert**: nội dung trang hiển thị chứa số "2" gắn nhãn nội bộ và số "5" gắn nhãn public, khớp đúng với dữ liệu bản kế hoạch đang xem

### AC-6 — Kế hoạch cũ giữ hiệu lực khi kế hoạch mới chưa được xác nhận · Maps to flow: NV4 · Test: integration
- **Given** một bản kế hoạch A đang ở trạng thái áp dụng, và một bản kế hoạch B mới sinh ra
- **When** Bạn B chưa xác nhận áp dụng bản B
- **Then** vòng xoay sinh nội dung vẫn dùng trọng số của bản A, không tự chuyển sang trọng số bản B
- **Assert**: trọng số đang có hiệu lực cho vòng xoay == trọng số của bản kế hoạch có trạng thái áp dụng == true, không phải bản kế hoạch mới nhất theo thời gian tạo

### AC-7 — Danh sách mục tiêu SEO backlink chỉ thực hiện sau khi duyệt · Maps to flow: NV5 · Test: manual (chưa có hạ tầng đăng ký ngoài tự động, người thực hiện đăng ký thủ công sau khi duyệt trong hệ thống — nêu ở §7 OUT)
- **Given** hệ thống đã đề xuất một danh sách mục tiêu backlink ở trạng thái chờ duyệt
- **When** Bạn B chưa xác nhận duyệt danh sách đó
- **Then** không có mục tiêu nào trong danh sách được đánh dấu sẵn sàng để đăng ký ngoài hệ thống
- **Assert**: số mục tiêu có trạng thái "sẵn sàng đăng ký" trong danh sách == 0 khi trạng thái duyệt tổng thể vẫn là "chờ duyệt"

### AC-8 — Bài bán hàng có clip gốc: video AI gộp vào chính bài, đăng Post và Reel · Maps to flow: NV6, NV11 · Test: integration
- **Given** một bài bán hàng từ vòng xoay thuộc folder sản phẩm có ít nhất một clip gốc, đã yêu cầu dựng video
- **When** dây chuyền video dựng xong không lỗi và người duyệt bấm Duyệt (không hẹn giờ)
- **Then** KHÔNG có bài video riêng nào được tạo; chính bài đó có thêm video ngang và video dọc bên cạnh ảnh gốc, kênh gồm Facebook và TikTok, được đánh dấu đăng Post kèm Reel; khi đăng, Facebook có một Post (video ngang, phần chữ bán hàng, ảnh sản phẩm thả bình luận) và một Reel (video dọc), TikTok có bản dọc
- **Assert**: số bài mới sinh bởi dây chuyền video cho bài này == 0; bài có đủ 3 mã tệp ảnh, video ngang, video dọc; sau khi duyệt, số bản ghi đăng kênh Facebook cho bài == 2 (một địa chỉ Post, một địa chỉ chứa "/reel/") và kênh TikTok == 1

### AC-9 — Không chiến dịch AD nào chạy khi chưa có bản duyệt ngân sách · Maps to flow: NV8 · Test: integration
- **Given** một đề xuất chiến dịch AD với số tiền ngân sách cụ thể, chưa được Sếp/cấp quản lý duyệt
- **When** Bạn B thao tác để chiến dịch bắt đầu chạy
- **Then** hệ thống từ chối tạo chiến dịch thật trên nền tảng quảng cáo, giữ chiến dịch ở trạng thái chờ duyệt ngân sách
- **Assert**: trạng thái chiến dịch == "chờ duyệt ngân sách", và số lần gọi tạo chiến dịch thật trên nền tảng quảng cáo cho đề xuất đó == 0

### AC-10 — Đo CPC gắn đúng theo chiến dịch đã duyệt · Maps to flow: NV9 · Test: integration
- **Given** một chiến dịch AD đã duyệt và đã chạy, có số liệu chi phí và số click từ nền tảng quảng cáo
- **When** tiến trình kéo số liệu định kỳ chạy xong
- **Then** một bản ghi đo lường mới được tạo, có chi phí trên mỗi lượt click tính đúng bằng tổng chi phí chia cho tổng số click của chiến dịch đó
- **Assert**: giá trị CPC lưu lại == tổng chi phí / tổng số click (sai số làm tròn không quá 1 đơn vị tiền nhỏ nhất), gắn đúng mã chiến dịch nguồn

### AC-11 — Kế hoạch bám mục tiêu tuần được giao · Maps to flow: NV10, NV3 · Test: integration
- **Given** người quản lý đã lưu mục tiêu tuần với nội dung không rỗng
- **When** tiến trình sinh kế hoạch chạy (cron hoặc chạy tay)
- **Then** bản kế hoạch mới lưu lại nguyên văn mục tiêu và đoạn định hướng mở đầu bằng mục tiêu đó
- **Assert**: bản kế hoạch mới nhất có trường mục tiêu == chuỗi đã lưu, và đoạn định hướng đầu tiên chứa chuỗi "Mục tiêu tuần được giao"

### AC-12 — Vòng xoay sinh đúng cặp A/B cho một hướng đi · Maps to flow: NV11 · Test: integration
- **Given** kế hoạch đang áp dụng có ít nhất một hướng đi chưa dùng, và folder sản phẩm khớp có ít nhất một ảnh
- **When** vòng xoay sinh bài chạy một lần
- **Then** đúng hai bài bán được tạo cùng mã cặp, một bản A một bản B, cả hai ở hàng chờ duyệt trạng thái chờ, và hướng đi đó được đánh dấu đã dùng
- **Assert**: số bài có cùng mã cặp == 2, tập biến thể == {A, B}, số mục hàng chờ duyệt tương ứng trạng thái "pending" == 2, hướng đi trong kế hoạch có mốc thời gian đã dùng khác rỗng

### AC-13 — Kết luận A/B được ghi về Kho tri thức để vòng sau học · Maps to flow: NV12 · Test: integration
- **Given** một cặp A/B mà cả hai bài đều có số liệu tương tác và tổng không cùng bằng 0
- **When** tiến trình đánh giá chạy
- **Then** đúng một bản ghi tri thức nội bộ gắn mã cặp được tạo hoặc cập nhật, nêu rõ biến thể thắng, và lần sinh hướng đi kế tiếp đọc được bản ghi này như một nguồn nội bộ
- **Assert**: số bản ghi tri thức nội bộ có đường dẫn nguồn == "evaluator/" + mã cặp là 1, tóm tắt chứa cụm "bản A" hoặc "bản B", chạy tiến trình lần hai không tạo thêm bản ghi trùng cho cùng cặp

## 11. Assumptions / Open questions

- **Assumptions** (tự quyết khi thiếu info, an toàn):
  - NV1 tần suất nhập không bắt buộc theo lịch cố định; hệ thống chấp nhận thiếu nguồn nội bộ ở bất kỳ tuần nào mà không chặn Kế hoạch AI (R theo H1).
  - NV2 giới hạn phạm vi tìm kiếm ở nội dung liên quan ngành biển và thủy sản Việt Nam để giảm nhiễu; chưa đặt danh sách trắng miền cụ thể, có thể bổ sung sau nếu thấy kết quả không liên quan.
  - NV6 hiểu "Video Shorts" là cắt/dựng thêm một bản ngắn từ kịch bản và tư liệu đã có của dây chuyền hiện tại, không phải sinh kịch bản hoàn toàn mới riêng cho Shorts.

- **Open (RED — chờ Bạn B/sếp chốt, gộp 1 lượt hỏi)**:
  1. NV1 — Ai là "nhân viên phụ trách nạp tri thức nội bộ" (Bạn B tự dùng Cowork rồi thả file, hay giao người khác), và có tần suất tối thiểu mong muốn không (ví dụ ít nhất 1 lần/tuần); Cowork xuất ra định dạng gì để hệ thống chỉnh phần đọc file cho khớp?
  2. NV5 — Danh sách mục tiêu SEO backlink do Bạn B tự tìm hay cần Phòng Kinh doanh chọn; có nên gộp việc này vào tuần 36 (SEO địa phương) đã có sẵn trong roadmap thay vì làm riêng ở đây không?
  3. NV8/NV9 — Ngân sách quảng cáo trả phí mỗi tháng là bao nhiêu, kênh nào chạy trước (FB, Google, TikTok, hay Zalo), và ai giữ tài khoản/thẻ thanh toán để tạo chiến dịch thật sau khi đã duyệt?
  4. NV7 — Seeding hội nhóm dùng tài khoản cá nhân của ai, và Bạn B có chấp nhận đây là thao tác thủ công hoàn toàn (không tự động hoá) hay muốn tìm phương án khác an toàn hơn?

## History

- v1 (2026-08-18): khởi tạo — đặc tả Kế hoạch AI v2 (học hai nguồn: nội bộ nhập tay + public tự tìm kiếm), SEO backlink, mở rộng Social (Video Shorts, seeding hội nhóm), và AD trả phí, theo phản hồi whiteboard của sếp trình bày qua Bạn B ngày 18/8/2026.
- v1.1 (2026-08-18): NV1 chuyển từ "nhập tay vào form Kho tư liệu" sang "thả file vào bucket Supabase" — vì Bạn B dùng Cowork trên chat Claude để đọc Zalo PC, chỉ cần hệ thống nhận đầu ra dạng file. Sửa NV1 flow, AC-1 (Test đổi thành integration, assert theo file), User registry, cross H1, Open question 1.
- v1.2 (2026-08-18): NV3 bổ sung output `content_suggestions` — Kế hoạch v2 giờ ra HƯỚNG ĐI CỤ THỂ (5-7 gợi ý bài đăng bám nguồn tri thức, gọi đúng sản phẩm SDVICO), không chỉ dừng ở "đã học N nguồn". Đây là bước cầu nối để vòng xoay sinh bài dùng tri thức thật. Cũng bổ sung phương án fallback học public qua Google News RSS khi Gemini google_search grounding bị rate limit 429.
- v1.3 (2026-08-18): khép VÒNG LẶP KÍN theo flowchart v3 của Bạn B (docs/flowchart-v3.html, 4 vai AI): thêm NV10 (người giao mục tiêu tuần cho BOSS — khối MỤC TIÊU), NV11 (Creator sinh cặp bài thử A/B cho một hướng đi, 2 bài bán + 1 content = đúng hạn mức 3/ngày), NV12 (Evaluator so cặp A/B theo tương tác FB rồi ghi kết luận ngược về Kho tri thức nội bộ — nhờ đó BOSS và mọi lần sinh kế hoạch sau tự học, không cần bảng mới). Thước đo A/B tạm dùng tương tác vì AD trả phí đang hoãn; khi AD chạy sẽ nâng lên CPC + điểm chạm đúng flowchart. Thêm AC-11, AC-12, AC-13.
- v1.4 (2026-08-18): NV10 nới rõ — mục tiêu tuần ĐƯỢC PHÉP TRỐNG, khi trống BOSS tự định hướng từ dữ liệu các AI đã học (người dùng chốt "đôi khi tôi không biết làm gì thì BOSS cứ dựa vào dữ liệu"); narrative và prompt hướng đi phải nói rõ đang tự định hướng. NV6 chuyển vào IN: bài thuộc cặp A/B tự dựng video chế độ Shorts (kịch bản 2-3 cảnh, lõi 10-18 giây), bài video kế thừa biến thể, mã cặp video = mã cặp nguồn + "-video" để Evaluator so cặp video tách khỏi cặp text. Sửa AC-8 theo flow thật (video là bài mới kế thừa cặp, không phải tệp gắn vào bài cũ). NV4 thêm: xem lại bản kế hoạch cũ từ lịch sử, và sau khi Áp dụng phải thông báo tóm tắt bản áp dụng (ưu tiên vòng xoay, số hướng đi, mục tiêu).
- v1.5 (2026-08-18): chốt NHỊP VÒNG LẶP theo lời user ("AI data 1 lấy data Zalo mỗi ngày, AI data 2 lên mạng học mỗi ngày, Thứ 4 8h sáng cập nhật kế hoạch lần 1, Chủ nhật thu thập tổng, Thứ 2 ra kế hoạch tuần"): NV2 đổi tần suất sang HẰNG NGÀY qua Google News RSS (không quota), Chủ nhật thêm lượt quét sâu Gemini grounding (lỗi 429 bỏ qua); NV3 đổi lịch sinh sang Thứ 2 từ 8h (kế hoạch tuần, cadence weekly) + Thứ 4 từ 8h (cập nhật lần 1, cadence update), mỗi ngày tối đa 1 bản tự động (chặn spam cron 30 phút — lỗi nhịp cũ); Evaluator chuyển sang chạy HẰNG NGÀY (chỉ query, verdict upsert). Mỗi bản kế hoạch (kể cả bấm tay) TỰ KÈM hướng đi qua lib/plan-directions.ts — chỉ đạo Creator không còn phụ thuộc chạy script tay. Sửa AC-2 (hằng ngày + không trùng URL 30 ngày), AC-3 (thêm Thứ 4), thêm AC-14 (khung giờ + chặn trùng).
- v1.6 (2026-08-18): dời bản cập nhật lần 1 từ Thứ 4 sang THỨ 6 từ 8h sáng (user: "cho nó xa tí, vậy mới có số liệu" — bài kế hoạch Thứ 2 chạy được 4 ngày mới đủ tương tác để cập nhật có căn cứ). NV12 ghi đúng tần suất hằng ngày (đã chạy vậy từ v1.5). Sửa NV3, AC-3, AC-14 theo. Hệ thống bắt đầu ĐƯA VÀO HOẠT ĐỘNG THẬT từ tuần này.
- v1.8 (2026-08-18): user chốt lại NV6 sau khi thấy 2 card tách rời: bài bán hàng của sản phẩm có clip gốc = MỘT bài duy nhất, video AI gắn vào chính bài (kèm ảnh), một lần duyệt đăng cả Facebook Post lẫn Reel và TikTok. Không còn "bài video riêng" cho bài bán hàng; bài content và bài Xưởng sản xuất bấm Làm video vẫn tạo bài video riêng như cũ. Đăng Reel không hỗ trợ hẹn giờ (chỉ Post hẹn được), ghi rõ khi duyệt. AC-8 viết lại theo hành vi mới.
- v1.7 (2026-08-18): lần chạy thật đầu tiên (rotate tay ra cặp A/B SF-50 + 1 bài content) bắt được 3 việc: (a) BUG map hướng đi → folder sản phẩm so lệch số thứ tự folder khiến cặp A/B không bao giờ sinh trên cron — đã sửa; (b) người duyệt không bấm được ô hẹn giờ gốc — đổi sang chọn ngày + khung giờ (8h/11h30/19h), hành vi hẹn giờ NV không đổi; (c) nhãn cặp thử không được lộ chữ A/B trong tiêu đề hàng chờ (thông tin cặp giữ trong dữ liệu bài, hiển thị dạng nhãn phụ "Thử A/B") — bổ sung vào R (quy tắc trình bày) cho NV11. Video Shorts từ cặp A/B do cron dựng tự động (~10 phút sau khi có bài), không cần chạm tay.
