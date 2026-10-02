# Plan: 3 fix theo audit production lan 3 (2/10 toi)

Nen: e4a64ac. Thi cong boi Sonnet theo plan cua Fable.

## F1 (P0 SEO). Canonical san pham + chu de ve SELF
Audit do: sdvico.vn la SPA tra CUNG mot shell (~1.061 byte, title chung) cho MOI duong dan, ke ca duong dan rac. Canonical tro sang do la tro vao trang ngheo noi dung, Google co the gom trang san pham giau noi dung vao shell.
- `lib/seo.ts`: them `selfCanonicalUrl(path)` (= siteUrl() + path), bo `canonicalUrl`/`publicSiteOrigin`/env `PUBLIC_SITE_ORIGIN`.
- Ap cho `/san-pham`, `/san-pham/[slug]` (ca JSON-LD url), `/blog/chu-de/[slug]`.
- GIU canonical bai blog `/blog/[slug]` ve sdvico.vn (quyet dinh 7/9, so GSC dang chay). `/blog/trang/N` va chu-de trang N da self, them comment cung ly do.
- Dieu kien chuyen lai sdvico.vn: khi sdvico.vn render title/H1/noi dung tuong duong cho tung URL.
- Chi la metadata: che do render (ISR/static) khong doi.

## F2 (P1). Auto-refresh khong dong modal dang mo
Tai hien: /hang-doi dem 30s, modal "Xem bai viet" dang mo bi router.refresh() lam bien mat.
- `app/view-modal.tsx`: mo modal thi cong `document.body.dataset.modalOpen` (so dem, co co `counted` chong dem doi), dong/unmount thi tru va phat `sdvico:modal-closed`.
- `app/auto-refresh.tsx`: truoc khi refresh kiem `body.dataset.modalOpen > 0` hoac `dialog[open]` (du phong cho modal khong dung ViewModal). Co modal thi chi ghi no (`owed`). Tra no 1 lan khi modal dong (su kien `sdvico:modal-closed` hoac `close` cua dialog bat o pha capture) hoac khi tab hien lai ma modal da dong. Countdown hien thi giu nguyen. Cleanup day du trong useEffect.

## F3. Hotline public MOT NGUON
- Moi: `lib/public-contact.ts` (`PUBLIC_HOTLINE_DISPLAY`, `PUBLIC_HOTLINE_TEL`, env `PUBLIC_HOTLINE_DISPLAY`, mac dinh 0939 243 222).
- Thay: `app/root-shell.tsx` (header + footer public), `app/contact-buttons.tsx`, `app/san-pham/[slug]/page.tsx` (CTA cuoi trang, truoc la 1900), `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/xoa-du-lieu/page.tsx` (bo cau "bam phim nhanh" vi day la so truc tiep, khong qua tong dai).
- KHONG dung so trong noi dung bai may sinh (lib/gen, packages/marketing) va bot hoi dap noi bo.

## Verify
tsc --noEmit sach; `next build` xanh voi env gia; `/san-pham` static, `/san-pham/[slug]` va `/blog/chu-de/[slug]` SSG nhu truoc; HTML build co canonical self va 0939 243 222, khong con 1900 o trang public.
