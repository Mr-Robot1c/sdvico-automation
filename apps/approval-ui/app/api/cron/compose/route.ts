// Vercel Cron: soạn bài Facebook cho vị trí có auto_post=true và chưa có bài mới.
// Máy soạn, người bấm Duyệt (điều cấm 1). Không đăng ở đây.
// Chạy qua GitHub Actions (cron.yml, 15 phút một lần) vì Vercel Hobby không hỗ trợ cron dưới 1 ngày.

import { NextResponse } from 'next/server';
import { getServerClient } from '../../../../lib/supabase-server';
import { groqChat } from '../../../../lib/groq';
import { fetchUnsplashPhoto } from '../../../../lib/unsplash';
import { buildRecruitmentPoster, toBullets } from '../../../../lib/poster';

export const runtime = 'nodejs';
export const maxDuration = 60;

function verifyAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Production bắt buộc có CRON_SECRET (route này đã đi vòng qua cổng Basic Auth).
  // Thiếu secret ở production thì chặn, tránh mở endpoint ra ngoài.
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!verifyAuth(req)) return new Response('Unauthorized', { status: 401 });

  const client = getServerClient();
  const queued: string[] = [];
  const skipped: string[] = [];
  const refreshed: string[] = [];
  let firstError: string | null = null;

  const MAX_PENDING = 10;

  try {
    // Dừng sớm nếu hàng đợi đã có đủ bài chờ duyệt — tránh soạn thừa.
    const { count: pendingCount } = await client
      .from('approval_queue')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'hr_job_post')
      .eq('status', 'pending');
    if ((pendingCount ?? 0) >= MAX_PENDING) {
      await client.from('run_log').insert({ task: 'hr.queue_facebook', status: 'ok', detail: { queued: 0, reason: 'queue_full', pending: pendingCount } });
      return NextResponse.json({ queued: 0, refreshed: 0, skipped: 0, reason: 'queue_full', pending: pendingCount });
    }

    // Chỉ xử lý vị trí có auto_post=true và đang tuyển.
    const { data: autoJobs, error: e0 } = await client
      .from('hr_jobs')
      .select('id, title, department, location, short_desc, requirements, jd_versions, image_hint, status, refresh_after_days')
      .eq('status', 'open')
      .eq('auto_post', true)
      .order('created_at', { ascending: false });
    if (e0) throw new Error('Đọc hr_jobs: ' + e0.message);

    if (!autoJobs || autoJobs.length === 0) {
      await client.from('run_log').insert({ task: 'hr.queue_facebook', status: 'ok', detail: { queued: 0, reason: 'no_auto_jobs' } });
      return NextResponse.json({ queued: 0, refreshed: 0, skipped: 0 });
    }

    const jobIds = autoJobs.map((j: { id: string }) => j.id);

    // Quyền lợi lưu ở cột benefits (có thể chưa migrate trên DB cũ — đọc an toàn, thiếu thì bỏ qua).
    const benefitsById = new Map<string, string>();
    {
      const { data: benRows } = await client.from('hr_jobs').select('id, benefits').in('id', jobIds);
      for (const r of (benRows || []) as Array<{ id: string; benefits: string | null }>) {
        if (r.benefits) benefitsById.set(r.id, r.benefits);
      }
    }

    // Lấy tất cả bài Facebook theo các job: draft/scheduled/posted.
    const { data: allPosts } = await client
      .from('hr_job_posts')
      .select('id, job_id, trang_thai, posted_at, fb_post_id, tieu_de')
      .in('job_id', jobIds)
      .eq('kenh', 'facebook')
      .in('trang_thai', ['draft', 'scheduled', 'posted'])
      .order('created_at', { ascending: false });

    // Phân loại: bài draft/scheduled (đang chờ) và bài posted (đã đăng).
    const waitingByJob = new Map<string, boolean>();    // job đã có bài đang chờ
    const postedByJob = new Map<string, { id: string; posted_at: string | null; fb_post_id: string | null; tieu_de: string }>();

    for (const p of allPosts || []) {
      if (p.trang_thai === 'draft' || p.trang_thai === 'scheduled') {
        waitingByJob.set(p.job_id, true);
      } else if (p.trang_thai === 'posted' && !postedByJob.has(p.job_id)) {
        postedByJob.set(p.job_id, { id: p.id, posted_at: p.posted_at, fb_post_id: p.fb_post_id, tieu_de: p.tieu_de });
      }
    }

    // Cài đặt thương hiệu (logo, hotline, email, website).
    const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
    const brand = (brandRow?.value || {}) as { logo_url?: string; hotline?: string; email?: string; website?: string; company_name?: string; tagline?: string; poster?: { navy?: string; red?: string; accent?: string } };

    const contactEmail = process.env.HR_CONTACT_EMAIL || 'inoudead@gmail.com';
    const hotline = brand.hotline || '1900 23 23 49';

    for (const job of (autoJobs as Record<string, unknown>[]) || []) {
      const jobId = String(job.id);

      // Đã có bài đang chờ duyệt / đặt lịch → bỏ qua, không soạn trùng.
      if (waitingByJob.has(jobId)) {
        skipped.push(String(job.title));
        continue;
      }

      const refreshDays = Number(job.refresh_after_days) || 4;
      const existingPost = postedByJob.get(jobId);

      let isRefresh = false;
      if (existingPost) {
        // Bài đã đăng: kiểm tra có cần refresh không.
        if (!existingPost.posted_at) { skipped.push(String(job.title)); continue; }
        const daysSincePost = (Date.now() - new Date(existingPost.posted_at).getTime()) / 86400000;
        if (daysSincePost < refreshDays) {
          skipped.push(String(job.title));
          continue;
        }
        isRefresh = true;
      }

      const benefitsText = benefitsById.get(jobId) || '';
      const reqBullets = toBullets(job.requirements as string | null);
      const benBullets = toBullets(benefitsText);

      // Thông tin gốc để AI viết đúng, không bịa.
      const sourceInfo = [
        `Vị trí: ${job.title}`,
        job.location ? `Địa điểm: ${job.location}` : '',
        job.short_desc ? `Mô tả công việc: ${job.short_desc}` : '',
        job.requirements ? `Yêu cầu: ${job.requirements}` : '',
        benefitsText ? `Quyền lợi: ${benefitsText}` : '',
      ].filter(Boolean).join('\n');

      const contactLine = `Hotline/Zalo ${hotline}, gửi CV về ${contactEmail}`;
      const fallbackContent = [
        `🔥 SDVICO TUYỂN DỤNG: ${job.title}${job.location ? ` — ${job.location}` : ''} 📣`,
        '',
        job.short_desc ? String(job.short_desc) : '',
        job.requirements ? `\n✅ Yêu cầu:\n${job.requirements}` : '',
        benefitsText ? `\n🎁 Quyền lợi:\n${benefitsText}` : '',
        `\n📞 Liên hệ: ${contactLine}`,
      ].filter(Boolean).join('\n');

      const systemPrompt = [
        'Bạn là chuyên gia viết bài tuyển dụng cho Facebook, ngành biển và thủy sản Việt Nam.',
        isRefresh ? 'Viết LẠI bài cho một vị trí đã đăng trước — diễn đạt khác đi để tránh trùng.' : '',
        'Viết một bài tuyển dụng HOÀN CHỈNH, DÙNG ĐẦY ĐỦ mọi thông tin được cung cấp (gồm cả phần Mô tả công việc, mức lương, giờ làm nếu có nêu trong đó).',
        '',
        'Trường "bai" theo định dạng (emoji đầu mục, xuống dòng rõ ràng):',
        '- Dòng đầu: 🔥 SDVICO TUYỂN DỤNG: [tên vị trí] 📣',
        '- 1-2 câu hook gần gũi',
        '- 📍 Nơi làm việc (nếu có)',
        '- 💰 Mức lương (nếu Mô tả hoặc Quyền lợi có nêu)',
        '- 🕐 Giờ làm việc (nếu có nêu)',
        '- 📋 Công việc: tóm tắt từ phần Mô tả',
        '- ✅ Yêu cầu: MỖI Ý MỘT DÒNG, mỗi dòng bắt đầu bằng "- ", lấy đúng từ phần Yêu cầu',
        '- 🎁 Quyền lợi: MỖI Ý MỘT DÒNG, mỗi dòng bắt đầu bằng "- ", lấy đúng từ phần Quyền lợi',
        `- 📞 Liên hệ: ${contactLine}`,
        '- Câu chốt kêu gọi ngắn + 3-4 hashtag tiếng Việt',
        '',
        'QUAN TRỌNG về trình bày: các mục Yêu cầu và Quyền lợi phải LIỆT KÊ THEO DÒNG (mỗi ý xuống dòng riêng, bắt đầu bằng "- "). TUYỆT ĐỐI không gộp nhiều ý thành một câu dài ngăn cách bằng dấu phẩy, không viết ngang.',
        'Quy tắc: CHỈ dùng thông tin được cung cấp, KHÔNG bịa (điều cấm 5). Không mô tả phần mềm đối tác như năng lực SDVICO (điều cấm 4). Giọng gần gũi với thợ và ngư dân.',
        '',
        'Chỉ trả về JSON đúng dạng sau, không kèm chữ nào khác:',
        '{"bai": "<toàn bộ nội dung bài đăng>", "luong": "<mức lương ngắn gọn nếu có, vd 8-12 triệu; để trống nếu không nêu>", "gio_lam": "<giờ làm việc nếu có; để trống nếu không nêu>"}',
      ].filter(Boolean).join('\n');

      const [composed, unsplash_url] = await Promise.all([
        groqChat(systemPrompt, sourceInfo, { json: true, temperature: 0.7, maxTokens: 900 }).catch(() => null),
        fetchUnsplashPhoto(
          String(job.title),
          job.location ? String(job.location) : undefined,
          job.image_hint ? String(job.image_hint) : null
        ).catch(() => null),
      ]);

      let noi_dung = fallbackContent;
      let salary = '';
      let workingHours = '';
      if (composed) {
        try {
          const obj = JSON.parse(composed) as { bai?: string; luong?: string; gio_lam?: string };
          noi_dung = (obj.bai || '').trim() || fallbackContent;
          salary = (obj.luong || '').trim();
          workingHours = (obj.gio_lam || '').trim();
        } catch {
          noi_dung = composed.trim() || fallbackContent;
        }
      }

      // Ảnh = poster tuyển dụng (satori). Lỗi thì lùi về ảnh Unsplash/logo.
      let image_url: string | null = null;
      const posterBuf = await buildRecruitmentPoster({
        title: String(job.title),
        location: job.location ? String(job.location) : null,
        requirements: reqBullets,
        benefits: benBullets,
        salary,
        workingHours,
        brandName: brand.company_name || 'SDVICO',
        tagline: brand.tagline,
        website: brand.website,
        hotline: brand.hotline || hotline,
        photoUrl: unsplash_url,
        logoUrl: brand.logo_url,
        theme: brand.poster,
      });
      if (posterBuf) {
        const imgPath = `posts/${jobId}/poster-${Date.now()}.jpg`;
        const { error: upErr } = await client.storage
          .from('post-images')
          .upload(imgPath, posterBuf, { contentType: 'image/jpeg', upsert: true });
        image_url = upErr ? (unsplash_url || null) : client.storage.from('post-images').getPublicUrl(imgPath).data.publicUrl;
      } else {
        image_url = unsplash_url || brand.logo_url || null;
      }

      const tieu_de = isRefresh
        ? `[Refresh] Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`
        : `Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;

      const { data: post, error: e1 } = await client
        .from('hr_job_posts')
        .insert({ job_id: jobId, kenh: 'facebook', tieu_de, noi_dung, image_url, trang_thai: 'draft' })
        .select('id').single();
      if (e1) { firstError = firstError || e1.message; continue; }

      // Payload: nếu refresh thì đính kèm thông tin bài cũ để trang Duyệt hiển thị và người có thể chọn gỡ.
      const payload: Record<string, unknown> = {
        post_id: post.id,
        job_id: jobId,
        kenh: 'facebook',
        dia_diem: job.location || null,
        body: noi_dung,
        is_refresh: isRefresh,
      };
      if (isRefresh && existingPost) {
        payload.old_post_id = existingPost.id;
        payload.old_fb_post_id = existingPost.fb_post_id;
        payload.old_post_title = existingPost.tieu_de;
        payload.old_posted_at = existingPost.posted_at;
      }

      const { error: e2 } = await client.from('approval_queue').insert({
        kind: 'hr_job_post',
        title: tieu_de,
        payload,
        ref_table: 'hr_job_posts',
        ref_id: post.id,
        status: 'pending',
      });
      if (e2) { firstError = firstError || e2.message; continue; }

      if (isRefresh) refreshed.push(String(job.title));
      else queued.push(String(job.title));
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
      detail: { queued: queued.length, refreshed: refreshed.length, skipped: skipped.length, items: queued, refreshItems: refreshed, error: firstError },
    });
  } catch {}

  return NextResponse.json({ queued: queued.length, refreshed: refreshed.length, skipped: skipped.length, items: queued, refreshItems: refreshed });
}
