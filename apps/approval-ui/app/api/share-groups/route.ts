import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { isAuthorizedApiRequest } from '../../../lib/session-auth';

// Danh sách NHÓM Facebook dùng chung một nguồn: app_config 'mkt_share_groups'
// (user 20/8: nhóm lưu ở popover Quản lý bài viết phải khớp với lịch chia sẻ ở Kế hoạch —
// trước đây popover lưu localStorage riêng nên hai nơi lệch nhau).
// GET: trả { groups: [{id,label,url}] } — để mở, dữ liệu là tên + link group công khai.
// POST: 29/8 (audit bảo mật) PHẢI đăng nhập — /api/* được middleware miễn khóa nên trước
// đây ai cũng ghi đè được app_config và kích refreshLiveProposal (nhiều query + ghi
// mkt_plans) làm nặng database. Browser đã đăng nhập gửi kèm cookie sdvico_auth là qua.
export const dynamic = 'force-dynamic';
// POST còn làm mới đề xuất sống (nhiều query) — nới thời gian chạy để lưu tên nhóm không
// bị đứt giữa chừng trên Vercel.
export const maxDuration = 60;

type SavedGroup = { id: string; label: string; url: string };

// Group đã gỡ hẳn vì không còn đăng bài được (Thanh báo). POST ghi nguyên danh sách từ
// trình duyệt, nên tab nào còn giữ bản danh sách cũ mà bấm lưu là group đã gỡ quay lại
// (25/9 sáng đã xảy ra đúng vậy). Chặn cứng theo id để không thêm lại được.
const BANNED_GROUP_IDS = new Set([
  '339378517866408', // Máy Thủy Tàu Thuyền (gỡ 12/9)
  '1098764867171270', // MUA BÁN TÀU THUYỀN - NGƯ LƯỚI CỤ - HẬU CẦN NGHỀ CÁ (gỡ 24/9)
]);

function normalize(raw: any): SavedGroup[] {
  const arr = Array.isArray(raw?.groups) ? raw.groups : Array.isArray(raw) ? raw : [];
  const out: SavedGroup[] = [];
  for (const g of arr) {
    if (typeof g === 'string') {
      const id = g.trim();
      if (id && !BANNED_GROUP_IDS.has(id)) out.push({ id, label: id, url: `https://www.facebook.com/groups/${id}` });
    } else if (g && typeof g === 'object' && g.id && !BANNED_GROUP_IDS.has(String(g.id))) {
      out.push({
        id: String(g.id).slice(0, 120),
        label: String(g.label || g.id).slice(0, 120),
        url: String(g.url || `https://www.facebook.com/groups/${g.id}`).slice(0, 300),
      });
    }
  }
  // 11/9: danh sách thật 51 group nghề biển (đọc từ tài khoản Thanh) — trần 12 cũ cắt mất 39 nhóm
  // và POST từ popover (đổi tên) ghi đè còn 12. Nới 200, đủ cho mọi tài khoản.
  return out.slice(0, 200);
}

export async function GET() {
  const client = getServerClient();
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle();
  return NextResponse.json({ groups: normalize((data as any)?.value) });
}

export async function POST(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) {
    return NextResponse.json({ error: 'can dang nhap de doi danh sach nhom' }, { status: 401 });
  }
  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'body khong phai JSON' }, { status: 400 }); }
  const groups = normalize(body);
  const client = getServerClient();
  // Giữ các khóa phụ trong value (vết group đã bỏ: bo_khong_dang_duoc, bo_3_link_cu...)
  // — trước đây POST thay nguyên value nên các vết này bị xóa sạch mỗi lần lưu.
  const { data: cur } = await client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle();
  const curValue = (cur as any)?.value;
  const { error } = await client.from('app_config').upsert({
    key: 'mkt_share_groups',
    value: {
      ...(curValue && typeof curValue === 'object' && !Array.isArray(curValue) ? curValue : {}),
      groups,
      updated_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Cập nhật đề xuất sống ngay để lịch chia sẻ theo ngày dùng nhóm mới.
  try {
    const { refreshLiveProposal } = await import('../../../lib/plan-live');
    await refreshLiveProposal(client);
  } catch (e: any) {
    console.error('[share-groups] refresh live loi:', e?.message || e);
  }
  return NextResponse.json({ ok: true, groups });
}
