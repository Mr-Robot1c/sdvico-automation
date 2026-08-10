// Ghi ứng viên và hồ sơ ứng tuyển, có khử trùng lặp theo email và số điện thoại.
// Điều cấm 2: chỉ ghi và xếp vào luồng, không tự loại ai.
// Điều cấm 6: dữ liệu nằm trong Supabase công ty, bật RLS.

// Thời hạn lưu mặc định theo Nghị định 13/2023. Đơn vị tháng.
// [CẦN XÁC NHẬN với Phòng Nhân sự: thời hạn lưu hồ sơ ứng viên đúng chính sách công ty]
const RETENTION_MONTHS = Number(process.env.HR_RETENTION_MONTHS || 12);

function retentionUntil(months = RETENTION_MONTHS) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Tìm ứng viên trùng theo email HOẶC số điện thoại. Trả bản ghi đầu tiên khớp, hoặc null.
async function findExisting(client, { email, phone }) {
  const ors = [];
  if (email) ors.push(`email.eq.${email}`);
  if (phone) ors.push(`phone.eq.${phone}`);
  if (ors.length === 0) return null;
  const { data, error } = await client
    .from('hr_candidates')
    .select('id, cv_json')
    .or(ors.join(','))
    .limit(1);
  if (error) throw new Error('Tìm ứng viên trùng lỗi: ' + error.message);
  return data && data.length ? data[0] : null;
}

// Ghi hoặc cập nhật ứng viên từ JSON đã chuẩn hóa.
// cv: { full_name, email, phone, dedup_key, ... } ; cvStoragePath: đường dẫn tệp trên Storage.
// Trả về { candidateId, isNew }.
export async function upsertCandidate(client, cv, { cvStoragePath = null } = {}) {
  const existing = await findExisting(client, { email: cv.email, phone: cv.phone });

  if (existing) {
    // Đã có. Cập nhật cv_json và đường dẫn tệp mới nhất, giữ nguyên consent và thời hạn lưu cũ.
    const { data, error } = await client
      .from('hr_candidates')
      .update({
        cv_json: cv,
        cv_storage_path: cvStoragePath ?? undefined
      })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error('Cập nhật ứng viên lỗi: ' + error.message);
    return { candidateId: data.id, isNew: false };
  }

  // Mới. Ghi consent lúc nhận CV (ứng viên chủ động gửi hồ sơ) và thời hạn lưu.
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from('hr_candidates')
    .insert({
      full_name: cv.full_name,
      email: cv.email,
      phone: cv.phone,
      source: cv.source || 'email',
      cv_storage_path: cvStoragePath,
      cv_json: cv,
      dedup_key: cv.dedup_key,
      consent_at: nowIso,
      retention_until: retentionUntil()
    })
    .select('id')
    .single();
  if (error) throw new Error('Ghi ứng viên lỗi: ' + error.message);
  return { candidateId: data.id, isNew: true };
}

// Bảo đảm ứng viên có ít nhất một hồ sơ ứng tuyển đang mở. Không tạo trùng.
// jobId có thể null khi CV gửi chung vào hộp thư, chưa gắn vị trí. Người duyệt gắn sau.
export async function ensureApplication(client, candidateId, { jobId = null } = {}) {
  const { data: existing, error: findErr } = await client
    .from('hr_applications')
    .select('id')
    .eq('candidate_id', candidateId)
    .limit(1);
  if (findErr) throw new Error('Tìm hồ sơ ứng tuyển lỗi: ' + findErr.message);
  if (existing && existing.length) return { applicationId: existing[0].id, isNew: false };

  const { data, error } = await client
    .from('hr_applications')
    .insert({ candidate_id: candidateId, job_id: jobId, stage: 'new' })
    .select('id')
    .single();
  if (error) throw new Error('Ghi hồ sơ ứng tuyển lỗi: ' + error.message);
  return { applicationId: data.id, isNew: true };
}
