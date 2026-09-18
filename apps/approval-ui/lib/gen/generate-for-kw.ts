// generate-for-kw.ts — lõi dùng CHUNG sinh 3 định dạng (web/Facebook/video) cho MỘT từ khóa.
//
// Refactor 18/9 (plan-seo-vong-kin-tu-khoa-18-09.md, việc A): trước đây generateForKw sống
// riêng trong app/generate-action.ts ('use server' — mọi export ở đó trở thành Server Action,
// không gọi thẳng được từ Route Handler vì tham số `client` không tuần tự hoá được). Tách ra
// module thuần TypeScript này để dùng chung cho CẢ BA nơi: 2 server action cũ (generateNow,
// generateFromKeyword) và route cron mới /api/blog-keyword — không chép code 2 bản.
import { slugify, siteUrl } from '../seo';
import { ensureCoverForContent } from '../cover-image';
// Các module sinh nội dung dùng chung (bản .mjs chép từ packages/marketing).
// @ts-ignore module JS không có kiểu
import { generateAllFormats } from './content.mjs';
// @ts-ignore
import { assessDraft, scanRegulation, REGULATION_TERMS } from './compliance.mjs';
// @ts-ignore
import { scanStyle } from './brand-voice-check.mjs';
// @ts-ignore
import { knownFactValues, testFactValues } from './product-facts.mjs';

const FORMATS = [
  { key: 'article', kind: 'article', channel: 'website', label: 'Website' },
  { key: 'social', kind: 'social', channel: 'facebook', label: 'Facebook' },
  { key: 'video', kind: 'video', channel: 'youtube', label: 'Video' }
];

// Cụm gợi chủ đề nhạy quy định nhà nước NGAY TỪ TỪ KHÓA, ngoài REGULATION_TERMS đã có trong
// compliance.mjs. Hai cụm "giám sát hành trình" và "quy định" không nằm trong REGULATION_TERMS
// (những từ đó chỉ lên cờ đỏ khi bản NHÁP viết ra đủ ngữ cảnh mét tàu — xem REGULATION_PATTERNS),
// nhưng điều cấm 3 muốn cấp quản lý duyệt ngay khi CHÍNH từ khóa đã gợi chủ đề này, không chờ
// bản nháp viết ra mới chặn. Cụm dịch vụ giám sát hành trình là nhóm ưu tiên cao nhất trong kho
// (191/192 từ chưa có bài) nên an toàn ở bước này quan trọng hơn tốc độ tự đăng.
const KEYWORD_GOV_HINTS = ['giám sát hành trình', 'quy định'];

// Từ khóa CÓ nhắc quy định nhà nước/IUU/Cục Thủy sản/Kiểm ngư/giám sát hành trình thì bắt buộc
// đi qua hàng đợi duyệt cấp quản lý, không được tự đăng blog dù bản nháp sinh ra sạch.
export function keywordNeedsGovReview(keyword: string): boolean {
  const t = String(keyword || '').toLowerCase();
  if (KEYWORD_GOV_HINTS.some((term) => t.includes(term))) return true;
  return (scanRegulation as any)(keyword).length > 0;
}
// Re-export để nơi khác (route cron) không phải import riêng compliance.mjs chỉ để lấy danh sách.
export { REGULATION_TERMS };

export type GenerateForKwResult = { count: number; gen: string; blogUrl: string | null };

// Lõi dùng chung cho nút "Sinh bài", nút "Viết bài" ở /tu-khoa, và cron /api/blog-keyword: sinh
// 3 định dạng cho MỘT từ khóa. 3/9 (user chốt): bản WEBSITE sạch (risk none, không chạm quy định)
// TỰ ĐĂNG blog luôn — blog là web của mình; chỉ bài NỀN TẢNG (Facebook/video) mới qua hàng đợi
// duyệt (điều cấm 1 giữ nguyên cho mọi kênh ngoài). Bài red/amber hoặc chạm quy định vẫn vào
// duyệt như cũ (điều cấm 3 tuyệt đối).
//
// opts.forceReview (18/9): ép risk tối thiểu 'red' — dùng khi CHÍNH từ khóa đã gợi chủ đề nhạy
// quy định (keywordNeedsGovReview), bất kể bản nháp sinh ra có sạch hay không.
export async function generateForKw(
  client: any,
  kw: any,
  opts: { forceReview?: boolean } = {}
): Promise<GenerateForKwResult> {
  const { data: factRows } = await client
    .from('product_facts')
    .select('category,brand,model,attribute,value,verified');
  const facts: any[] = factRows || [];
  const known = (knownFactValues as any)(facts);
  const testVals = (testFactValues as any)(facts);

  const all: any = await (generateAllFormats as any)(kw, { facts });
  let count = 0;
  let blogUrl: string | null = null;
  for (const fmt of FORMATS) {
    const piece = all[fmt.key];
    const text = `${piece.title}\n${piece.draft}`;
    const assess: any = (assessDraft as any)(text, { knownFactValues: known, testFactValues: testVals });
    const style: string[] = (scanStyle as any)(text);
    let risk = assess.risk === 'red' ? 'red' : assess.risk === 'amber' || style.length > 0 ? 'amber' : 'none';
    if (opts.forceReview && risk !== 'red') risk = 'red';
    const flagsAll = { ...assess.flags, style };
    const autoBlog = fmt.key === 'article' && risk === 'none';

    const { data: inserted } = await client
      .from('mkt_content')
      .insert({
        kind: fmt.kind,
        title: piece.title,
        // 18/9: brief.keyword_id + brief.keyword (nguyên văn từ kho) để trang /seo đếm được
        // bài đã viết theo TỪNG từ khóa (trước đây chỉ so brief.keyword lỏng lẻo).
        brief: { ...all.brief, format: fmt.key, risk, compliance: flagsAll, keyword_id: kw?.id ?? null },
        draft: piece.draft,
        status: autoBlog ? 'published' : risk === 'red' ? 'review' : 'draft',
        needs_gov_review: risk === 'red'
      })
      .select('id')
      .single();

    if (autoBlog && inserted?.id) {
      // Slug đúng format loadPublicPosts đang dò: <slug tiêu đề>-<8 ký tự đầu id>.
      const slug = `${slugify(piece.title)}-${String(inserted.id).slice(0, 8)}`;
      const url = `${siteUrl()}/blog/${slug}`;
      const { error: postErr } = await client.from('mkt_posts').insert({
        content_id: inserted.id,
        channel: 'website',
        status: 'published',
        external_url: url,
        published_at: new Date().toISOString()
      });
      if (!postErr) {
        blogUrl = url;
        // 3/9 (user: "blog không được dính trùng ảnh"): gắn ảnh RIÊNG cho bài ngay lúc đăng
        // — folder nhóm trước, không có thì Gemini kiếm Google/Unsplash có chấm điểm.
        // Best effort: thiếu ảnh chỉ ra placeholder, không chặn việc đăng.
        const cover = await ensureCoverForContent(client, inserted.id);
        await client.from('run_log').insert({
          task: 'mkt.blog_publish',
          actor: 'nguoi-bam',
          status: 'ok',
          detail: { content_id: inserted.id, url, keyword: kw.keyword, cover: cover.via, msg: 'bài Website sạch tự đăng blog' }
        });
        count++;
        continue; // đã đăng blog — KHÔNG vào hàng đợi duyệt
      }
      // Ghi mkt_posts lỗi -> rơi về đường duyệt bên dưới, không mất bài.
    }

    await client.from('approval_queue').insert({
      kind: 'mkt_publish_content',
      title: `[${fmt.label}] ${piece.title}`,
      payload: {
        content_id: inserted?.id,
        format: fmt.key,
        channel: fmt.channel,
        keyword: kw.keyword,
        intent: kw.intent,
        landing_url: kw.landing_url,
        risk,
        needs_manager_approval: assess.needsManagerApproval || (opts.forceReview && risk === 'red'),
        compliance: flagsAll
      },
      ref_table: 'mkt_content',
      ref_id: inserted?.id,
      status: 'pending'
    });
    count++;
  }
  return { count, gen: all.brief?.generator === 'gemini' ? 'Gemini' : 'bản mẫu', blogUrl };
}
