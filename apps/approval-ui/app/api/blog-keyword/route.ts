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

// 25/9 (Thanh: "dcm sao nó vẫn cứ y như nhau vậy" — 5/6 bài gần nhất là "giám sát hành trình",
// 3 bài có "Hà Tĩnh"): giảm 3 → 2 bài/ngày; feed thưa hơn và ép chọn chủ đề đa dạng ở dưới.
const PICK_LIMIT = 2;
const CANDIDATE_LIMIT = 300; // đủ dư 192 từ hiện có, chừa chỗ kho lớn lên
// Không chọn từ khóa cùng chủ đề với bài đã đăng trong ngần này ngày (đo bằng ti lệ chữ chung).
const NEARBY_DAYS = 14;
const TOPIC_OVERLAP = 0.4; // >= 0.4 = trùng chủ đề, không pick

function normKeyword(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Từ dừng thường gặp — không tính vào so trùng chủ đề (nếu giữ thì mọi bài có chữ "tàu cá" đều
// bị coi là cùng chủ đề). Loại luôn động từ dịch vụ (sửa, thay, gia hạn, mua, lắp...) để
// "sửa thiết bị giám sát Hà Tĩnh" và "thay thiết bị giám sát Hà Tĩnh" ra chung 1 chủ đề.
const STOP = new Set([
  'là', 'gì', 'thế', 'nào', 'sao', 'của', 'cho', 'trên', 'dưới', 'ở', 'tại', 'và', 'hay', 'khi',
  'nếu', 'bằng', 'với', 'không', 'chưa', 'đâu', 'mua', 'bán', 'thuê', 'sửa', 'thay', 'lắp', 'đặt',
  'gia', 'hạn', 'cước', 'nạp', 'tiền', 'phí', 'giá', 'bao', 'nhiêu', 'nhất', 'rẻ', 'tốt', 'uy',
  'tín', 'chính', 'hãng', 'các', 'loại', 'kiểu', 'nào', 'này', 'kia', 'cần', 'phải'
]);

function topicTokens(s: string): Set<string> {
  return new Set(
    String(s || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP.has(w))
  );
}

function topicOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
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
  let govPicked = 0;
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
    // 25/9: BỎ ưu tiên "giám sát" trước (plan 18/9 cũ: ưu tiên vì 191/192 từ trống là cụm này —
    // nay đã đăng 4-5 bài giám sát trong 5 ngày, quá tải chủ đề). Sort thuần theo priority +
    // created_at asc để đi đều mọi cụm.
    eligible.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return ta - tb;
    });

    // 25/9 (Thanh: "y như nhau"): chống trùng chủ đề. Gom bag-of-words (bỏ stopword + động từ
    // dịch vụ) các bài article đã đăng trong NEARBY_DAYS ngày để biết chủ đề nào đang nóng.
    // Từ khóa nào rơi vào chủ đề đã có (overlap >= TOPIC_OVERLAP) thì bỏ qua ở lượt này; và
    // 3 bài chọn ra cũng KHÔNG được cùng chủ đề với nhau — pick từ khóa tiếp theo phải cách
    // xa tất cả bài đã pick trong lượt.
    const cutoff = new Date(Date.now() - NEARBY_DAYS * 24 * 3600 * 1000).toISOString();
    const { data: recentArticles } = await client
      .from('mkt_content')
      .select('brief,title,created_at')
      .eq('kind', 'article')
      .is('deleted_at', null)
      .gte('created_at', cutoff)
      .limit(60);
    const recentTopics = (recentArticles || []).map((r: any) =>
      topicTokens(r?.brief?.keyword || r?.title || '')
    );

    const chosen: any[] = [];
    const chosenTopics: Set<string>[] = [];
    const skipped: Array<{ keyword: string; reason: string }> = [];
    for (const k of eligible) {
      if (chosen.length >= PICK_LIMIT) break;
      const tk = topicTokens(k.keyword);
      const clashRecent = recentTopics.find((rt) => topicOverlap(tk, rt) >= TOPIC_OVERLAP);
      if (clashRecent) {
        skipped.push({ keyword: k.keyword, reason: 'trung chu de bai gan day' });
        continue;
      }
      const clashLot = chosenTopics.find((ct) => topicOverlap(tk, ct) >= TOPIC_OVERLAP);
      if (clashLot) {
        skipped.push({ keyword: k.keyword, reason: 'trung chu de bai khac trong lot' });
        continue;
      }
      chosen.push(k);
      chosenTopics.push(tk);
    }
    picked = chosen.length;

    for (const kw of chosen) {
      try {
        const forceReview = keywordNeedsGovReview(kw.keyword);
        // 21/9: at most 1 gov-review keyword per run so the manager approval queue grows slowly;
        // prefer keywords that can auto-publish to keep the blog moving without human bottleneck.
        if (forceReview && govPicked >= 1) continue;
        if (forceReview) govPicked++;
        const { blogUrl } = await generateForKw(client, kw, { forceReview, articleOnly: true });
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
      detail: { picked, published, review, ms: Date.now() - startedAt, errors: errors.slice(0, 5), results, skipped: skipped.slice(0, 10) }
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
