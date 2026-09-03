import { NextResponse } from 'next/server';
import { getServerClient } from '../../../lib/supabase-server';
import { isAuthorizedApiRequest } from '../../../lib/session-auth';
import { collectTakenCovers, ensureCoverForContent } from '../../../lib/cover-image';

// 3/9 (user: "blog không được dính trùng ảnh"): quét các bài PUBLIC, bài nào thiếu ảnh riêng,
// ảnh chết, hay TRÙNG ảnh với bài khác thì gắn lại ảnh riêng (folder nhóm trước, không có thì
// Gemini kiếm Google CSE/Unsplash có chấm điểm — lib/cover-image.ts).
//
// Chạy theo LÔ để không vượt giới hạn thời gian serverless: mỗi lượt xử tối đa `limit` bài
// (mặc định 5), trả remaining — gọi lặp tới khi remaining = 0. Bảo vệ CRON_SECRET/phiên
// đăng nhập như các route vận hành khác. Chỉ ĐỌC + update brief, không đăng gì mới.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthorizedApiRequest(req))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 5, 10);
  const client = getServerClient();

  // Bài public theo thứ tự MỚI TRƯỚC — bài mới được ưu tiên giữ ảnh đang có, bài cũ nhường.
  const { data: postRows } = await client
    .from('mkt_posts')
    .select('content_id, published_at')
    .eq('status', 'published')
    .not('external_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(500);
  const seen = new Set<string>();
  const cids: string[] = [];
  for (const p of postRows || []) {
    const cid = (p as any).content_id as string | null;
    if (cid && !seen.has(cid)) { seen.add(cid); cids.push(cid); }
  }

  const taken = new Set<string>(); // cấp lại từ đầu theo thứ tự mới -> cũ, mỗi ảnh 1 bài
  const results: Array<{ id: string; via: string; note?: string }> = [];
  let fixed = 0;
  let remaining = 0;
  for (const cid of cids) {
    // Bài đã có ảnh riêng sống + chưa ai giữ thì ensure trả 'giu-nguyen' rất nhanh;
    // chỉ bài hỏng/trùng mới tốn lượt Gemini — đếm vào limit.
    const r = await ensureCoverForContent(client, cid, { taken });
    if (r.via !== 'giu-nguyen' && r.via !== 'skip') {
      fixed++;
      results.push({ id: cid.slice(0, 8), via: r.via, note: r.note });
      if (fixed >= limit) {
        remaining = cids.length - (cids.indexOf(cid) + 1);
        break;
      }
    }
  }

  await client.from('run_log').insert({
    task: 'mkt.backfill_covers',
    actor: 'nguoi-bam',
    status: 'ok',
    detail: { scanned: cids.length, fixed, remaining, results: results.slice(0, 10) },
  });
  return NextResponse.json({ ok: true, scanned: cids.length, fixed, remaining, results });
}
