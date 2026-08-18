// Entry point tìm CV chủ động. Đọc cổng cấu hình hr_cv_sources trước — TẮT thì thoát ngay,
// không chạm trình duyệt, không gọi trang ngoài. Xem ghi chú đầy đủ ở topcv-flow.js và
// migration 20260818030000_hr_cv_sources.sql.
//
// Cách chạy:  node packages/hr/src/sourcing-cv/run.mjs --platform <platform_id>

import { getServiceClient, logRun, runBrowserFlow, pushApproval } from '../../../core/src/index.js';
import { makeTopcvFlow } from './topcv-flow.js';
import { normalizeCv } from '../intake/normalize.js';
import { upsertCandidate, ensureApplication } from '../intake/candidates.js';

const client = getServiceClient();
const platformArg = (() => {
  const i = process.argv.indexOf('--platform');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const LIVE = process.argv.includes('--live');

if (!platformArg) {
  console.error('Thiếu --platform <platform_id>. Xem hr_platforms (loai=\'cv_source\') để lấy id.');
  process.exit(1);
}

const { data: source, error: e1 } = await client
  .from('hr_cv_sources')
  .select('id, platform_id, gioi_han_ngay, xac_nhan_phap_ly_boi, xac_nhan_luc, bat')
  .eq('platform_id', platformArg)
  .maybeSingle();
if (e1) throw new Error('Đọc hr_cv_sources lỗi: ' + e1.message);

if (!source) {
  console.log('Chưa có cấu hình nguồn CV cho platform này. Thêm bản ghi trong hr_cv_sources trước (bat mặc định false).');
  process.exit(0);
}

// Cổng bắt buộc: tắt mặc định, và bắt buộc đã có người xác nhận pháp lý trước khi bật thật.
// Không phải giới hạn kỹ thuật — đây là quyết định nghiệp vụ, không được ghi đè bằng code.
if (!source.bat) {
  console.log('Nguồn CV này đang TẮT (bat=false). Không chạy gì. Bật qua trang Cài đặt > Nguồn CV sau khi Phòng Nhân sự xác nhận pháp lý.');
  process.exit(0);
}
if (!source.xac_nhan_phap_ly_boi || !source.xac_nhan_luc) {
  console.log('Nguồn CV đang bật nhưng CHƯA có xác nhận pháp lý (xac_nhan_phap_ly_boi/xac_nhan_luc rỗng). Dừng, không chạy.');
  process.exit(0);
}

const { data: platform, error: e2 } = await client.from('hr_platforms').select('id, ten, loai').eq('id', platformArg).single();
if (e2) throw new Error('Đọc hr_platforms lỗi: ' + e2.message);

// Cấu hình luồng: [CẦN XÁC NHẬN] loginUrl/searchUrl/resultSelector/detailSelector do người vận
// hành điền theo UI thật của trang, không đoán trước trong code. Lưu tạm trong ghi_chu (jsonb-ish
// text) của hr_platforms hoặc biến môi trường riêng — chưa chốt định dạng, để trống thì dừng.
const cfgRaw = process.env.HR_CV_SOURCE_CONFIG;
if (!cfgRaw) {
  console.log('Thiếu HR_CV_SOURCE_CONFIG (JSON: loginUrl, searchUrl, resultSelector, detailSelector, maxPerRun). Dừng.');
  process.exit(0);
}
const cfg = JSON.parse(cfgRaw);

const profileDir = process.env.TOPCV_ACCOUNT_PROFILE_DIR || `.browser-profiles/${platform.ten}`;

try {
  const result = await runBrowserFlow(client, {
    account: platform.ten,
    profileDir,
    task: `hr.sourcing_cv.${platform.ten}`,
    dryRun: !LIVE,
    flow: makeTopcvFlow(cfg),
  });

  console.log(`Tìm thấy ${result.found} CV. ${result.dryRun ? '(chạy thử, chưa trích nội dung)' : `Trích được ${result.items.length} CV.`}`);

  const saved = [];
  for (const item of result.items || []) {
    const cv = normalizeCv(item.rawText, { source: 'topcv' });
    const { candidateId, isNew } = await upsertCandidate(client, cv);

    // upsertCandidate mặc định ghi consent_at=now() vì hàm này viết cho luồng CV ứng viên chủ
    // động gửi email. Ở đây KHÁC: ứng viên chưa chủ động nộp cho SDVICO, nên không được để lại
    // dấu vết như thể họ đã đồng ý — xóa consent_at cho tới khi Phòng Nhân sự chốt cách xử lý
    // đúng theo Nghị định 13/2023 (có thể cần liên hệ xin phép trước khi liên hệ tuyển dụng).
    if (isNew) {
      await client.from('hr_candidates').update({ consent_at: null }).eq('id', candidateId);
    }

    await ensureApplication(client, candidateId, { jobId: null });
    saved.push({ candidateId, isNew });
  }

  if (saved.length) {
    await pushApproval(client, {
      kind: 'hr_email',
      title: `Tìm CV chủ động: ${saved.length} hồ sơ mới từ ${platform.ten}`,
      payload: { platform: platform.ten, count: saved.length, note: 'Chưa có consent_at — cần Phòng Nhân sự xác nhận cách liên hệ trước khi dùng.' },
    });
  }

  await logRun(client, { task: 'hr.sourcing_cv', status: 'ok', detail: { platform: platform.ten, found: result.found, saved: saved.length, live: LIVE } });
} catch (err) {
  await logRun(client, { task: 'hr.sourcing_cv', status: 'error', detail: { platform: platform.ten, error: String(err.message || err) } });
  console.error('Dừng do lỗi hoặc rào chắn:', err.message || err);
  process.exit(1);
}
