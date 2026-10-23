> Load khi: task chạm giao diện nội bộ của apps/approval-ui (menu, trang, bố cục, component, chữ trên màn hình)
covers: apps/approval-ui/app, apps/approval-ui/lib/routes.ts, apps/approval-ui/app/globals.css
last_verified: 2026-10-23
ttl_days: 90

# DESIGN-SPEC — App Marketing nội bộ SDVICO (sắp xếp lại 23/10/2026)

Nguồn: kiểm kê toàn bộ 40 route ngày 23/10/2026 (menu 8 nhóm, khoảng 25 mục; duyệt bài ở 2 nơi; danh sách bài 3 bản;
kế hoạch 2 bản; chat bot 3 chỗ; số liệu rải 6 trang; tên biến môi trường, tên bảng, lệnh chạy tay hiện cho người
dùng; khoảng 880 dòng code chết). Trang công khai (/blog, /san-pham...) có spec riêng: design-spec-trang-cong-khai.md.

## Người dùng & nhiệm vụ
- User chính: nhân viên Marketing SDVICO (một nhóm nhỏ, không chia vai; user chốt 23/10).
- Job hằng ngày: duyệt bài máy viết; xem số liệu, báo cáo; lên và chỉnh kế hoạch tuần. Việc phụ: khách hỏi mua, tư liệu, cài đặt.
- Platform: cả hai — máy tính khi ngồi văn phòng, điện thoại khi duyệt nhanh (user chốt 23/10).
- Logo/brand: logo SDVICO đỏ, accent xanh `--accent` hiện có trong globals.css, giữ nguyên.

## Thang người dùng (3 câu cho từng loại)
| Loại user | Muốn thấy gì | Sản phẩm truyền tải gì | Thúc đẩy action tiếp theo |
|---|---|---|---|
| Mới (tuần đầu) | hôm nay phải làm gì, bấm ở đâu | "chỉ 3 việc mỗi ngày, máy lo phần còn lại" | Duyệt bài đang chờ (checklist 3 bước trên trang Hôm nay) |
| Quen (hằng ngày) | bài chờ duyệt, bài cờ đỏ, lịch hôm nay | "không sót bài nào, đăng đúng giờ" | Duyệt bài chờ lâu nhất |
| Quen (cuối tuần) | tuần qua bài nào ăn, kế hoạch tuần sau | "máy đã học và đề xuất, bạn chỉ chỉnh" | Xem và chỉnh kế hoạch tuần sau |

## Object model
- Bài viết (mkt_content + phiếu duyệt): list theo trạng thái, xem bài (modal), sửa nháp → Duyệt bài.
- Kế hoạch tuần (hướng đi, sản phẩm ưu tiên, lịch đăng ô giờ): xem tuần, sửa → Kế hoạch.
- Số liệu (theo tuần, theo ngày, theo kênh, blog): xem, so sánh → Số liệu.
- Khách hỏi mua + kho hỏi đáp + tin nhắn chờ gửi → Khách hàng.
- Tư liệu (ảnh, clip), bài soạn tay, video, bản tin → Tư liệu.
- Kết nối, SEO, catalog sản phẩm, quảng cáo, AI, tuyển dụng → Hệ thống (ít dùng).

## Nav model
- Desktop sidebar: 6 mục cấp 1 + 1 nhóm "Hệ thống" thu gọn mặc định. Tối đa 2 cấp; cấp 2 hiện thành hàng tab đầu trang, không lồng tab.
  1. 🏠 Hôm nay · 2. ✅ Duyệt bài · 3. 📅 Kế hoạch · 4. 📊 Số liệu · 5. 💬 Khách hàng · 6. 🎬 Tư liệu · ⚙️ Hệ thống (Kết nối kênh, SEO, Catalog sản phẩm, Quảng cáo, AI, Tuyển dụng).
- Mobile (< 768px): thanh dưới 5 mục — Hôm nay, Duyệt bài, Kế hoạch, Số liệu, Thêm (mở danh sách còn lại).
- Nhãn cùng nhóm: 1–2 từ, cùng ngữ pháp danh từ, không xuống dòng.
- Route cũ giữ nguyên để link cũ không chết; trang bị gộp thì chuyển hướng sang chỗ mới.

## Screen map
| # | Màn hình | Type | Vào từ | User đến để làm gì (1 câu) | Step tiếp theo mong muốn | Primary action | Widget chính | Density |
|---|---|---|---|---|---|---|---|---|
| 1a | Hôm nay (mới) — /tong-quan | product | đăng nhập, menu | Biết hôm nay phải làm gì | Duyệt bài đang chờ | Duyệt n bài | checklist 3 bước + Cần làm + lịch hôm nay | S |
| 1b | Hôm nay (quen) — /tong-quan | product | đăng nhập, menu | Nắm việc cần làm trong 5 giây | Duyệt bài chờ lâu nhất | Duyệt n bài | Cần làm (chờ duyệt, cờ đỏ, khách chưa trả lời, kết nối lỗi) + lịch hôm nay + 3 số tuần này | M |
| 2 | Duyệt bài — /noi-dung (tab Chờ duyệt, Đã lên lịch, Đã đăng, Thùng rác) | product | Hôm nay, menu | Duyệt hoặc từ chối bài máy viết | bài kế tiếp | Duyệt | danh sách thẻ bài + modal xem bài | M |
| 3 | Kế hoạch — /ke-hoach (tab Tuần này, Lịch đăng, Lịch sử) | product | menu, Hôm nay | Xem và chỉnh hướng đi, lịch tuần | áp đề xuất tuần sau | Áp dụng đề xuất (chỉ khi có đề xuất mới) | lịch 7 ngày + hướng đi + sản phẩm ưu tiên | M |
| 4 | Số liệu — tab Tuần (/do-luong/tuan), Hôm nay (/do-luong), Theo kênh (/kenh), Blog (/seo/bai-viet) | product | menu, Hôm nay | Biết bài và sản phẩm nào đang ăn | mở bài tốt nhất / chỉnh kế hoạch | Copy báo cáo (tab Tuần) | KPI + top bài + theo kênh | M |
| 5 | Khách hàng — tab Người hỏi mua (/khach-hang), Kho hỏi đáp (/hoi-dap), Tin nhắn chờ gửi | product | menu, Hôm nay | Trả lời người hỏi mua | khách kế tiếp | Trả lời | bảng khách + ngăn chi tiết | M |
| 6 | Tư liệu — tab Kho (/tu-lieu), Soạn bài (/san-xuat), Video (/video), Bản tin (/ban-tin) | product | menu | Nạp ảnh, clip; soạn bài tay; xem video | gửi bài vào Duyệt bài | Tải lên (Kho) / Gửi duyệt (Soạn bài) | lưới tư liệu / form | M |
| 7 | Hệ thống — Kết nối kênh, SEO, Catalog sản phẩm, Quảng cáo, AI (/agent), Tuyển dụng | product | menu nhóm Hệ thống | Sửa cài đặt, xem AI đang làm gì | quay lại việc chính | theo trang | thẻ trạng thái bằng lời thường | S |
| 8 | Hướng dẫn — /huong-dan | read | Hôm nay (checklist), menu Hệ thống | Người mới hiểu 3 việc mỗi ngày và khi nào bấm nút nào | quay về Hôm nay | Về trang Hôm nay | 3 mục: Duyệt bài, Kế hoạch, Số liệu | S |

Gộp / bỏ:
- /hang-doi → chuyển hướng /noi-dung. Tin nhắn chờ gửi (mkt_send_message) sang tab Khách hàng; phiếu tuyển dụng sang Tuyển dụng.
- Mục "Tất cả nội dung" trên Hôm nay bỏ (trùng tab Đã đăng). Khối Đo lường 5 ô trên Hôm nay rút còn 3 số, chi tiết ở Số liệu.
- /kho-tri-thuc tab Kế hoạch (BOSS) và Đánh giá bỏ phần trùng /ke-hoach, chỉ còn link sang Kế hoạch.
- /du-lieu-ai bỏ khỏi menu (chuyển hướng giữ lại). /quy-tac bỏ (link pháp lý nằm cuối trang Hệ thống).
- Chat bot: chỉ giữ nút nổi Hỏi bot; bỏ khung chat lặp trên /agent và /hoi-dap.
- Code chết xoá: noi-dung/tong-quan-section.tsx, plan-quick-view.tsx, lead-quick-view.tsx.

## Ma trận trạng thái
| Màn hình | Chưa login | Trống | Đang tải | Lỗi | Dữ liệu cực đoan |
|---|---|---|---|---|---|
| Hôm nay | chuyển /dang-nhap, giữ link | "Hôm nay không còn bài chờ" + link Kế hoạch | khung xám | "Chưa tải được, thử lại" từng khối, khối khác vẫn hiện | > 20 bài chờ: hiện số + "Duyệt bài" |
| Duyệt bài | như trên | "Không có bài chờ duyệt" + link Đã đăng | khung xám | thử lại | tiêu đề dài cắt 2 dòng; > 50 thẻ: phân trang |
| Kế hoạch | như trên | "Chưa có kế hoạch tuần này" + Soạn đề xuất | khung xám | thử lại | > 12 hướng đi: thu gọn |
| Số liệu | như trên | "Tuần này chưa có số liệu" | khung xám | khối lỗi riêng | số lớn rút gọn theo chuẩn Việt (1,2 nghìn) |
| Khách hàng | như trên | "Chưa có khách hỏi mua" | khung xám | thử lại | — |

## Action → Expectation
| Hành động | User kỳ vọng thấy ngay sau đó |
|---|---|
| Duyệt bài | thẻ rời cột Chờ duyệt, hiện "Đã duyệt, đăng lúc …" + bài kế tiếp nổi lên |
| Từ chối | thẻ rời cột, có nút Hoàn tác trong Thùng rác |
| Áp dụng đề xuất tuần | trang Kế hoạch hiện tuần mới, dòng "Đã áp lúc …" |
| Tải tư liệu lên | tư liệu mới đứng đầu lưới |
| Bấm một mục trong "Cần làm" | mở đúng tab, đúng bộ lọc |

## Flows
- Hằng ngày: Đăng nhập → Hôm nay → Duyệt bài (tab Chờ duyệt) → xem bài → Duyệt / Từ chối → bài kế tiếp → hết → Hôm nay.
- Cuối tuần: Hôm nay → Số liệu (tab Tuần) → Kế hoạch (tab Tuần này, đề xuất tuần sau) → Áp dụng.
- Khách: Hôm nay ("n khách chưa trả lời") → Khách hàng → Trả lời.

## Quy tắc chữ trên màn hình (áp mọi trang nội bộ)
- Không hiện tên biến môi trường, tên bảng, file migration, đường dẫn script, lệnh chạy tay. Thay bằng câu thường: "Chưa kết nối YouTube — báo kỹ thuật".
- Nhật ký kỹ thuật (run_log, mã lỗi) chỉ nằm trong mục thu gọn "Chi tiết kỹ thuật" ở trang AI.
- Bỏ đoạn văn giải thích dưới tiêu đề trang; giải thích dài chuyển về /huong-dan.
- Badge ≤ 2 từ; số theo chuẩn Việt Nam.

## Platform
- Desktop ≥ 1024px: sidebar trái; tablet 768–1023px: sidebar thu thành biểu tượng; mobile < 768px: thanh dưới 5 mục, thẻ bài full chiều ngang, modal xem bài full màn hình.
- Touch target ≥ 44px; focus ring giữ nguyên.

## Nghiệm thu (QA)
- Mỗi đợt: chụp screenshot các màn đã sửa ở 1440px, 768px, 375px (sáng và tối), đối chiếu screen map và quy tắc chữ.

## Quyết định đã chốt (không hỏi lại)
- Chỉ nhân viên Marketing dùng, không chia vai (23/10). Bài cờ đỏ vẫn dùng ô tick "Quản lý đã duyệt" (21/10).
- Route cũ giữ, chỉ chuyển hướng; không đổi URL công khai.
- Làm theo 3 đợt: (1) menu mới + gộp duyệt + Hôm nay + bỏ chữ kỹ thuật + xoá code chết; (2) tab cho Kế hoạch, Số liệu, Khách hàng, Tư liệu; (3) Hướng dẫn + checklist người mới + QA 3 kích thước.

## Tiến độ
- Đợt 1 (23/10/2026, user duyệt): menu 6 mục + Hệ thống, thanh 5 nút dưới cùng trên điện thoại; bài đăng chỉ duyệt ở /noi-dung (tiêu đề "Duyệt bài"), /hang-doi thành "Phiếu khác"; trang Hôm nay còn checklist người mới + Cần làm + Lịch hôm nay + 3 số tuần; bỏ tên biến môi trường, bảng, migration, lệnh chạy tay khỏi giao diện, nhật ký chạy thu vào "Chi tiết kỹ thuật"; xoá 3 file code chết. QA: next build sạch, screenshot 375px và khung máy tính.
- Đợt 2 (23/10/2026): hàng tab đầu trang dùng chung (app/section-tabs.tsx, nhóm khai ở lib/routes.ts SECTION_GROUPS). Số liệu: Theo tuần, Theo ngày, Theo kênh, Bài blog, Video đăng. Khách hàng: Hỏi mua, Hỏi đáp. Tư liệu: Tư liệu, Soạn bài, Video AI, Bản tin. Kế hoạch chia 4 tab qua ?tab=: Tuần này, Lịch đăng, Cài đặt (gồm các nút soạn lại và "Khi nào bấm nút nào"), Lịch sử. Menu bỏ mục con của 3 nhóm có tab. Bỏ đoạn giải thích dưới tiêu đề các trang này. Lệch so với màn 5: chưa có tab "Tin nhắn chờ gửi", phiếu đó vẫn ở Hệ thống → Phiếu khác.
- Đợt 3 (23/10/2026): trang /huong-dan (3 việc mỗi ngày, giờ máy tự chạy, luật không được bỏ qua, chỗ hỏi bot), vào từ checklist người mới và menu Hệ thống. Chat bot chỉ còn nút nổi "Hỏi bot" trên mọi trang nội bộ; bỏ khung chat và thẻ giới thiệu bot trên /agent, /hoi-dap. Tablet 768–1023px: sidebar 88px biểu tượng có nhãn nhỏ, Hệ thống mở ngăn bay bên phải (đóng khi đổi trang, Esc, bấm ra ngoài). QA: next build sạch, screenshot 375px, 768px, 1366px.
- Chưa làm: tab "Tin nhắn chờ gửi" trong Khách hàng; badge số chờ cạnh mục menu.

## Ngoại lệ đã duyệt (cơ chế [DEF] — SKILL.md)
- STACK React + Tailwind + shadcn → giữ CSS tự viết (app/globals.css) — KỸ THUẬT: app đã có 2.000 dòng CSS và class riêng, đổi stack là viết lại toàn bộ 40 trang, ngoài phạm vi sắp xếp lại. Trang nào sửa thì gom style viết thẳng (style={{}}) về class trong globals.css. 23/10/2026.
- Icon emoji trong menu giữ — KỸ THUẬT: chưa có thư viện icon, emoji đã quen với người dùng hiện tại. 23/10/2026.

## Anti-references (gu cấp project — không phải luật)
- Tên khái niệm trừu tượng làm mục menu ("Nguồn học dữ liệu", "Phòng điều khiển"): dùng tên việc hoặc đối tượng.
