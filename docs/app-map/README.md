# App Map: bản đồ hệ thống sdvico-automation

> Đọc khi cần biết luồng chạy và thành phần của một mảng. Đây là trang chỉ mục.
> Nguồn sự thật khác: `CLAUDE.md` cho bảy điều cấm và giọng văn, `supabase/migrations` cho lược đồ, `docs/ke-hoach-7-ngay.md` cho kế hoạch gốc.
covers: packages/core, apps/approval-ui, supabase/migrations
last_verified: 2026-08-13
ttl_days: 180
<!-- re-verified: 2026-08-12 - approval-ui UI redesign (sidebar chia 5 nhom, eye modal, /san-xuat moi). Luong approval_queue va cac bang du lieu KHONG doi. Nut Xong o /san-xuat van di qua approval_queue kind=mkt_publish_content dung dieu cam 1. -->
<!-- re-verified: 2026-08-12 - Hang doi duyet gio resolve payload.assets (id) ra public URL, hien anh/video tren card va modal. /san-xuat upload doi tu server action sang browser PUT thang len Storage qua signed URL (vuot gioi han 4,5MB Vercel). Them action createAssetUploadUrl + registerAsset. Luong approval_queue, kind=mkt_publish_content, va cac bang du lieu KHONG doi. -->
<!-- re-verified: 2026-08-12 - Them build marker o page.tsx de trigger deploy Vercel. Khong doi logic. -->
<!-- re-verified: 2026-08-12 - /noi-dung modal: them hien anh/video tu brief.assets, va sua .modal text-align:left (truoc bi lech phai do .col-actions text-align:right). asset-uploader: them thanh tien trinh % (XHR) + bao loi 413. Luong du lieu KHONG doi. -->
<!-- re-verified: 2026-08-12 - Bo nut Sinh noi dung (GenerateButton) khoi / va /noi-dung. Doi nhan rui ro red: "Co do..." -> "Can xem xet hoac uu tien". /noi-dung them loc trang thai (Cho duyet/Da duyet/Da tu choi) suy tu approval_queue.status theo payload.content_id. Media modal doi sang kieu Facebook (xep doc, full-width, can giua). Xuong san xuat: Sinh text nhan them assetHint (ten file anh/video da chon) de AI viet an khop. decideForm revalidate them /noi-dung. Luong approval_queue va cac bang KHONG doi. -->
<!-- re-verified: 2026-08-12 - Modal (/ va /noi-dung): chuyen media xuong CUOI, sau noi dung (chu tren, anh/video duoi dung kieu Facebook). Chi doi thu tu render + margin .modal-media, khong doi du lieu. -->
<!-- re-verified: 2026-08-12 - Xuong san xuat them "Xuong anh": tim anh Unsplash (searchUnsplash), chen anh (saveUnsplashAsAsset), va ghep banner (createBannerFromBackground) = anh san pham that + nen Unsplash/gradient + tieu de + hotline, dung @napi-rs/canvas + font Be Vietnam Pro nhung base64 (lib/gen/banner.mjs, fonts-data.mjs). Anh moi vao brand_assets, gan vao bai qua form. Can env UNSPLASH_ACCESS_KEY. next.config: serverComponentsExternalPackages ['@napi-rs/canvas']. Giu nguyen san pham, khong bia (dieu cam 5). Luong approval_queue KHONG doi. -->
<!-- re-verified: 2026-08-12 - Xuong anh chuyen xuong duoi khung anh/video (tren Soan bai viet). Tao banner xong tu dong sinh text: onAttach meta.banner -> runGenerate voi tu khoa = tieu de/keyword hoac cleanAssetName(ten anh san pham). Kho tu lieu (/tu-lieu): bam anh/clip mo hop thoai xem lon (AssetViewer). Khong doi du lieu. -->
<!-- re-verified: 2026-08-12 - Kho tu lieu (/tu-lieu): them doi ten tu lieu (renameAsset). Ten title cung la goi y AI sinh text. Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Bo hoan toan ghep banner (createBannerFromBackground, banner.mjs, fonts-data.mjs, @napi-rs/canvas, serverComponentsExternalPackages). Xuong anh chi con tim + chen anh Unsplash truc tiep (searchUnsplash, saveUnsplashAsAsset). Nut Sinh text: neu chua co keyword/title thi lay ten anh (cleanAssetName) lam nguon. Ly do: ghep code chi dat anh len (trong chat), khong hoa canh; nguoi dung chon dung anh san/Unsplash. -->


Hệ thống chia hai mảng, mỗi mảng một file workflow và app map riêng:

- Tuyển dụng: [tuyen-dung.md](tuyen-dung.md). Phụ trách Bạn A.
- Marketing: [marketing.md](marketing.md). Phụ trách Bạn B.

## Nền chung dùng cho cả hai mảng

Kiến trúc đã chốt, chi tiết ở CLAUDE.md mục 5.

- Điều phối bằng GitHub Actions schedule và cron nội bộ.
- Suy luận ngôn ngữ bằng Claude Code chế độ headless.
- Dữ liệu ở Supabase Postgres và Storage.
- Giao diện duyệt bằng Next.js trên Vercel, đọc ghi bảng `approval_queue`.
- Tự động thao tác web bằng Playwright với Chrome thật, qua browser runner trong `packages/core`.

### Thành phần dùng chung trong packages/core

| Thành phần | Việc |
|---|---|
| Client Supabase | Kết nối từ biến môi trường |
| Ghi run_log | Ghi mọi thao tác tự động, kèm ảnh chụp khi lỗi |
| Đẩy approval_queue | Đưa mục cần duyệt vào hàng đợi, trạng thái pending |
| Browser runner | Hàng đợi theo tài khoản, giữ hồ sơ trình duyệt, đếm hạn mức, công tắc dừng khẩn, chế độ diễn tập |

### Cổng an toàn chung

- Máy soạn, người bấm. Mọi thư và bài đăng đi qua `approval_queue`, người bấm mới chuyển approved. Điều cấm 1 và 2.
- Row Level Security bật cho bảng có dữ liệu cá nhân, trọng tâm `hr_candidates` và `hr_applications`. Điều cấm 6.
- Gặp rào chắn của nền tảng thì dừng và đẩy vào hàng đợi duyệt, không phá rào. Kế hoạch Phần 6.
- Hạn mức tự đặt thấp hơn hạn mức của sàn, đếm lưu trong cơ sở dữ liệu.

## Bảng dữ liệu theo mảng

| Bảng | Mảng | Dữ liệu cá nhân |
|---|---|---|
| hr_jobs | Tuyển dụng | Không |
| hr_candidates | Tuyển dụng | Có, bật RLS |
| hr_applications | Tuyển dụng | Có, bật RLS |
| mkt_keywords | Marketing | Không |
| mkt_content | Marketing | Không |
| mkt_posts | Marketing | Không |
| mkt_metrics | Marketing | Không |
| brand_assets | Chung, thiên Marketing | Không |
| approval_queue | Chung | Có thể chứa, thận trọng |
| run_log | Chung | Có thể chứa, thận trọng |

Cập nhật lần cuối: 10/8/2026.
<!-- re-verified: 2026-08-12 - Fix nut Sinh text: disabled cu chi cho bam khi co keyword/title, gio cho bam khi da chon anh/video (de sinh text theo ten anh). Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Ghep 2 anh dung remove.bg: cat nen anh san pham (removeBgCutout, REMOVE_BG_API_KEY) roi dat len nen Unsplash co bong do (banner.mjs buildBanner nhan cutoutBuffer). Nut "Ghep san pham" tren moi anh Unsplash. Ghep xong tu sinh text theo ten anh. Canvas + font base64 tro lai. Free tier remove.bg do phan giai preview. Dieu cam 5: chi cat nen, khong ve lai. -->
<!-- re-verified: 2026-08-12 - Fix doi ten tu lieu: form thieu input hidden id nen renameAsset khong chay; da them. Ghep san pham: dat ten anh ghep + tieu de banner theo ten anh san pham (mo ta ro). Chon anh o Khung anh: hien ten anh + dien tu khoa trong tam (cleanAssetName) neu chua co, san sang Sinh text. Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Kho tu lieu: thay form upload server-action bang LibUploader (client-direct qua signed URL) de video lon tai duoc (vuot 4.5MB Vercel), ho tro chon loai/giay phep/nguon. Giu ten tep goc khi khong nhap ten (asset-uploader + lib-uploader dung title||file.name). registerAsset nhan du loai (image/video/audio/logo) + source. Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Xuong san xuat: chon video cung tu dien tieu de + hien "Video dang chon" (onSelectVideo doi xung onSelectImage). Khong doi luong. -->
<!-- re-verified: 2026-08-12 - 3 fix: (1) tieu de tu doi theo anh/video moi chon (co titleAuto, tat khi go tay/chon tu khoa); (2) LibUploader tu nhan loai theo file.type (video khong bi luu nham anh); (3) AssetViewer + ViewModal dung media khi dong dialog (onClose pause), AssetViewer them audio. Sua asset cu bi nham kind theo duoi file. Khong doi luong. -->
<!-- re-verified: 2026-08-12 - 3 fix: (A) LibUploader nhan loai theo ca MIME lan duoi ten tep (video .mp4 MIME rong khong bi luu nham anh); sua asset cu bi nham. (B) Sinh text theo KENH DANG: generateTextForTitle/generateContentAsync/generateDraftLLM nhan format (social=FB ngan, article=web dai, video=kich ban co moc [0-3s]...). Truoc day moi kenh ra cung 1 kieu. (C) Chon ca anh+video thi gop ten 2 ben lam tieu de + assetHint gom ca hai. Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Doi model AI mac dinh gemini-flash-latest (chi 20 luot/ngay free, het -> luon lui ban mau "y nhu nhau") sang gemini-flash-lite-latest (quota free cao hon). Gemini gio sinh noi dung that, khac nhau theo tung tu khoa + dinh dang. -->
<!-- re-verified: 2026-08-12 - Fix am thanh tu chay: AssetViewer chi render media (video/audio autoPlay) KHI mo modal (open state), khong con phat tieng luc tai trang. Tieu de gop anh+video ngan bang dau " + ". Khong doi luong. -->
<!-- re-verified: 2026-08-12 - decideForm: khi Duyet bai mkt_publish_content (chuyen pending->approved lan dau) thi dang NGAY len Facebook (publishContentToFacebook, /photos neu co anh, /feed neu khong), ghi mkt_posts + mkt_content.status=published. Chua co FACEBOOK_PAGE_ID/ACCESS_TOKEN thi bo qua khong loi. Loi FB khong chan viec duyet. Dung dieu cam 1 (chay sau khi nguoi bam Duyet). -->
<!-- re-verified: 2026-08-12 - Bat dang Facebook khi Duyet: da set env FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN tren Vercel (Page Sdvico-MKT, token vinh vien). Redeploy de env co hieu luc. Khong doi code logic. -->
<!-- re-verified: 2026-08-12 - Dang Facebook them VIDEO: publishContentToFacebook (decideForm) va publish-facebook.mjs uu tien brief.assets.video -> POST /videos (file_url + description), roi anh /photos, roi chu /feed. Video dang async (FB tai ve xu ly, bai len sau vai giay). Khong doi luong duyet. -->
<!-- re-verified: 2026-08-12 - Them nut "Bo anh"/"Bo video" o Xuong san xuat (setImgId/setVidId rong). Dang Facebook: chi dang draft (bo dong tieu de dau) de khong lap ten san pham (decideForm + publish-facebook.mjs). Khong doi luong. -->
<!-- re-verified: 2026-08-12 - Tu dong sinh bai hang ngay (Vercel Cron): app/api/rotate/route.ts sinh 1-2 bai tu brand_assets theo vong xoay (rotation_cycle trong mkt_content.brief, khong lap trong vong, het thi cycle+1), day vao approval_queue pending (KHONG tu dang - dung dieu cam 1). vercel.json crons 0 1 * * *. middleware mien basic-auth cho /api/ (route tu bao ve bang CRON_SECRET). Kho tu lieu hien STT. Can env CRON_SECRET, ROTATE_PER_RUN (mac dinh 2). -->
<!-- re-verified: 2026-08-12 - Dat lai CRON_SECRET ro rang cho cron xoay vong, redeploy de app nhan. Khong doi logic. -->
<!-- re-verified: 2026-08-13 - decideForm/publishContentToFacebook (actions.ts) + publish-facebook.mjs: bai co CA anh lan video thi dang VIDEO kem caption roi THA ANH VAO BINH LUAN DAU cua bai video (POST /{videoId}/comments attachment_url). FB chan gop video+anh trong 1 post. Tha anh loi thi chi canh bao, KHONG danh hong bai (tranh dang lai video). Chi anh -> /photos, chi video -> /videos, khong co -> /feed: giu nguyen. -->
<!-- re-verified: 2026-08-13 - noi-dung/page.tsx (Quan ly bai viet): sap xep theo approval_queue.decided_at (fallback created_at) giam dan, bai vua duyet/xu ly nhay len dau. Lay them cot decided_at tu approval_queue. Khong doi luong duyet. -->
<!-- re-verified: 2026-08-13 - tu-lieu/page.tsx (Kho tu lieu): STT danh so RIENG theo loai (Anh rieng, Clip rieng, Logo rieng) thay vi 1 day chung tron ca anh lan clip. Chi doi cach hien STT badge, khong doi du lieu. actions.ts (decideForm dang FB): truoc khi tha anh vao binh luan bai video, CHO video xu ly xong (waitFacebookVideoReady poll /{id}?fields=status toi 24s, Authorization Bearer) roi moi comment - fix anh khong hien do comment luc video con dang xu ly (Reel/processing). -->
<!-- re-verified: 2026-08-13 - CHAN DOAN: actions.ts (decideForm) ghi run_log task=mkt.publish_facebook_ui voi detail.commentDebug = phan hoi THO cua FB khi tha anh vao binh luan (de biet vi sao anh khong hien). Them route /api/fb-diag?secret=CRON_SECRET (chi doc run_log, mien basic-auth qua middleware /api/). Nghi nguyen nhan: token FB thieu quyen pages_manage_engagement HOAC comment tren Reel/video-id bi chan - cho log that de xac dinh. -->
<!-- re-verified: 2026-08-13 - XAC DINH: log FB tra (#200) pages_manage_engagement + pages_read_user_content not available (HTTP 403) = token thieu quyen COMMENT (khong phai loi code). Fix = cap lai FACEBOOK_PAGE_ACCESS_TOKEN co them 2 quyen do. /api/fb-diag them tokenCheck: goi /me + debug_token de bao token la USER hay PAGE, co pages_manage_engagement chua, expiresAt=0 (vinh vien) chua - KHONG lo token, chi metadata. -->
<!-- re-verified: 2026-08-13 - TIKTOK P1 (Ket noi, huong Direct Post): them bang mkt_oauth_tokens (migration 20260813000000, RLS chi service_role). Route /api/tiktok/connect (redirect toi authorize TikTok, scope user.info.basic,video.publish,video.upload, state cookie chong CSRF) + /api/tiktok/callback (doi code lay token, upsert mkt_oauth_tokens). Trang /tiktok hien trang thai + nut Ket noi (them muc nav 'Ket noi'). Can env TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET, redirect URI https://sdvico-mktit.vercel.app/api/tiktok/callback. CHUA co P2 (dang video Direct Post) va chua co cron refresh token 24h. Public post can TikTok audit; chua audit chi dang duoc SELF_ONLY. -->
<!-- re-verified: 2026-08-13 - Them trang CONG KHAI /privacy + /terms (chinh sach quyen rieng tu + dieu khoan) de dien vao form app TikTok/Facebook (bat buoc, ke ca sandbox). middleware.ts mien basic-auth cho /privacy va /terms (ngoai /api/). Noi dung la ban nhap nen SDVICO ra soat phap ly. -->
<!-- re-verified: 2026-08-13 - TIKTOK P2 (dang video Direct Post): lib/tiktok.ts - getValidTikTokToken (tu refresh khi con <5phut, POST /v2/oauth/token grant_type=refresh_token) + postVideoToTikTok (creator_info -> init FILE_UPLOAD chunk -> PUT upload_url -> status/fetch). Chua audit nen ep privacy SELF_ONLY. Route /api/tiktok/test-post?secret=CRON_SECRET&asset=<id> dang thu 1 video (rieng tu), ghi run_log task=mkt.tiktok_test_post. CHUA ghep vao decideForm/Xuong san xuat (P3). -->
<!-- re-verified: 2026-08-13 - TIKTOK P3 (ghep vao luong): createContent luu brief.channels + payload.channels (tu form, mac dinh ['facebook']). Xuong san xuat (form.tsx) them checkbox 'Dang len' Facebook/TikTok khi kind=social (TikTok can video). decideForm doc payload.channels: facebook -> publishContentToFacebook, tiktok -> publishContentToTikTok (moi, dung lib/tiktok, ghi mkt_posts channel=tiktok + run_log mkt.publish_tiktok, khong dang lai bai da published). Bai cu khong co channels -> mac dinh facebook (giu hanh vi). Van bi chan public cho toi khi audit (account phai private de test). -->
<!-- re-verified: 2026-08-13 - Xuong san xuat (form.tsx): doi label select 'Kenh dang' -> 'Do dai text' voi option Bai ngan/Bai dai/Kich ban video (bo ten nen tang Facebook/Website/YouTube), vi kenh that gio o checkbox 'Dang len'. Chi doi nhan hien thi, gia tri kind (social/article/video) khong doi. -->
