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
    .select('id, cv_json, consent_at')
    .or(ors.join(','))
    .limit(1);
  if (error) throw new Error('Tìm ứng viên trùng lỗi: ' + error.message);
  return data && data.length ? data[0] : null;
}

// Ghi hoặc cập nhật ứng viên từ JSON đã chuẩn hóa.
// cv: { full_name, email, phone, dedup_key, ... } ; cvStoragePath: đường dẫn tệp trên Storage.
// consented: TRUE khi ứng viên chủ động gửi (mail vào hộp thư công ty, upload qua form);
//            FALSE cho nguồn ngoài (TopCV crawl, dataset công khai). Mặc định FALSE để không
//            "auto-consent" nhầm; caller CV chủ động phải khai báo tường minh.
// Trả về { candidateId, isNew }.
export async function upsertCandidate(client, cv, { cvStoragePath = null, consented = false } = {}) {
  const existing = await findExisting(client, { email: cv.email, phone: cv.phone });

  if (existing) {
    // Đã có. Cập nhật cv_json và đường dẫn tệp mới nhất.
    // Nếu candidate CHƯA có consent (từng nạp từ nguồn ngoài / crawl) mà lần này caller khai
    // consented=true (mail chủ động), ghi consent luôn — không mất chance vì đã có id cũ.
    const patch = { cv_json: cv, cv_storage_path: cvStoragePath ?? undefined };
    if (consented && !existing.consent_at) {
      patch.consent_at = new Date().toISOString();
    }
    const { data, error } = await client
      .from('hr_candidates')
      .update(patch)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error('Cập nhật ứng viên lỗi: ' + error.message);
    return { candidateId: data.id, isNew: false };
  }

  // Mới. Chỉ đặt consent_at khi caller khai báo consented=true. Retention_until vẫn ghi
  // để cron retention-purge có mốc xóa (kể cả hồ sơ không consent cũng cần vòng đời).
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
      consent_at: consented ? nowIso : null,
      retention_until: retentionUntil()
    })
    .select('id')
    .single();
  if (error) throw new Error('Ghi ứng viên lỗi: ' + error.message);
  return { candidateId: data.id, isNew: true };
}

// Bảo đảm ứng viên có ít nhất một hồ sơ ứng tuyển đang mở.
// jobId có thể null khi CV gửi chung vào hộp thư, chưa gắn vị trí. Người duyệt gắn sau.
//
// Logic tái ứng tuyển (Fix 2):
//   - Nếu candidate ĐÃ có application ở stage đang mở ('new','review','interview','offer' chưa
//     hired, 'pool') → reuse existing, không tạo trùng.
//   - Nếu chỉ có application ở stage TERMINAL ('rejected', hoặc 'offer' đã hired) → CV mới đến
//     nghĩa là ứng viên gửi lại (VD sau 1 năm CV đã cập nhật). Tạo application MỚI stage='new'
//     để họ vào luồng tuyển dụng bình thường, không bị kẹt ở "rejected" cũ.
//   - hr_applications không có unique(candidate_id) nên nhiều app trên cùng candidate là hợp lệ.
export async function ensureApplication(client, candidateId, { jobId = null } = {}) {
  const { data: existing, error: findErr } = await client
    .from('hr_applications')
    .select('id, stage, hired_at')
    .eq('candidate_id', candidateId);
  if (findErr) throw new Error('Tìm hồ sơ ứng tuyển lỗi: ' + findErr.message);

  const apps = (existing || []);
  const active = apps.find((a) => {
    if (a.stage === 'rejected') return false;
    if (a.stage === 'offer' && a.hired_at) return false; // đã nhận việc = kết thúc
    return true;
  });
  if (active) return { applicationId: active.id, isNew: false };

  const { data, error } = await client
    .from('hr_applications')
    .insert({ candidate_id: candidateId, job_id: jobId, stage: 'new' })
    .select('id')
    .single();
  if (error) throw new Error('Ghi hồ sơ ứng tuyển lỗi: ' + error.message);
  return { applicationId: data.id, isNew: true };
}
