// Lớp cơ sở dữ liệu cho việc sinh câu hỏi phỏng vấn.
// Chỉ lấy hồ sơ người đã chuyển sang bước 'interview' (điều cấm 2: người quyết ai đi tiếp).
// Khử trùng: bỏ hồ sơ đã có mục thư mời trong hàng đợi, tránh soạn lại.

// Lấy hồ sơ ở bước 'interview' chưa có thư mời trong approval_queue.
export async function fetchForInterview(client, { max = 20 } = {}) {
  const { data, error } = await client
    .from('hr_applications')
    .select('id, job_id, hr_candidates ( full_name, email, cv_json ), hr_jobs ( title )')
    .eq('stage', 'interview')
    .order('created_at', { ascending: true })
    .limit(max);
  if (error) throw new Error('Lấy hồ sơ phỏng vấn lỗi: ' + error.message);

  const apps = data || [];
  if (!apps.length) return [];

  const ids = apps.map((a) => a.id);
  const { data: existing, error: e2 } = await client
    .from('approval_queue')
    .select('ref_id')
    .eq('kind', 'hr_interview')
    .in('ref_id', ids);
  if (e2) throw new Error('Kiểm tra hàng đợi lỗi: ' + e2.message);

  const done = new Set((existing || []).map((r) => r.ref_id));
  return apps.filter((a) => !done.has(a.id));
}
