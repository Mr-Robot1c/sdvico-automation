// Vercel Cron: soạn bài Facebook cho vị trí đang tuyển chưa có bài.
// Máy soạn, người bấm Duyệt (điều cấm 1). Không đăng ở đây.
// Chạy mỗi 5 phút qua vercel.json, thay thế và bổ sung cho hr-compose.yml.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { groqChat } from '../../../../lib/groq';
import { fetchUnsplashPhoto } from '../../../../lib/unsplash';
import { overlayLogo } from '../../../../lib/image-composite';

export const runtime = 'nodejs';
export const maxDuration = 60;

function verifyAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!verifyAuth(req)) return new Response('Unauthorized', { status: 401 });

  const client = getServerClient();
  const queued: string[] = [];
  const skipped: string[] = [];
  let firstError: string | null = null;

  try {
    // Vị trí đang tuyển.
    const { data: openJobs, error: e0 } = await client
      .from('hr_jobs')
      .select('id, title, department, location, short_desc, requirements, jd_versions, image_hint, status')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (e0) throw new Error('Đọc hr_jobs: ' + e0.message);

    if (!openJobs || openJobs.length === 0) {
      await client.from('run_log').insert({ task: 'hr.queue_facebook', status: 'ok', detail: { queued: 0, reason: 'no_open_jobs' } });
      return NextResponse.json({ queued: 0, skipped: 0 });
    }

    // Bài Facebook đang hoạt động: draft / scheduled / posted.
    const jobIds = openJobs.map((j: { id: string }) => j.id);
    const { data: existingPosts } = await client
      .from('hr_job_posts')
      .select('job_id')
      .in('job_id', jobIds)
      .eq('kenh', 'facebook')
      .in('trang_thai', ['draft', 'scheduled', 'posted']);
    const alreadyQueued = new Set((existingPosts || []).map((p: { job_id: string }) => p.job_id));

    // Cài đặt thương hiệu (logo, hotline, email, website).
    const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
    const brand = (brandRow?.value || {}) as { logo_url?: string; hotline?: string; email?: string; website?: string };

    const contactEmail = process.env.HR_CONTACT_EMAIL || 'inoudead@gmail.com';
    const hotline = brand.hotline || '1900 23 23 49';

    for (const job of (openJobs as Record<string, unknown>[]) || []) {
      if (alreadyQueued.has(job.id as string)) {
        skipped.push(String(job.title));
        continue;
      }

      const versions = ((job.jd_versions as Record<string, string>) || {});
      const richInput = [versions.website, versions.job_board, versions.facebook]
        .map((v) => String(v || '').trim()).filter(Boolean)[0]
        || `Công ty SDVICO tuyển ${job.title}${job.location ? ' tại ' + job.location : ''}.`;

      const fallbackContent = [
        `Công ty SDVICO tuyển ${job.title}${job.location ? ' tại ' + job.location : ''}.`,
        job.short_desc ? '' : null,
        job.short_desc ? String(job.short_desc) : null,
        '',
        `Ứng tuyển: gửi CV về ${contactEmail}. Hotline ${hotline}.`,
      ].filter((l) => l !== null).join('\n');

      const [noi_dung_raw, unsplash_url] = await Promise.all([
        groqChat(
          [
            'Bạn là chuyên gia viết tuyển dụng cho Facebook của ngành biển và thủy sản Việt Nam.',
            'Nhiệm vụ: viết bài tuyển dụng đầy đủ thông tin, người đọc hiểu rõ vị trí ngay trên newsfeed.',
            '',
            'Cấu trúc bài (theo đúng thứ tự, không thêm tiêu đề phần):',
            '1. Hook 1-2 câu ngắn khơi gợi cảm xúc hoặc tò mò',
            '2. Vị trí tuyển và địa điểm (ví dụ: Kỹ sư điện — Vũng Tàu)',
            '3. Yêu cầu chính: 3-5 gạch đầu dòng "-", lấy từ bản gốc, ngắn gọn',
            '4. Quyền lợi hoặc điểm nổi bật nếu có trong bản gốc — bỏ qua nếu không có',
            `5. Cách ứng tuyển: gửi CV về ${contactEmail} hoặc gọi ${hotline}`,
            '6. 2-3 hashtag tiếng Việt phù hợp ngành',
            '',
            'Quy tắc cứng:',
            '- Không bịa lương, thưởng, phúc lợi, số liệu không có trong bản gốc (điều cấm 5)',
            '- Không mô tả phần mềm đối tác như năng lực của SDVICO (điều cấm 4)',
            '- Câu ngắn, xuống dòng nhiều, viết như người thật nói chuyện',
            '- 1-2 emoji tự nhiên nếu hợp. Độ dài 150-220 từ',
            '- Trả về nội dung bài đăng, không kèm giải thích',
          ].join('\n'),
          richInput,
          { temperature: 0.75, maxTokens: 600 }
        ).then((r) => r?.trim() || fallbackContent).catch(() => fallbackContent),
        fetchUnsplashPhoto(
          String(job.title),
          job.location ? String(job.location) : undefined,
          job.image_hint ? String(job.image_hint) : null
        ).catch(() => null),
      ]);

      const footerParts = [
        brand.hotline ? `Hotline: ${brand.hotline}` : null,
        brand.email ? `Email: ${brand.email}` : null,
        brand.website ? brand.website : null,
      ].filter(Boolean);
      const footer = footerParts.length ? '\n\n' + footerParts.join('  |  ') : '';
      const noi_dung = noi_dung_raw + footer;

      let image_url: string | null = null;
      if (unsplash_url && brand.logo_url) {
        try {
          const composited = await overlayLogo(unsplash_url, brand.logo_url, 'southeast');
          const imgPath = `posts/${job.id}/fb-${Date.now()}.jpg`;
          const { error: upErr } = await client.storage
            .from('post-images')
            .upload(imgPath, composited, { contentType: 'image/jpeg', upsert: true });
          image_url = upErr ? unsplash_url : client.storage.from('post-images').getPublicUrl(imgPath).data.publicUrl;
        } catch {
          image_url = unsplash_url;
        }
      } else {
        image_url = unsplash_url || brand.logo_url || null;
      }

      const tieu_de = `Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;

      const { data: post, error: e1 } = await client
        .from('hr_job_posts')
        .insert({ job_id: job.id, kenh: 'facebook', tieu_de, noi_dung, image_url, trang_thai: 'draft' })
        .select('id').single();
      if (e1) { firstError = firstError || e1.message; continue; }

      const { error: e2 } = await client.from('approval_queue').insert({
        kind: 'hr_job_post',
        title: tieu_de,
        payload: { post_id: post.id, job_id: job.id, kenh: 'facebook', dia_diem: job.location || null, body: noi_dung },
        ref_table: 'hr_job_posts',
        ref_id: post.id,
        status: 'pending',
      });
      if (e2) { firstError = firstError || e2.message; continue; }

      queued.push(String(job.title));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await client.from('run_log').insert({ task: 'hr.queue_facebook', status: 'error', detail: { error: msg } }); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    await client.from('run_log').insert({
      task: 'hr.queue_facebook',
      status: firstError ? 'error' : 'ok',
      detail: { queued: queued.length, skipped: skipped.length, items: queued, error: firstError },
    });
  } catch {}

  return NextResponse.json({ queued: queued.length, skipped: skipped.length, items: queued });
}
