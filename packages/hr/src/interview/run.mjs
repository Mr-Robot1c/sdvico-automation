// Sinh câu hỏi phỏng vấn và thư mời cho hồ sơ người đã chọn vào phỏng vấn.
// Chạy theo lịch sau khi người duyệt chuyển hồ sơ sang bước 'interview'.
//
// Luồng: lấy hồ sơ ở bước 'interview' chưa có thư mời -> ẩn danh CV ->
//        sinh 8 câu kỹ thuật, 4 câu hành vi, 1 bài về nhà kèm barem bằng Groq ->
//        ghép thư mời kèm ba khung giờ -> đẩy vào approval_queue trạng thái pending.
//
// Cổng an toàn:
//   Điều cấm 1: máy soạn, người bấm gửi. Thư nằm trong hàng đợi duyệt, không tự gửi.
//   Điều cấm 2: chỉ soạn cho hồ sơ người đã chọn vào phỏng vấn. Máy không tự chọn.
//   Điều cấm 6: chỉ văn bản CV đã ẩn danh đi tới mô hình. Tên ghép cục bộ vào thư.
//
// Cách chạy:
//   Thật:      node packages/hr/src/interview/run.mjs
//   Diễn tập:  node packages/hr/src/interview/run.mjs --dry-run   (không gọi mô hình, không ghi)

import { getServiceClient, logRun, pushApproval } from '../../../core/src/index.js';
import { anonymizeCv } from '../screen/anonymize.js';
import { fetchForInterview } from './applications.js';
import { generateInterview } from './generate.js';
import { allocateSlots, loadTakenSlots, loadWindows, loadCapacity } from './schedule.js';
import { composeLetter, composeTakeHome, numberList } from './compose.js';
import { guessGender, xungHo } from './gender.js';

function parseArgs(argv) {
  const args = { dryRun: false, max: 20 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--max') args.max = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const client = getServiceClient();

  const apps = await fetchForInterview(client, { max: args.max });
  // Tự sắp lịch: gom các khung giờ đã đề xuất trước đó để không cấp trùng,
  // dùng khung giờ mong muốn do người vận hành đặt trên web.
  const taken = await loadTakenSlots(client);
  const windows = await loadWindows(client);
  const capacity = await loadCapacity(client);
  const results = [];

  for (const app of apps) {
    const cand = app.hr_candidates;
    const cv = cand?.cv_json;
    if (!cv || !cv.raw_text) {
      results.push({ application_id: app.id, skipped: 'thiếu văn bản CV' });
      continue;
    }

    const position = app.hr_jobs?.title || 'vị trí đã ứng tuyển';
    const name = cand.full_name || 'anh/chị';
    const { text } = anonymizeCv(cv);
    // Cấp ba khung giờ còn trống, không trùng ứng viên khác (tự sắp lịch).
    const slots = allocateSlots(taken, 3, { times: windows, capacity });

    if (args.dryRun) {
      results.push({ application_id: app.id, ung_vien: name, vi_tri: position, khung_gio: slots, dry: true });
      continue;
    }

    try {
      const pack = await generateInterview(text, { position });
      // Xưng hô đúng anh/chị suy từ tên và CV gốc (cục bộ, không đưa lên mô hình).
      const xh = xungHo(guessGender(name, cv.raw_text));
      const letter = composeLetter({ name, position, slots, xh });

      const payload = {
        ung_vien: name,
        vi_tri: position,
        email: cand.email || '',
        khung_gio: slots,
        thu_moi: letter,
        cau_hoi_ky_thuat: numberList(pack.cau_hoi_ky_thuat),
        cau_hoi_hanh_vi: numberList(pack.cau_hoi_hanh_vi),
        bai_ve_nha: composeTakeHome(pack.bai_ve_nha),
        luu_y: 'Máy soạn. Người xem, chỉnh nếu cần, rồi tự gửi cho ứng viên (điều cấm 1).'
      };

      const approvalId = await pushApproval(client, {
        kind: 'hr_interview',
        title: `Thư mời phỏng vấn: ${name}`,
        refTable: 'hr_applications',
        refId: app.id,
        payload
      });

      results.push({ application_id: app.id, approval_id: approvalId, ung_vien: name, model: pack.model });
    } catch (err) {
      results.push({ application_id: app.id, error: err.message });
    }
  }

  const okCount = results.filter((r) => r.approval_id).length;
  const skipCount = results.filter((r) => r.skipped).length;
  const errCount = results.filter((r) => r.error).length;

  if (!args.dryRun) {
    await logRun(client, {
      task: 'hr-interview',
      actor: 'github-actions',
      status: errCount ? 'error' : 'ok',
      detail: { ho_so_xet: results.length, da_soan: okCount, bo_qua: skipCount, loi: errCount, ket_qua: results }
    });
  }

  console.log(
    JSON.stringify(
      { dryRun: args.dryRun, ho_so_xet: results.length, da_soan: okCount, bo_qua: skipCount, loi: errCount, ket_qua: results },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Lỗi sinh câu hỏi phỏng vấn:', err.message);
  process.exit(1);
});
