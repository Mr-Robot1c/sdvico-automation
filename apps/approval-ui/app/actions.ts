'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';

// Người quyết. Đọc từ form, cập nhật trạng thái, chỉ đổi mục còn pending.
export async function decideForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  const note = String(formData.get('note') || '');

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!id || !decision) return;

  const client = getServerClient();
  const { error } = await client
    .from('approval_queue')
    .update({ status: decision, decided_at: new Date().toISOString(), note: note || null })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  revalidatePath('/');
}

// Người quyết đưa một hồ sơ vào phỏng vấn. Điều cấm 2: máy chấm và xếp, người chọn ai đi tiếp.
// Chỉ chuyển được hồ sơ đang ở bước 'review' (đã chấm xong), tránh nhảy bước.
// Sau đó tác vụ hr-interview sẽ soạn câu hỏi và thư mời cho hồ sơ này.
export async function advanceToInterview(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  if (!appId) return;

  const client = getServerClient();
  const { error } = await client
    .from('hr_applications')
    .update({ stage: 'interview' })
    .eq('id', appId)
    .eq('stage', 'review');
  if (error) throw new Error(error.message);

  revalidatePath('/ho-so');
}

// Từ chối một ứng viên nguồn ngoài và XOÁ khỏi cơ sở dữ liệu.
// Nghị định 13: dữ liệu nguồn ngoài chưa có consent thì tối thiểu hóa, từ chối là xoá luôn.
// Chốt an toàn: chỉ xoá ứng viên nguồn ngoài chưa có consent, KHÔNG đụng ứng viên đã tự nộp.
export async function rejectSourced(formData: FormData) {
  const candidateId = String(formData.get('candidateId') || '');
  if (!candidateId) return;

  const client = getServerClient();
  const { data: cand, error: e1 } = await client
    .from('hr_candidates')
    .select('id, source, consent_at')
    .eq('id', candidateId)
    .single();
  if (e1) throw new Error(e1.message);

  const sourced = String(cand.source || '').startsWith('sourced');
  if (!sourced || cand.consent_at) {
    // Ứng viên đã tự nộp hoặc có consent thì không xoá cứng, tránh mất dữ liệu có nghĩa vụ lưu.
    throw new Error('Chỉ xoá được ứng viên nguồn ngoài chưa có consent.');
  }

  // Xoá ứng viên. Hồ sơ ứng tuyển liên kết tự xoá theo (on delete cascade).
  const { error: e2 } = await client.from('hr_candidates').delete().eq('id', candidateId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/ho-so');
}

// Lưu ghi chú của người duyệt cho một hồ sơ.
export async function saveNote(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const note = String(formData.get('note') || '').slice(0, 4000);
  if (!appId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_applications').update({ note: note || null }).eq('id', appId);
  if (error) throw new Error(error.message);
  revalidatePath('/ho-so');
}

// Lưu khung giờ phỏng vấn mong muốn. Nhận chuỗi giờ cách nhau bằng dấu phẩy, ví dụ 09:00, 14:00.
export async function saveWindows(formData: FormData) {
  const raw = String(formData.get('windows') || '');
  const times = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s));
  if (!times.length) return;
  const client = getServerClient();
  const { error } = await client
    .from('app_config')
    .upsert({ key: 'interview_windows', value: times, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  revalidatePath('/lich');
}

// Thêm một nền tảng đăng tuyển hoặc tìm ứng viên.
export async function addPlatform(formData: FormData) {
  const ten = String(formData.get('ten') || '').trim();
  const loai = String(formData.get('loai') || 'job_board');
  const ghi_chu = String(formData.get('ghi_chu') || '').trim() || null;
  if (!ten) return;
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').insert({ ten, loai, ghi_chu });
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Xoá một nền tảng.
export async function removePlatform(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Tạo một tin đăng ở trạng thái nháp hoặc đặt lịch.
export async function addJobPost(formData: FormData) {
  const tieu_de = String(formData.get('tieu_de') || '').trim();
  const platform_id = String(formData.get('platform_id') || '') || null;
  const scheduledRaw = String(formData.get('scheduled_at') || '').trim();
  if (!tieu_de) return;
  const scheduled_at = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
  const trang_thai = scheduled_at ? 'scheduled' : 'draft';
  const client = getServerClient();
  const { error } = await client.from('hr_job_posts').insert({ tieu_de, platform_id, scheduled_at, trang_thai });
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Đổi trạng thái tin đăng: đánh dấu đã đăng, huỷ, hoặc xoá.
export async function updateJobPost(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  if (!id) return;
  const client = getServerClient();
  if (action === 'delete') {
    const { error } = await client.from('hr_job_posts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } else if (action === 'posted') {
    const { error } = await client.from('hr_job_posts').update({ trang_thai: 'posted', posted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  } else if (action === 'cancel') {
    const { error } = await client.from('hr_job_posts').update({ trang_thai: 'cancelled' }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/dang-tin');
}

// Đưa một vị trí vào hàng đợi đăng Facebook: soạn nháp từ bản JD sẵn có rồi đẩy vào hàng đợi duyệt.
// Máy soạn, người bấm Duyệt (điều cấm 1). KHÔNG đăng gì ở đây. Worker publish-facebook mới đăng.
export async function queueFacebookPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;

  const client = getServerClient();
  const { data: job, error: e0 } = await client
    .from('hr_jobs')
    .select('id, title, location, short_desc, jd_versions')
    .eq('id', jobId)
    .single();
  if (e0) throw new Error(e0.message);

  // Vị trí đã có bài Facebook đang chờ hoặc đã đăng thì thôi, tránh trùng.
  const { data: existing } = await client
    .from('hr_job_posts')
    .select('id')
    .eq('job_id', jobId)
    .eq('kenh', 'facebook')
    .in('trang_thai', ['draft', 'scheduled', 'posted']);
  if (existing && existing.length) {
    revalidatePath('/dang-tin');
    return;
  }

  const versions = (job.jd_versions || {}) as Record<string, string>;
  let noi_dung = String(versions.facebook || '').trim();
  if (!noi_dung) {
    const dong = [`Công ty SDVICO tuyển ${job.title}${job.location ? ' tại ' + job.location : ''}.`];
    if (job.short_desc) dong.push('', String(job.short_desc).trim());
    dong.push('', 'Ứng tuyển: gửi CV về tuyendung@sdvico.vn. Hotline 1900 23 23 49.');
    noi_dung = dong.join('\n');
  }
  const tieu_de = `Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .insert({ job_id: jobId, kenh: 'facebook', tieu_de, noi_dung, trang_thai: 'draft' })
    .select('id')
    .single();
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await client.from('approval_queue').insert({
    kind: 'hr_job_post',
    title: tieu_de,
    payload: { post_id: post.id, job_id: jobId, kenh: 'facebook', dia_diem: job.location || null, body: noi_dung },
    ref_table: 'hr_job_posts',
    ref_id: post.id,
    status: 'pending'
  });
  if (e2) throw new Error(e2.message);

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Sửa nội dung bài đăng trước khi duyệt. Người sửa là người kiểm soát (điều cấm 1).
// Đồng bộ cả bản xem trong hàng đợi để trang Duyệt không lệch với nội dung sẽ đăng.
export async function editJobPostDraft(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  const noi_dung = String(formData.get('noi_dung') || '');
  if (!postId) return;

  const client = getServerClient();
  const { error } = await client.from('hr_job_posts').update({ noi_dung }).eq('id', postId);
  if (error) throw new Error(error.message);

  const { data: rows } = await client
    .from('approval_queue')
    .select('id, payload')
    .eq('ref_id', postId)
    .eq('kind', 'hr_job_post')
    .eq('status', 'pending');
  for (const row of rows || []) {
    const payload = { ...((row.payload || {}) as Record<string, unknown>), body: noi_dung };
    await client.from('approval_queue').update({ payload }).eq('id', row.id);
  }

  revalidatePath('/dang-tin');
  revalidatePath('/');
}
