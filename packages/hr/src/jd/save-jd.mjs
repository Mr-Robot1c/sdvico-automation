// Lưu bốn phiên bản JD vào hr_jobs.jd_versions. Dùng ở bước cuối của lệnh /hr-jd.
//
// Cách chạy:
//   Tạo vị trí mới (trạng thái draft) từ JSON đọc qua stdin:
//     node packages/hr/src/jd/save-jd.mjs < jd.json
//   Cập nhật jd_versions cho vị trí đã có:
//     node packages/hr/src/jd/save-jd.mjs --id <hr_jobs.id> < jd.json
//
// Định dạng JSON đầu vào:
//   {
//     "title": "Kỹ thuật viên lắp đặt thiết bị hàng hải",   // bắt buộc khi tạo mới
//     "department": "Kỹ thuật",                              // tùy chọn
//     "location": "Vũng Tàu",                                // tùy chọn
//     "short_desc": "...",                                   // tùy chọn
//     "requirements": "...",                                 // tùy chọn
//     "jd_versions": { "website": "...", "job_board": "...", "facebook": "...", "zalo_sms": "..." }
//   }
//
// Điều cấm liên quan: nội dung phải qua giọng văn (mục 4) và ranh giới sản phẩm (điều cấm 4, 5)
// TRƯỚC khi gọi script này. Script chỉ lưu, không kiểm nội dung.

import { getServiceClient, logRun } from '../../../core/src/index.js';
import { validateJdVersions } from './channels.js';

function parseArgs(argv) {
  const args = { id: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--id') {
      args.id = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('Không có dữ liệu JSON ở stdin. Truyền JSON qua đường ống, ví dụ: node save-jd.mjs < jd.json');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('JSON đầu vào không hợp lệ: ' + err.message);
  }
}

async function main() {
  const { id } = parseArgs(process.argv);
  const input = await readStdin();

  const versions = input.jd_versions || {};
  const check = validateJdVersions(versions);
  if (!check.ok) {
    const phan = [];
    if (check.thieu.length) phan.push('thiếu kênh: ' + check.thieu.join(', '));
    if (check.rong.length) phan.push('kênh rỗng: ' + check.rong.join(', '));
    throw new Error('jd_versions chưa đủ bốn kênh. ' + phan.join('; '));
  }

  const client = getServiceClient();

  let jobId = id;
  if (id) {
    // Cập nhật vị trí đã có. Chỉ đụng các cột được truyền, luôn cập nhật jd_versions.
    const patch = { jd_versions: versions };
    for (const col of ['title', 'department', 'location', 'short_desc', 'requirements']) {
      if (input[col] != null) patch[col] = input[col];
    }
    const { data, error } = await client
      .from('hr_jobs')
      .update(patch)
      .eq('id', id)
      .select('id')
      .single();
    if (error) throw new Error('Cập nhật hr_jobs lỗi: ' + error.message);
    jobId = data.id;
  } else {
    // Tạo vị trí mới ở trạng thái draft.
    if (!input.title || !String(input.title).trim()) {
      throw new Error('Tạo vị trí mới cần "title". Hoặc truyền --id để cập nhật vị trí đã có.');
    }
    const { data, error } = await client
      .from('hr_jobs')
      .insert({
        title: input.title,
        department: input.department ?? null,
        location: input.location ?? null,
        short_desc: input.short_desc ?? null,
        requirements: input.requirements ?? null,
        jd_versions: versions,
        status: 'draft'
      })
      .select('id')
      .single();
    if (error) throw new Error('Tạo hr_jobs lỗi: ' + error.message);
    jobId = data.id;
  }

  await logRun(client, {
    task: 'hr-jd',
    actor: 'command:hr-jd',
    status: 'ok',
    detail: { job_id: jobId, mode: id ? 'update' : 'create', kenh: Object.keys(versions) }
  });

  console.log(JSON.stringify({ ok: true, job_id: jobId, mode: id ? 'update' : 'create' }, null, 2));
}

main().catch((err) => {
  console.error('Lỗi lưu JD:', err.message);
  process.exit(1);
});
