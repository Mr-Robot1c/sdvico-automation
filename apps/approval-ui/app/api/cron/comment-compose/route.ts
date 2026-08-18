// Vercel Cron: phân loại bình luận Facebook mới rồi xử lý theo đúng một trong ba hướng —
// muon_biet_them (soạn câu mời Messenger, đẩy hàng đợi duyệt), tich_cuc (tự react, không qua
// hàng đợi vì không phải "thư/tin nhắn"), khac (bỏ qua). Máy soạn, người bấm Duyệt (điều cấm 1)
// — chỉ nhánh muon_biet_them tạo nội dung công khai nên mới cần người duyệt.
// Bản song song của packages/hr/src/post/queue-comment-replies.mjs (chạy qua GitHub Actions).

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { groqChat } from '../../../../lib/groq';

export const runtime = 'nodejs';
export const maxDuration = 60;

const EMAIL = process.env.HR_CONTACT_EMAIL || 'inoudead@gmail.com';
const HOTLINE = '1900 23 23 49';
const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const REACT_LIMIT = Number(process.env.HR_FB_REACT_MAX_PER_DAY) || 50;

function verifyAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

const DETAIL_PATTERNS = [
  /\?/, /chi ti[eế]t/i, /gi[aá] (bao nhi[eê]u|c[aả]|nh[uư] th[eế] n[aà]o)/i, /l[uư][oơ]ng/i,
  /li[eê]n h[eệ]/i, /s[oố] ?(đi[eệ]n tho[aạ]i|dt)/i, /[uứ]ng tuy[eể]n/i, /y[eê]u c[aầ]u/i,
  /tuy[eể]n (kh[oô]ng|n[uữ]a)/i, /c[oò]n tuy[eể]n/i, /l[aà]m (ở ?đ[aâ]u|g[iì])/i,
];
const POSITIVE_PATTERNS = [
  /\bhay\b/i, /tuy[eệ]t/i, /[uủ]ng h[oộ]/i, /good/i, /tốt/i, /like/i, /qu[aá] (t[oố]t|hay|đ[eẹ]p)/i,
  /👍|❤️|😍|🔥|👏/,
];

function classifyHeuristic(comment: string): 'muon_biet_them' | 'tich_cuc' | 'khac' {
  const text = (comment || '').trim();
  if (!text) return 'khac';
  if (DETAIL_PATTERNS.some((re) => re.test(text))) return 'muon_biet_them';
  if (POSITIVE_PATTERNS.some((re) => re.test(text))) return 'tich_cuc';
  return 'khac';
}

async function classifyComment(comment: string): Promise<'muon_biet_them' | 'tich_cuc' | 'khac'> {
  const fallback = classifyHeuristic(comment);
  if (!comment?.trim()) return fallback;
  const system = [
    'Bạn phân loại bình luận Facebook dưới bài tuyển dụng của Công ty SDVICO thành đúng MỘT nhãn:',
    '- "muon_biet_them": hỏi thêm thông tin (lương, yêu cầu, cách ứng tuyển, còn tuyển không, liên hệ...) hoặc đặt câu hỏi bất kỳ.',
    '- "tich_cuc": chỉ khen, ủng hộ, KHÔNG hỏi gì thêm.',
    '- "khac": spam, không liên quan, tiêu cực, hoặc không rõ ý.',
    'Chỉ trả về JSON: {"nhan": "muon_biet_them"|"tich_cuc"|"khac"}, không kèm chữ nào khác.',
  ].join('\n');
  try {
    const text = await groqChat(system, comment, { json: true, temperature: 0, maxTokens: 40 });
    if (!text) return fallback;
    const obj = JSON.parse(text) as { nhan?: string };
    if (obj.nhan === 'muon_biet_them' || obj.nhan === 'tich_cuc' || obj.nhan === 'khac') return obj.nhan;
    return fallback;
  } catch {
    return fallback;
  }
}

function fallbackReply(email: string, hotline: string): string {
  return `Chào bạn, cảm ơn bạn đã quan tâm. Bạn nhắn tin trực tiếp cho page qua Messenger hoặc gửi CV về ${email} (hotline ${hotline}) để được tư vấn chi tiết hơn nhé.`;
}

function replySystemPrompt(email: string): string {
  return [
    'Bạn trả lời bình luận Facebook cho Công ty SDVICO, ngành thiết bị biển và thủy sản.',
    'Người bình luận đang hỏi thêm chi tiết. Mục tiêu duy nhất: cảm ơn ngắn gọn rồi MỜI HỌ NHẮN TIN',
    'TRỰC TIẾP QUA MESSENGER của trang (hoặc gửi CV) để được tư vấn kỹ hơn — KHÔNG trả lời chi tiết',
    'câu hỏi ngay tại bình luận công khai này.',
    'Độ dài 1 tới 2 câu, giọng gần gũi lịch sự.',
    'Không hứa hẹn kết quả tuyển dụng, không hứa lương/phúc lợi cụ thể nếu không có trong bài gốc (điều cấm 5).',
    'Không mô tả phần mềm đối tác như năng lực của SDVICO (điều cấm 4). Không tự trả lời số liệu/chi tiết ở đây.',
    `Câu mời phải nhắc rõ "nhắn Messenger" (hoặc "gửi CV về ${email}").`,
    'Số theo chuẩn Việt Nam. Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'Chỉ trả về câu trả lời, không kèm giải thích.',
  ].join('\n');
}

async function reactLike(fbCommentId: string): Promise<void> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN.');
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${fbCommentId}/likes`, {
    method: 'POST',
    body: new URLSearchParams({ access_token: token }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
}

export async function GET(req: Request) {
  if (!verifyAuth(req)) return new Response('Unauthorized', { status: 401 });

  const client = getServerClient();
  // Email/hotline liên hệ: ưu tiên Cài đặt (brand_config), rồi biến môi trường, cuối cùng mặc định.
  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { email?: string; hotline?: string };
  const email = brand.email || EMAIL;
  const hotline = brand.hotline || HOTLINE;
  let queued = 0;
  let reacted = 0;
  let ignored = 0;

  try {
    const { data: rows, error } = await client
      .from('hr_fb_comments')
      .select('id, job_post_id, fb_comment_id, from_name, message')
      .eq('trang_thai', 'new')
      .order('created_at', { ascending: true })
      .limit(20);
    if (error) throw new Error('Đọc hr_fb_comments: ' + error.message);

    for (const row of rows || []) {
      const nhan = await classifyComment(row.message || '');

      if (nhan === 'muon_biet_them') {
        let postContext = '';
        if (row.job_post_id) {
          const { data: post } = await client.from('hr_job_posts').select('tieu_de').eq('id', row.job_post_id).maybeSingle();
          postContext = post?.tieu_de || '';
        }
        let goiY = fallbackReply(email, hotline);
        let generator = 'fallback';
        if (row.message?.trim()) {
          const user = [postContext ? `Bài đăng gốc: ${postContext}` : '', `Bình luận cần trả lời: ${row.message}`].filter(Boolean).join('\n');
          const text = await groqChat(replySystemPrompt(email), user, { temperature: 0.5, maxTokens: 300 }).catch(() => null);
          if (text?.trim()) { goiY = text.trim(); generator = process.env.HR_POST_MODEL || process.env.HR_SCREEN_MODEL || 'openai/gpt-oss-120b'; }
        }

        await client.from('hr_fb_comments').update({ trang_thai: 'composed', phan_loai: nhan, goi_y_tra_loi: goiY }).eq('id', row.id);
        await client.from('approval_queue').insert({
          kind: 'fb_comment_reply',
          title: `Trả lời bình luận: ${row.from_name || 'ẩn danh'}`,
          payload: { comment_id: row.id, fb_comment_id: row.fb_comment_id, message: row.message, goi_y_tra_loi: goiY, nguon_soan: generator },
          ref_table: 'hr_fb_comments',
          ref_id: row.id,
          status: 'pending',
        });
        queued++;
        continue;
      }

      if (nhan === 'tich_cuc') {
        await client.from('hr_fb_comments').update({ phan_loai: nhan }).eq('id', row.id);
        try {
          const { data: stopRow } = await client.from('app_config').select('value').eq('key', 'emergency_stop').maybeSingle();
          if (stopRow?.value === true) continue;

          const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
          const { data: counter } = await client.from('daily_counters').select('count').eq('account', 'fb_comment_react').eq('kind', 'hr_fb_comment_react').eq('day', day).maybeSingle();
          const current = counter?.count || 0;
          if (current >= REACT_LIMIT) continue;
          await client.from('daily_counters').upsert({ account: 'fb_comment_react', kind: 'hr_fb_comment_react', day, count: current + 1 }, { onConflict: 'account,kind,day' });

          await reactLike(row.fb_comment_id as string);
          await client.from('hr_fb_comments').update({ trang_thai: 'reacted' }).eq('id', row.id);
          try { await client.from('run_log').insert({ task: 'hr.react_comment', status: 'ok', detail: { commentId: row.id } }); } catch {}
          reacted++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await client.from('hr_fb_comments').update({ trang_thai: 'failed' }).eq('id', row.id);
          try { await client.from('run_log').insert({ task: 'hr.react_comment', status: 'error', detail: { commentId: row.id, error: msg } }); } catch {}
        }
        continue;
      }

      await client.from('hr_fb_comments').update({ phan_loai: nhan, trang_thai: 'ignored' }).eq('id', row.id);
      ignored++;
    }

    try { await client.from('run_log').insert({ task: 'hr.queue_comment_replies', status: 'ok', detail: { queued, reacted, ignored } }); } catch {}
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.queue_comment_replies', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ queued, reacted, ignored });
}
