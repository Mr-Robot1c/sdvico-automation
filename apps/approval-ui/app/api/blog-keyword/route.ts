import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../../lib/supabase-server';
import { generateForKw, keywordNeedsGovReview } from '../../../lib/gen/generate-for-kw';
import { bustCache, TAG } from '../../../lib/cached';

// /api/blog-keyword — vòng kín SEO việc A (plan-seo-vong-kin-tu-khoa-18-09.md): mỗi lần chạy bốc
// tối đa 3 từ khóa CHƯA có bài trong kho mkt_keywords (191/192 từ đang trống), sinh bài bằng lõi
// generateForKw dùng chung với nút "Viết bài" ở /tu-khoa. GitHub Actions gọi route này 1 lần/ngày
// (6h VN) — CRON_SECRET giống các route cron khác (mkt-metrics-pull, rotate).
//
// AN TOÀN (điều cấm 3): từ khóa CHẠM quy định nhà nước/IUU/Cục Thủy sản/Kiểm ngư/giám sát hành
// trình thì generateForKw được gọi với forceReview=true — bài không tự đăng, luôn rơi vào
// approval_queue chờ cấp quản lý duyệt, kể cả khi bản nháp sinh ra "sạch".
export const dynamic = 'force-dynamic';
// 3 từ khóa x 3 định dạng x Gemini (~20s timeout mỗi lần gọi) có thể mất vài phút.
export const maxDuration = 180;

const PICK_LIMIT = 3;
const CANDIDATE_LIMIT = 300; // đủ dư 192 từ hiện có, chừa chỗ kho lớn lên

function normKeyword(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const bearer = (req.headers.get('authorization') || '') === `Bearer ${secret}`;
    const query = url.searchParams.get('secret') === secret;
    if (!bearer && !query) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const client = getServerClient();
  const startedAt = Date.now();
  let picked = 0;
  let published = 0;
  let review = 0;
  const errors: string[] = [];
  const results: Array<{ keyword: string; blogUrl: string | null; error?: string }> = [];

  try {
    const { data: kwRows } = await client
      .from('mkt_keywords')
      .select('id,keyword,intent,landing_url,priority,created_at')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(CANDIDATE_LIMIT);
    const allKw = (kwRows || []) as any[];

    if (!allKw.length) {
      await client.from('run_log').insert({
        task: 'mkt.blog_keyword',
        actor: 'cron',
        status: 'ok',
        detail: { picked: 0, published: 0, review: 0, ms: Date.now() - startedAt, note: 'kho từ khóa trống' }
      });
      return NextResponse.json({ ok: true, picked: 0, published: 0, review: 0 });
    }

    // Từ khóa ĐÃ có bài: khớp brief->>keyword_id (đường mới, chính xác) HOẶC khớp đúng
    // brief->>keyword không phân biệt hoa thường (đường cũ, bài viết tay/trước 18/9 chỉ có
    // trường keyword). Một truy vấn duy nhất, gộp trong JS — tránh dò từng từ khóa một (192 lần).
    const { data: contentRows } = await client
      .from('mkt_content')
      .select('brief')
      .is('deleted_at', null)
      .not('brief', 'is', null)
      .limit(5000);
    const doneIds = new Set<string>();
    const doneKeywords = new Set<string>();
    for (const r of (contentRows || []) as any[]) {
      const b = r?.brief || {};
      if (b.keyword_id) doneIds.add(String(b.keyword_id));
      if (b.keyword) doneKeywords.add(normKeyword(b.keyword));
    }

    const eligible = allKw.filter((k) => !doneIds.has(String(k.id)) && !doneKeywords.has(normKeyword(k.keyword)));
    // Cụm dịch vụ giám sát hành trình đi trước ở CÙNG mức priority (plan 18/9: giá trị tra
    // cứu cao, ít đối thủ, 191/192 từ trống chủ yếu là cụm này). Array.sort ổn định (Node/V8)
    // nên thứ tự created_at asc trong cùng nhóm priority/giám-sát vẫn giữ nguyên.
    eligible.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const ag = /giám sát/i.test(a.keyword) ? 0 : 1;
      const bg = /giám sát/i.test(b.keyword) ? 0 : 1;
      return ag - bg;
    });
    const chosen = eligible.slice(0, PICK_LIMIT);
    picked = chosen.length;

    for (const kw of chosen) {
      try {
        const forceReview = keywordNeedsGovReview(kw.keyword);
        const { blogUrl } = await generateForKw(client, kw, { forceReview });
        if (blogUrl) published++; else review++;
        results.push({ keyword: kw.keyword, blogUrl });
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 200);
        errors.push(`${kw.keyword}: ${msg}`);
        results.push({ keyword: kw.keyword, blogUrl: null, error: msg });
      }
    }

    if (published > 0) bustCache(TAG.content);

    // 'error' chỉ khi CÓ từ khóa được bốc mà KHÔNG bài nào sinh được (toàn bộ đều lỗi); lỗi lẻ
    // tẻ giữa các từ khóa vẫn 'ok' (đã có bài xuất ra), chi tiết lỗi vẫn ghi trong detail.
    const status = picked > 0 && published + review === 0 ? 'error' : 'ok';
    await client.from('run_log').insert({
      task: 'mkt.blog_keyword',
      actor: 'cron',
      status,
      detail: { picked, published, review, ms: Date.now() - startedAt, errors: errors.slice(0, 5), results }
    });

    try {
      revalidatePath('/seo');
      revalidatePath('/tu-khoa');
      revalidatePath('/noi-dung');
      if (published > 0) revalidatePath('/blog');
    } catch { /* ngoài request context thì bỏ qua */ }

    return NextResponse.json({ ok: true, picked, published, review, errors: errors.slice(0, 5) });
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    try {
      await client.from('run_log').insert({
        task: 'mkt.blog_keyword',
        actor: 'cron',
        status: 'error',
        detail: { picked, published, review, ms: Date.now() - startedAt, error: msg }
      });
    } catch { /* không để lỗi ghi log làm hỏng phản hồi lỗi gốc */ }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
