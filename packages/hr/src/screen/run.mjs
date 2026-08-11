// Chấm CV tự động. Chạy theo lịch sau đường nạp CV.
// Luồng: lấy hồ sơ chưa chấm -> ẩn danh CV -> chấm theo thang cố định bằng Gemini ->
//        ghi điểm, tóm tắt, điểm mạnh, điểm cần làm rõ -> chuyển hồ sơ sang bước 'review'.
//
// Cổng an toàn:
//   Mục 1: ẩn danh tên, giới tính, tuổi, quê quán, ảnh, liên hệ trước khi chấm (chống thiên vị).
//   Mục 2: thang điểm cố định trong rubric.js và skill cv-screening, không để mô hình tự nghĩ.
//   Điều cấm 2: máy chấm và xếp, không tự loại ai. Hồ sơ chuyển sang 'review' cho người quyết.
//   Điều cấm 6: dữ liệu ở Supabase công ty. Chỉ văn bản đã ẩn danh đi tới mô hình.
//
// Cách chạy:
//   Thật:      node packages/hr/src/screen/run.mjs
//   Diễn tập:  node packages/hr/src/screen/run.mjs --dry-run   (ẩn danh và in, không gọi mô hình, không ghi)
//   Giới hạn:  node packages/hr/src/screen/run.mjs --max 20

import { getServiceClient, logRun } from '../../../core/src/index.js';
import { anonymizeCv } from './anonymize.js';
import { scoreCv } from './score.js';
import { pickRubric } from './rubric.js';
import { fetchUnscored, saveScore } from './applications.js';

function parseArgs(argv) {
  const args = { dryRun: false, max: 50 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--max') args.max = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const client = getServiceClient();

  const apps = await fetchUnscored(client, { max: args.max });
  const results = [];

  for (const app of apps) {
    const cv = app.hr_candidates?.cv_json;
    if (!cv || !cv.raw_text) {
      results.push({ application_id: app.id, skipped: 'thiếu văn bản CV' });
      continue;
    }

    const rubric = pickRubric(app);
    const { text, removed } = anonymizeCv(cv);

    if (args.dryRun) {
      results.push({
        application_id: app.id,
        rubric: rubric.key,
        da_an_danh: removed,
        so_ky_tu: text.length,
        dry: true
      });
      continue;
    }

    try {
      const scored = await scoreCv(text, rubric);
      await saveScore(client, app.id, scored);
      results.push({
        application_id: app.id,
        rubric: rubric.key,
        diem_tong: scored.overall,
        da_an_danh: removed,
        model: scored.model
      });
    } catch (err) {
      results.push({ application_id: app.id, error: err.message });
    }
  }

  const okCount = results.filter((r) => typeof r.diem_tong === 'number').length;
  const skipCount = results.filter((r) => r.skipped).length;
  const errCount = results.filter((r) => r.error).length;

  if (!args.dryRun) {
    await logRun(client, {
      task: 'hr-screen',
      actor: 'github-actions',
      status: errCount ? 'error' : 'ok',
      detail: { ho_so_xet: results.length, da_cham: okCount, bo_qua: skipCount, loi: errCount, ket_qua: results }
    });
  }

  console.log(
    JSON.stringify(
      { dryRun: args.dryRun, ho_so_xet: results.length, da_cham: okCount, bo_qua: skipCount, loi: errCount, ket_qua: results },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Lỗi chấm CV:', err.message);
  process.exit(1);
});
