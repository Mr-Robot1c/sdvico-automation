# Plan: "Lô hôm nay" cho nút Chia sẻ group (8 nhóm/ngày xoay đều 51 nhóm, có ghi nhận đã chia)

> Người thi công: Sonnet 5. Plan này tự chứa đủ ngữ cảnh, không cần transcript. Đọc hết trước khi gõ
> dòng code đầu tiên. Làm theo đúng thứ tự bước. Gặp điều kiện dừng ở mục 9 thì DỪNG và hỏi.

## 1. Bối cảnh (vì sao làm, đã điều tra được gì)

- Thanh (người vận hành marketing SDVICO) chia sẻ bài Page vào các group Facebook bằng tay: bấm nút
  **📣 Chia sẻ group** trên thẻ bài ở Bảng bài viết (`apps/approval-ui/app/noi-dung/bang-section.tsx`
  dòng ~551 gọi `<ShareGroups postUrl={fbRealUrl} planGroupsToday={groupsOfDay(lastAt)} />`), popover
  hiện link bài + danh sách group, mỗi group có nút "Mở" (mở tab group, người dán link và bấm Post).
  Facebook đã đóng Groups API từ 2020 nên KHÔNG có cách máy tự đăng vào group; luồng này là
  "máy soạn, người bấm" (điều cấm 1), giữ nguyên.
- 11/9/2026 danh sách group trong `app_config` khóa `mkt_share_groups` được cập nhật từ 9 link không
  tên lên **51 group nghề biển có tên** (đọc từ tài khoản Facebook của Thanh trên Edge). Dạng lưu:
  `{ groups: [{id, label, url}], updated_at, source: 'edge-tai-khoan-thanh-11-09', bo_3_link_cu: [...] }`.
- Thanh hỏi: "chia làm sao để chia sẻ thật nhiều đến các group trong 1 tuần". Facebook hạn chế tài
  khoản đăng cùng một link vào nhiều group trong thời gian ngắn (thực tế thường dính từ khoảng 10 lượt
  một giờ hoặc 20 tới 25 lượt một ngày). Cách an toàn: **mỗi ngày 8 group, 4 nhóm nhận bài bán buổi
  sáng, 4 nhóm nhận bài content buổi tối, mỗi group mỗi ngày tối đa 1 bài, xoay đều để mỗi group nhận
  đúng 1 bài trong 7 ngày**. Thanh đã đồng ý làm tính năng "Lô hôm nay" trong hệ thống.
- Hiện trạng code (đã điều tra, KHÔNG cần điều tra lại):
  - Popover hiện TẤT CẢ group hoặc lọc theo `planGroupsToday` (tên group của lịch đăng cố định ngày
    đó, mỗi ngày lịch chỉ gắn 1 group vào 1 slot, xem `apps/approval-ui/lib/posting-plan.ts`
    `proposePostingPlan` dòng ~160-195). Với 51 group, lọc theo lịch chỉ ra 1 nhóm/ngày, quá ít; hiện
    tất cả thì 51 dòng, không biết hôm nay nên chia nhóm nào, không nhớ đã chia nhóm nào.
  - Không có bảng nào ghi "bài X đã chia vào group Y lúc nào". Không có số liệu để đếm lượt chia sẻ.
  - **Đã vá trước (commit riêng, KHÔNG làm lại):** 3 chỗ cắt danh sách còn 12 phần tử
    (`app/api/share-groups/route.ts` normalize, `lib/posting-plan.ts` loadShareGroups,
    `lib/plan-live.ts` loadShareGroups) đã nới lên 200.

## 2. Kết quả mong muốn (định nghĩa tính năng)

1. Bảng mới `mkt_group_shares`: mỗi dòng = một lượt người đã chia bài vào một group (content_id,
   group_id, group_label, post_url, shared_at, shared_by). Không chứa dữ liệu cá nhân khách hàng.
2. Hàm server `computeShareLot(client, { contentId?, now? })` trả "lô hôm nay":
   - `lotSize` = 8 (đọc `app_config` khóa `mkt_share_lot_size` nếu có, số nguyên 1..30, mặc định 8).
   - Group đã có lượt chia HÔM NAY (giờ Việt Nam) LUÔN nằm trong lô (kể cả chia bài khác).
   - Phần còn lại của lô lấy từ các group **chưa chia hôm nay**, ưu tiên group **chưa từng chia** rồi
     group có `last_shared_at` cũ nhất; group đã chia trong **7 ngày gần nhất** chỉ được lấy khi không
     còn group nào khác (để đủ lô). Sắp xếp ổn định theo thứ tự trong `mkt_share_groups` khi bằng nhau.
   - Mỗi phần tử trả về: `{ id, label, url, sharedToday: { id, content_id, shared_at } | null,
     sharedThisPost: boolean, lastSharedAt: string | null, daysSince: number | null }`.
   - Kèm `doneToday` (số group đã chia hôm nay), `allGroups` (51 nhóm với `lastSharedAt`) để popover
     có "Xem tất cả".
3. API `/api/share-groups/shares`:
   - `GET ?content_id=<uuid|rỗng>` → `{ lot, lotSize, doneToday, allGroups, date }`.
   - `POST { content_id, group_id, post_url }` → chèn 1 dòng `mkt_group_shares`, trả dòng vừa chèn.
     Phải đăng nhập (`isAuthorizedApiRequest`). Chặn trùng: cùng content_id + group_id trong ngày thì
     trả dòng cũ, không chèn thêm.
   - `DELETE { id }` → xóa dòng (hoàn tác bấm nhầm). Phải đăng nhập.
   - Mỗi POST/DELETE ghi `run_log` task `mkt.group_share` actor `nguoi-bam` status `ok`.
4. Popover 📣 Chia sẻ group đổi thành: tiêu đề **"Lô hôm nay: đã chia 3/8 nhóm"**, danh sách 8 nhóm
   của lô, mỗi dòng: tên, nút **Mở**, nút **✓ Đã chia** (bấm → POST, đổi thành `✓ 10:32` + nút
   "Hoàn tác"). Nhóm đã nhận BÀI KHÁC hôm nay hiện mờ với chữ "đã nhận bài khác hôm nay", không có nút
   Đã chia. Nút **"Xem tất cả (51)"** mở danh sách đầy đủ, mỗi dòng ghi "chia lần cuối N ngày trước /
   chưa chia", vẫn có Mở + Đã chia (trường hợp ngoại lệ). Giữ ô thêm group + đổi tên + xóa như cũ.
   BỎ lọc theo `planGroupsToday` (không dùng nữa).
5. Trang Tổng quan, khối "Hôm nay" (`apps/approval-ui/app/tong-quan/page.tsx`): thêm một dòng dưới
   tiêu đề khối: `📣 Chia sẻ group hôm nay: 3/8 nhóm · còn: Nghề Biển, Dân Yêu Biển, ...` (tối đa 5 tên,
   thêm "…" nếu dài hơn). Khi 8/8: `📣 Chia sẻ group hôm nay: 8/8, đủ lô.`

## 3. Ràng buộc repo (BẮT BUỘC, executor không tự biết)

- Commit: author + committer `Mr-Robot1c <178200163+Mr-Robot1c@users.noreply.github.com>` (Vercel
  chặn deploy author lạ). Message `<loại>(<phạm vi>): <mô tả không dấu>`, kết thúc bằng dòng
  `Co-Authored-By: Claude ... <noreply@anthropic.com>` (model đang dùng).
- Hook pre-commit (`.githooks/pre-commit`) chặn commit nếu:
  - có migration mới mà `docs/app-map/database.md` không đổi trong cùng commit;
  - code đổi trong vùng `covers:` của doc app-map mà doc đó không có dòng
    `<!-- re-verified: <ngày> - <đã kiểm gì> -->` MỚI cùng commit. Vùng phủ liên quan plan này:
    `docs/app-map/README.md` (covers: packages/core, apps/approval-ui, supabase/migrations),
    `docs/app-map/database.md` (covers: supabase/migrations). Đã kiểm 11/9:
    `ke-hoach-ai-v2-ba-spec.md` chỉ phủ `apps/approval-ui/app/ke-hoach`, plan này không đụng thư mục
    đó nên KHÔNG cần sửa doc ấy. Nghĩa là commit có migration phải thêm dòng re-verified vào README.md
    và database.md; commit chỉ đụng apps/approval-ui thì chỉ README.md. Nếu hook vẫn đòi doc khác thì
    xem mục 9 (dừng, hỏi).
  - Hook có thể tự chạm ký tự xuống dòng (EOL) của các file docs/app-map khác và làm chúng hiện `M`
    sau commit: chạy `git checkout -- docs/app-map` ngay sau commit để bỏ, KHÔNG commit chúng.
- Điều cấm 1 (nguyên văn): "Máy soạn, người bấm gửi. Không tự động gửi thư hoặc tin nhắn tới ứng viên
  và khách hàng." Tính năng này chỉ GHI NHẬN người đã bấm chia sẻ, không tự đăng gì. Không được gọi
  bất kỳ API Facebook nào để đăng.
- Điều cấm 7: không commit khóa/mật khẩu. Không đụng `.env`.
- Deploy: ở checkout chính `C:/Users/ADMIN/Desktop/SDVICO Marketing` (nhánh `ngay2-marketing`),
  `git merge --ff-only <nhánh làm việc>` rồi `git push origin ngay2-marketing:main` (Vercel build từ
  main) và `git push origin ngay2-marketing`. KHÔNG bao giờ dùng `git stash` trần.
- Migration KHÔNG áp được từ máy (db-apply lỗi IPv6 từ 9/9). Đưa nguyên văn SQL cho Thanh dán vào
  Supabase SQL Editor (project `lluuoygdlaadtjsbnxbk`) TRƯỚC khi deploy code dùng bảng mới; code phải
  chịu được lúc bảng chưa có (bắt lỗi, coi như chưa có lượt chia nào, không làm vỡ trang).
- supabase-js: `insert/select` KHÔNG throw, phải kiểm `{ error }`.
- Giờ Việt Nam: "hôm nay" = ngày theo múi +07:00. Dùng đúng cách repo đang làm:
  `const dayStartIso = new Date(date + 'T00:00:00+07:00').toISOString()` với
  `date = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)` (xem
  `apps/approval-ui/lib/today-plan.ts` dòng 59-61, hàm `todayVNDate`).

## 4. Bẫy đã biết dính tới task này

- JSX: comment `{/* */}` bên trong biểu thức ternary là lỗi cú pháp; chữ xuống dòng cạnh `<span>` bị
  nuốt khoảng trắng, dùng `{' '}`.
- Popover ShareGroups render qua `createPortal` lên `document.body` và tự lưu danh sách group lên
  server khi bấm ra ngoài (`saveGroupsServer(groupsRef.current)` trong `useEffect` mousedown). Mọi
  nút mới trong popover phải nằm trong `popRef` để không bị coi là "bấm ra ngoài".
- `normalize()` trong `/api/share-groups/route.ts` là nguồn chuẩn cấu trúc group; hàm mới đọc group
  phải dùng lại `loadShareGroups` của `lib/posting-plan.ts` (đã export), KHÔNG viết bản parse thứ tư.
- Tổng quan là Server Component, `ShareGroups` là Client Component (`'use client'`). Lô hôm nay ở
  Tổng quan tính bằng hàm server; popover lấy qua API `fetch`.
- Windows: console in tiếng Việt lỗi mã; ghi file bằng Write tool là UTF-8. Đường dẫn dùng
  `C:/...` đầy đủ.
- `npm run build` của `apps/approval-ui` cần biến môi trường Supabase; nếu build fail vì thiếu env
  thì dùng `./node_modules/.bin/tsc --noEmit -p .` trong `apps/approval-ui` làm kiểm kiểu, và
  `node scripts/check-approval-gate.mjs` ở gốc repo.

## 5. Các bước (từng file, code cụ thể)

### Bước 1: migration bảng `mkt_group_shares`

Tạo file `supabase/migrations/20260911120000_mkt_group_shares.sql`:

```sql
-- 20260911120000_mkt_group_shares.sql
-- Ghi nhan NGUOI da chia bai Page vao group Facebook nao, luc nao (Thanh 11/9: chia 51 group theo
-- lo 8 nhom/ngay, xoay deu 7 ngay). May KHONG tu dang vao group (Groups API dong tu 2020, dieu cam 1);
-- bang nay chi la so ghi chep de xep lo hom nay + dem luot chia o Tong quan.
-- group_id = id trong app_config mkt_share_groups (so hoac slug), group_label = ten luc chia.
create table if not exists public.mkt_group_shares (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid references public.mkt_content(id) on delete set null,
  group_id     text not null,
  group_label  text,
  post_url     text,
  shared_at    timestamptz not null default now(),
  shared_by    text,
  source       text not null default 'popover',
  created_at   timestamptz not null default now()
);
create index if not exists mkt_group_shares_group_time_idx on public.mkt_group_shares (group_id, shared_at desc);
create index if not exists mkt_group_shares_time_idx on public.mkt_group_shares (shared_at desc);
alter table public.mkt_group_shares enable row level security;
do $$
begin
  drop policy if exists mkt_group_shares_staff_all on public.mkt_group_shares;
  create policy mkt_group_shares_staff_all on public.mkt_group_shares
    for all to authenticated using (true) with check (true);
end $$;
```

Cùng commit: `docs/app-map/database.md`
- đổi dòng `last_verified:` (dòng 5) thành `last_verified: 2026-09-11`;
- chèn ngay dưới dòng 6 (`ttl_days: 180`) một dòng:
  `<!-- re-verified: 2026-09-11 - Migration 20260911120000_mkt_group_shares: bang mkt_group_shares (content_id FK mkt_content set null, group_id, group_label, post_url, shared_at, shared_by, source) + 2 index + RLS staff_all. Ghi nhan nguoi da chia bai vao group (lo 8 nhom/ngay, Thanh 11/9). CHUA AP DB tu may (db-apply IPv6), Thanh chay SQL Editor. -->`
- thêm 1 dòng vào bảng danh sách bảng (ngay dưới dòng `| mkt_product_qa | ...`):
  `| mkt_group_shares | Marketing | Lượt người đã chia bài Page vào group Facebook (11/9): \`content_id\`, \`group_id\`, \`group_label\`, \`post_url\`, \`shared_at\`, \`shared_by\`. Nguồn cho "Lô hôm nay" của nút Chia sẻ group và số lượt chia ở Tổng quan. Máy chỉ ghi khi người bấm Đã chia, không tự đăng | Bật, staff |`
- `docs/app-map/README.md`: chèn 1 dòng re-verified (nội dung ở Bước 6) — có thể gộp toàn bộ plan
  vào 1 commit; nếu gộp thì README chỉ cần 1 dòng mô tả cả gói.

Verify bước 1: `node -e "require('fs').readFileSync('supabase/migrations/20260911120000_mkt_group_shares.sql','utf8')"` không lỗi; hook cho commit qua.

### Bước 2: hàm server `apps/approval-ui/lib/share-lot.ts` (file MỚI)

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadShareGroups, type ShareGroup } from './posting-plan';

// "Lô hôm nay" cho nút Chia sẻ group (Thanh 11/9): mỗi ngày LOT nhóm, mỗi nhóm mỗi ngày tối đa 1 bài,
// ưu tiên nhóm chưa từng chia rồi nhóm chia lâu nhất; nhóm đã chia trong 7 ngày chỉ lấy khi không
// còn nhóm khác. Nhóm đã chia HÔM NAY luôn nằm trong lô (kể cả chia bài khác) để đếm tiến độ.
// Bảng mkt_group_shares có thể CHƯA tồn tại (migration áp tay) -> coi như chưa có lượt nào.
type Client = SupabaseClient<any, any, any>;
export type ShareRow = { id: string; content_id: string | null; group_id: string; group_label: string | null; post_url: string | null; shared_at: string };
export type LotItem = ShareGroup & {
  sharedToday: { id: string; content_id: string | null; shared_at: string } | null;
  sharedThisPost: boolean;
  lastSharedAt: string | null;
  daysSince: number | null;
};
export type ShareLot = { date: string; lotSize: number; doneToday: number; lot: LotItem[]; allGroups: LotItem[] };

export const DEFAULT_LOT_SIZE = 8;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export function todayVNDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function loadLotSize(client: Client): Promise<number> {
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_share_lot_size').maybeSingle();
  const v = Number((data as any)?.value?.size ?? (data as any)?.value);
  return Number.isInteger(v) && v >= 1 && v <= 30 ? v : DEFAULT_LOT_SIZE;
}

export async function computeShareLot(client: Client, opts: { contentId?: string | null; now?: Date } = {}): Promise<ShareLot> {
  const now = opts.now || new Date();
  const date = todayVNDate(now);
  const dayStartIso = new Date(date + 'T00:00:00+07:00').toISOString();
  const [groups, lotSize] = await Promise.all([loadShareGroups(client), loadLotSize(client)]);
  // Lượt chia 30 ngày gần nhất là đủ để tính "chia lần cuối" cho xoay vòng 7 ngày.
  const sinceIso = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  let rows: ShareRow[] = [];
  const { data, error } = await client
    .from('mkt_group_shares')
    .select('id, content_id, group_id, group_label, post_url, shared_at')
    .gte('shared_at', sinceIso)
    .order('shared_at', { ascending: false })
    .limit(2000);
  if (!error && Array.isArray(data)) rows = data as ShareRow[];
  // error (ví dụ bảng chưa có) -> rows rỗng, không làm vỡ trang.

  const lastByGroup = new Map<string, string>();
  const todayByGroup = new Map<string, ShareRow>();
  const thisPostGroups = new Set<string>();
  for (const r of rows) {
    if (!lastByGroup.has(r.group_id)) lastByGroup.set(r.group_id, r.shared_at); // rows đã sort mới nhất trước
    if (r.shared_at >= dayStartIso && !todayByGroup.has(r.group_id)) todayByGroup.set(r.group_id, r);
    if (opts.contentId && r.content_id === opts.contentId) thisPostGroups.add(r.group_id);
  }
  const toItem = (g: ShareGroup): LotItem => {
    const last = lastByGroup.get(g.id) || null;
    const t = todayByGroup.get(g.id);
    return {
      ...g,
      sharedToday: t ? { id: t.id, content_id: t.content_id, shared_at: t.shared_at } : null,
      sharedThisPost: thisPostGroups.has(g.id),
      lastSharedAt: last,
      daysSince: last ? Math.floor((now.getTime() - new Date(last).getTime()) / (24 * 3600 * 1000)) : null,
    };
  };
  const allGroups = groups.map(toItem);
  const done = allGroups.filter((g) => g.sharedToday);
  const rest = allGroups.filter((g) => !g.sharedToday);
  // Ưu tiên: chưa từng chia -> chia lâu nhất; nhóm chia trong 7 ngày xếp cuối.
  const rank = (g: LotItem) => {
    if (!g.lastSharedAt) return 0;
    const age = now.getTime() - new Date(g.lastSharedAt).getTime();
    return age >= WEEK_MS ? 1 : 2;
  };
  const restSorted = rest
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const ra = rank(a.g); const rb = rank(b.g);
      if (ra !== rb) return ra - rb;
      const ta = a.g.lastSharedAt ? new Date(a.g.lastSharedAt).getTime() : 0;
      const tb = b.g.lastSharedAt ? new Date(b.g.lastSharedAt).getTime() : 0;
      if (ta !== tb) return ta - tb; // cũ hơn đứng trước
      return a.i - b.i;              // ổn định theo thứ tự danh sách
    })
    .map((x) => x.g);
  const lot = [...done, ...restSorted.slice(0, Math.max(0, lotSize - done.length))];
  return { date, lotSize, doneToday: done.length, lot, allGroups };
}
```

Kiểm: `ShareGroup` phải được export từ `lib/posting-plan.ts` (hiện file có `export type ShareGroup`
hoặc type nội bộ; nếu chưa export thì thêm `export` vào dòng khai báo type đó, không đổi cấu trúc).

### Bước 3: API `apps/approval-ui/app/api/share-groups/shares/route.ts` (file MỚI)

```ts
import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { isAuthorizedApiRequest } from '../../../../lib/session-auth';
import { computeShareLot, todayVNDate } from '../../../../lib/share-lot';

// Lượt người chia bài vào group (Thanh 11/9). Máy KHÔNG đăng gì lên Facebook (điều cấm 1, Groups API
// đã đóng); route này chỉ ghi/đọc sổ mkt_group_shares và tính "lô hôm nay".
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contentId = (url.searchParams.get('content_id') || '').trim() || null;
  const client = getServerClient();
  const lot = await computeShareLot(client, { contentId });
  return NextResponse.json(lot);
}

export async function POST(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) return NextResponse.json({ error: 'can dang nhap' }, { status: 401 });
  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body khong phai JSON' }, { status: 400 }); }
  const groupId = String(body?.group_id || '').trim().slice(0, 120);
  const contentId = String(body?.content_id || '').trim() || null;
  const postUrl = String(body?.post_url || '').trim().slice(0, 300) || null;
  const groupLabel = String(body?.group_label || '').trim().slice(0, 120) || null;
  if (!groupId) return NextResponse.json({ error: 'thieu group_id' }, { status: 400 });
  const client = getServerClient();
  const date = todayVNDate();
  const dayStartIso = new Date(date + 'T00:00:00+07:00').toISOString();
  // Chặn trùng: cùng bài + cùng group trong ngày thì trả dòng cũ.
  let dup = client.from('mkt_group_shares').select('id, content_id, group_id, group_label, post_url, shared_at').eq('group_id', groupId).gte('shared_at', dayStartIso).limit(1);
  dup = contentId ? dup.eq('content_id', contentId) : dup.is('content_id', null);
  const { data: old } = await dup.maybeSingle();
  if (old) return NextResponse.json({ ok: true, row: old, duplicate: true });
  const { data: row, error } = await client
    .from('mkt_group_shares')
    .insert({ content_id: contentId, group_id: groupId, group_label: groupLabel, post_url: postUrl, shared_by: 'nguoi-bam', source: 'popover' })
    .select('id, content_id, group_id, group_label, post_url, shared_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await client.from('run_log').insert({ task: 'mkt.group_share', actor: 'nguoi-bam', status: 'ok', detail: { content_id: contentId, group_id: groupId, group_label: groupLabel } }); } catch { /* bỏ qua */ }
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) return NextResponse.json({ error: 'can dang nhap' }, { status: 401 });
  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body khong phai JSON' }, { status: 400 }); }
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'thieu id' }, { status: 400 });
  const client = getServerClient();
  const { error } = await client.from('mkt_group_shares').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await client.from('run_log').insert({ task: 'mkt.group_share', actor: 'nguoi-bam', status: 'ok', detail: { undo: id } }); } catch { /* bỏ qua */ }
  return NextResponse.json({ ok: true });
}
```

Kiểm đường import: `apps/approval-ui/app/api/share-groups/route.ts` hiện import
`'../../../lib/supabase-server'` (3 cấp). Route mới nằm sâu thêm 1 thư mục (`shares/`) nên 4 cấp
`'../../../../lib/...'`. Nếu tsc báo không tìm thấy module thì đếm lại cấp, không đổi cấu trúc thư mục.

### Bước 4: popover `apps/approval-ui/app/noi-dung/share-groups.tsx`

4a. Đổi chữ ký props (dòng ~62-68). TRƯỚC:
```ts
export default function ShareGroups({
  postUrl,
  planGroupsToday = [],
}: {
  postUrl: string;
  planGroupsToday?: string[];
}) {
```
SAU:
```ts
export default function ShareGroups({
  postUrl,
  contentId = null,
}: {
  postUrl: string;
  contentId?: string | null;
}) {
```
Xóa hẳn hai hàm `norm` và `matchesPlan` (dòng ~48-60) vì không còn dùng (tsc sẽ báo unused nếu giữ).

4b. Thêm state + tải lô khi mở popover. Ngay sau `const [showAll, setShowAll] = useState(false);` thêm:
```ts
  type LotItem = SavedGroup & { sharedToday: { id: string; content_id: string | null; shared_at: string } | null; sharedThisPost: boolean; lastSharedAt: string | null; daysSince: number | null };
  const [lot, setLot] = useState<{ lotSize: number; doneToday: number; lot: LotItem[]; allGroups: LotItem[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadLot = async () => {
    try {
      const r = await fetch(`/api/share-groups/shares?content_id=${encodeURIComponent(contentId || '')}`, { cache: 'no-store' });
      if (r.ok) setLot(await r.json());
    } catch { /* giữ lô cũ */ }
  };
  useEffect(() => { if (open) loadLot(); }, [open]);
  const markShared = async (g: LotItem) => {
    setBusyId(g.id);
    try {
      const r = await fetch('/api/share-groups/shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId, group_id: g.id, group_label: g.label, post_url: postUrl }),
      });
      if (!r.ok) alert('Không ghi được lượt chia (' + r.status + '). Thử lại.');
      await loadLot();
    } finally { setBusyId(null); }
  };
  const undoShared = async (g: LotItem) => {
    if (!g.sharedToday) return;
    setBusyId(g.id);
    try {
      await fetch('/api/share-groups/shares', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.sharedToday.id }) });
      await loadLot();
    } finally { setBusyId(null); }
  };
  const fmtHHmm = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
```
Lưu ý: `useEffect` gọi `loadLot` cần `// eslint-disable-next-line react-hooks/exhaustive-deps` nếu
lint cấm; giữ mảng phụ thuộc `[open]`.

4c. Thay TOÀN BỘ khối `{(() => { ... })()}` (từ dòng có comment `// Filter theo plan groups của
ngày bài đăng` tới dấu `})()}` đóng, hiện dòng ~187-275) bằng khối mới:
```tsx
          {(() => {
            const items: LotItem[] = showAll
              ? (lot?.allGroups || groups.map((g) => ({ ...g, sharedToday: null, sharedThisPost: false, lastSharedAt: null, daysSince: null })))
              : (lot?.lot || []);
            const size = lot?.lotSize ?? 8;
            const done = lot?.doneToday ?? 0;
            const renderRow = (g: LotItem) => {
              const otherPostToday = !!g.sharedToday && !g.sharedThisPost;
              return (
                <li key={g.id} style={{ display: 'flex', gap: 4, alignItems: 'center', opacity: otherPostToday ? 0.55 : 1 }}>
                  <input
                    value={g.label}
                    onChange={(e) => renameGroup(g.id, e.target.value)}
                    onBlur={commitRename}
                    placeholder="Đặt tên gợi nhớ..."
                    style={{ flex: 1, minWidth: 0, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 12, background: 'var(--surface)', color: 'var(--ink)' }}
                    title={`ID: ${g.id}${g.lastSharedAt ? ` · chia lần cuối ${g.daysSince === 0 ? 'hôm nay' : `${g.daysSince} ngày trước`}` : ' · chưa chia lần nào'}`}
                  />
                  {showAll ? (
                    <span className="sub" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                      {g.lastSharedAt ? (g.daysSince === 0 ? 'hôm nay' : `${g.daysSince} ngày`) : 'chưa chia'}
                    </span>
                  ) : null}
                  <a className="btn ok sm" href={g.url} target="_blank" rel="noreferrer" title="Mở group (đã copy link ở trên, dán vào ô Tạo bài viết)">Mở</a>
                  {otherPostToday ? (
                    <span className="sub" style={{ fontSize: 10, whiteSpace: 'nowrap' }} title="Mỗi group mỗi ngày 1 bài">đã nhận bài khác hôm nay</span>
                  ) : g.sharedThisPost && g.sharedToday ? (
                    <>
                      <span className="badge tone-ok" style={{ fontSize: 10 }}>✓ {fmtHHmm(g.sharedToday.shared_at)}</span>
                      <button type="button" className="btn ghost sm" disabled={busyId === g.id} onClick={() => undoShared(g)} title="Bấm nhầm thì hoàn tác">Hoàn tác</button>
                    </>
                  ) : (
                    <button type="button" className="btn sm" disabled={busyId === g.id} onClick={() => markShared(g)} title="Đã dán link và bấm Post trong group này">✓ Đã chia</button>
                  )}
                  <button type="button" className="btn no sm" onClick={() => removeGroup(g.id)} aria-label="Xoá" title="Xoá khỏi danh sách">✕</button>
                </li>
              );
            };
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {showAll ? <>Tất cả group ({groups.length}):</> : <>📣 <b>Lô hôm nay: đã chia {done}/{size} nhóm</b></>}
                  </div>
                  <button type="button" onClick={() => setShowAll(!showAll)} className="btn ghost sm" style={{ padding: '2px 8px', fontSize: 11 }}
                    title={showAll ? 'Về lô hôm nay' : 'Hiện tất cả group kèm ngày chia gần nhất'}>
                    {showAll ? `📣 Lô hôm nay (${size})` : `👁 Xem tất cả (${groups.length})`}
                  </button>
                </div>
                {!showAll ? (
                  <p className="sub" style={{ margin: '0 0 6px', fontSize: 11 }}>
                    Mỗi ngày {size} nhóm, mỗi nhóm 1 bài, xoay đều để 7 ngày phủ hết. Dán link, bấm Post trong group rồi bấm ✓ Đã chia.
                  </p>
                ) : null}
                {items.length === 0 ? (
                  <p className="sub" style={{ margin: '0 0 8px' }}>{groups.length ? 'Đang tải lô hôm nay...' : 'Chưa có group nào. Thêm bên dưới.'}</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map(renderRow)}
                  </ul>
                )}
              </>
            );
          })()}
```
Giữ nguyên phần dưới (ô thêm group + nút Thêm) và nút 📣 ngoài cùng. Sau `addGroup`/`removeGroup`
thành công gọi thêm `loadLot()` để lô cập nhật.

4d. Nút gọi ở `apps/approval-ui/app/noi-dung/bang-section.tsx` dòng ~551. TRƯỚC:
```tsx
<ShareGroups postUrl={fbRealUrl} planGroupsToday={groupsOfDay(lastAt)} />
```
SAU:
```tsx
<ShareGroups postUrl={fbRealUrl} contentId={it.cid} />
```
`it.cid` là id bài trong scope đó (đã kiểm: 2 dòng phía trên có `<LinkFbButton contentId={it.cid} ... />`
dùng cùng biến). Nếu sau đó `groupsOfDay` (dòng ~68-74) không còn ai gọi thì xóa hàm đó và bỏ import
`groupsForDate` nếu không còn dùng, để tsc không báo unused.

### Bước 5: Tổng quan `apps/approval-ui/app/tong-quan/page.tsx`

5a. Thêm import: `import { computeShareLot } from '../../lib/share-lot';`

5b. Trong `Promise.all` (dòng ~77-110) thêm phần tử cuối `computeShareLot(client)` và nhận vào biến
`shareLot` ở destructuring cùng vị trí (thêm cuối mảng tên biến).

5c. Ngay sau dòng chứa `todayView.overridden ? ' · ✏️ lịch riêng hôm nay' : ''` (dòng ~322, kết thúc
`</span>`), thêm:
```tsx
        <p className="sub" style={{ margin: '4px 0 8px', fontSize: '.85rem' }}>
          📣 Chia sẻ group hôm nay: <b>{fmt(shareLot.doneToday)}/{fmt(shareLot.lotSize)}</b> nhóm
          {shareLot.doneToday >= shareLot.lotSize
            ? ', đủ lô.'
            : <> · còn: {shareLot.lot.filter((g) => !g.sharedToday).slice(0, 5).map((g) => g.label).join(', ')}{shareLot.lot.filter((g) => !g.sharedToday).length > 5 ? '…' : ''}. Bấm 📣 Chia sẻ group trên thẻ bài đã đăng.</>}
        </p>
```
`fmt` là hàm định dạng số đã có trong file (dùng ở `fmt(todayView.counts.total)`).

### Bước 6: doc app-map + commit + deploy

- `docs/app-map/README.md`: chèn 1 dòng ngay sau dòng `covers:` (dòng 5):
  `<!-- re-verified: 2026-09-11 - LO CHIA SE GROUP (Thanh 11/9, 51 group nghe bien): lib/share-lot.ts computeShareLot (lo 8 nhom/ngay tu app_config mkt_share_lot_size, uu tien chua chia -> chia lau nhat, nhom chia trong 7 ngay xep cuoi, nhom da chia hom nay luon trong lo; bang mkt_group_shares chua co thi coi nhu 0 luot); app/api/share-groups/shares/route.ts GET lo + POST ghi luot (chan trung theo ngay) + DELETE hoan tac, POST/DELETE can dang nhap, ghi run_log mkt.group_share; noi-dung/share-groups.tsx popover doi thanh "Lo hom nay: da chia n/8", nut Da chia / Hoan tac, Xem tat ca kem ngay chia gan nhat, BO loc planGroupsToday; bang-section truyen contentId; tong-quan khoi Hom nay them dong tien do chia group. May KHONG dang len group (dieu cam 1). -->`
- Commit (1 hoặc 2 commit đều được; nếu 1 commit thì message):
  `feat(share-groups): lo hom nay 8 nhom/ngay xoay 51 group + so ghi luot da chia (mkt_group_shares) + tien do o Tong quan (Thanh 11/9); re-verify(docs/app-map/README.md, database.md)`
- Sau commit: `git checkout -- docs/app-map` (bỏ file hook chạm EOL), rồi deploy theo mục 3.

## 6. Verify

1. Kiểm kiểu: trong `apps/approval-ui` chạy `./node_modules/.bin/tsc --noEmit -p .` → không in lỗi,
   exit 0. Nếu có env đủ, `npm run build` → "✓ Compiled successfully".
2. Gate: ở gốc repo `node scripts/check-approval-gate.mjs` → dòng `check-approval-gate: OK`.
3. Hook: commit qua, không còn `BLOCK:`.
4. Sau deploy (Vercel Production Ready, xem `vercel ls sdvico-mktit` trong Git Bash):
   - `curl -s https://sdvico-mktit.vercel.app/api/share-groups | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).groups.length))"` → `51`.
   - `curl -s "https://sdvico-mktit.vercel.app/api/share-groups/shares"` → JSON có `"lotSize":8` và
     `"lot"` đúng 8 phần tử (khi bảng chưa áp: `doneToday: 0`, lot = 8 nhóm đầu danh sách).
   - Đăng nhập web, Bảng bài viết, thẻ bài đã đăng Facebook, bấm 📣 → thấy "Lô hôm nay: đã chia 0/8
     nhóm", 8 dòng, mỗi dòng có Mở và ✓ Đã chia. Bấm ✓ ở 1 nhóm → dòng đổi thành `✓ HH:MM` + Hoàn tác,
     tiêu đề thành 1/8. Tổng quan: dòng "📣 Chia sẻ group hôm nay: 1/8 nhóm · còn: ...".
   - Mở popover của MỘT BÀI KHÁC → nhóm vừa chia hiện mờ "đã nhận bài khác hôm nay".
   - Bấm Hoàn tác → về 0/8. Supabase: bảng `mkt_group_shares` có/hết dòng tương ứng; `run_log` có
     task `mkt.group_share`.

## 7. SQL đưa cho Thanh chạy trong Supabase SQL Editor (project lluuoygdlaadtjsbnxbk)

Đúng nguyên văn nội dung file migration ở Bước 1. Chạy TRƯỚC khi bấm ✓ Đã chia lần đầu (code chịu
được lúc chưa có bảng nhưng POST sẽ trả lỗi 500 "relation does not exist" cho tới khi áp).

## 8. Không làm trong plan này (để tránh lan)

- Không đổi thuật toán gán group vào slot của lịch đăng cố định (`proposePostingPlan`); chip 👥 ở bảng
  Hôm nay giữ nguyên.
- Không tự đăng, không mở tab hàng loạt, không đếm ngược tự động; không đụng Facebook API.
- Không thêm nút "Đã chia" ở trang Kế hoạch hay Đo lường.
- Không xóa `bo_3_link_cu` trong app_config.

## 9. Điều kiện dừng (DỪNG và hỏi, không tự chế)

- tsc/build lỗi ở file KHÔNG nằm trong plan (ngoài 8 file: migration, database.md, README.md,
  share-lot.ts, shares/route.ts, share-groups.tsx, bang-section.tsx, tong-quan/page.tsx).
- Hook chặn vì một doc app-map khác không kể trong plan đòi re-verified.
- `bang-section.tsx` ở dòng gọi ShareGroups không có biến id bài trong scope (không đoán, hỏi).
- `lib/posting-plan.ts` không export `ShareGroup`/`loadShareGroups` và không thêm được `export` vì xung
  đột tên.
- Vercel build fail sau push.

## 10. Definition of Done

- [ ] Migration file + 2 doc app-map (database.md, README.md) cùng commit, hook qua.
- [ ] `lib/share-lot.ts`, `api/share-groups/shares/route.ts` mới; popover, bang-section, tong-quan sửa
      như Bước 4-5; tsc exit 0; check-approval-gate OK.
- [ ] Đã merge ff vào `ngay2-marketing`, push `ngay2-marketing:main` và `ngay2-marketing`; Vercel
      Production Ready.
- [ ] `/api/share-groups` trả 51 group; `/api/share-groups/shares` trả lot 8.
- [ ] Đã gửi Thanh SQL mục 7 và câu hướng dẫn: "Chạy SQL này trong SQL Editor rồi vào Bảng bài viết bấm
      📣 Chia sẻ group, bấm ✓ Đã chia sau mỗi group; Tổng quan hiện tiến độ n/8."
- [ ] Ghi memory (file `sdvico-group-facebook-11-09.md` hoặc file mới): tính năng lô 8 nhóm/ngày đã
      deploy, commit hash, migration đã/chưa áp.
