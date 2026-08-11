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
