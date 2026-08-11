// Lớp cơ sở dữ liệu cho việc chấm CV.
// Lấy hồ sơ chưa chấm, ghi kết quả chấm. Điều cấm 6: dữ liệu nằm trong Supabase công ty.

// Lấy các hồ sơ chưa chấm (score_json rỗng), kèm cv_json của ứng viên.
// Chỉ lấy hồ sơ đang ở bước 'new'. Không đụng hồ sơ người đã xử lý tay.
export async function fetchUnscored(client, { max = 50 } = {}) {
  const { data, error } = await client
    .from('hr_applications')
    .select('id, candidate_id, stage, hr_candidates ( id, cv_json )')
    .is('score_json', null)
    .eq('stage', 'new')
    .order('created_at', { ascending: true })
    .limit(max);
  if (error) throw new Error('Lấy hồ sơ chưa chấm lỗi: ' + error.message);
  return data || [];
}

// Ghi kết quả chấm vào hồ sơ và chuyển sang bước 'review' để người xem xếp hạng.
// KHÔNG tự chuyển sang 'rejected' (điều cấm 2): máy chấm, người quyết.
export async function saveScore(client, applicationId, result) {
  const { error } = await client
    .from('hr_applications')
    .update({
      score_json: result.score_json,
      summary: result.summary,
      strengths: result.strengths,
      clarifications: result.clarifications,
      screened_at: new Date().toISOString(),
      stage: 'review'
    })
    .eq('id', applicationId);
  if (error) throw new Error('Ghi điểm hồ sơ lỗi: ' + error.message);
}
