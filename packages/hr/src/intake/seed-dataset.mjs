// Nạp CV thật từ một bộ dữ liệu công khai (CSV, cột Category và Resume) để kiểm chứng AI.
// Chỉ dùng bộ dữ liệu có giấy phép cho phép (ví dụ Apache 2.0). Đây là dữ liệu test,
// không có consent cá nhân nên để trống consent_at. Không dùng để cào dữ liệu người khác.
//
// Cách chạy:
//   node packages/hr/src/intake/seed-dataset.mjs --csv duong/dan/resumes.csv --per 3 \
//        --categories "Electrical Engineering,Mechanical Engineer,Sales,Automation Testing,Network Security Engineer"
//   Thêm --dry-run để chỉ đếm, không ghi.

import { readFile } from 'node:fs/promises';
import { getServiceClient } from '../../../core/src/index.js';
import { normalizeCv } from './normalize.js';
import { upsertCandidate, ensureApplication } from './candidates.js';

function parseArgs(argv) {
  const args = { csv: null, per: 3, categories: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--csv') args.csv = argv[++i];
    else if (argv[i] === '--per') args.per = Number(argv[++i]);
    else if (argv[i] === '--categories') args.categories = argv[++i].split(',').map((s) => s.trim());
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

// Bộ phân tích CSV đơn giản, xử lý ô có dấu phẩy, xuống dòng và dấu nháy kép thoát.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* bỏ */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.csv) { console.error('Cần --csv <đường dẫn CSV>.'); process.exit(1); }

  const raw = await readFile(args.csv, 'utf8');
  const rows = parseCsv(raw);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iCat = header.indexOf('category');
  const iRes = header.indexOf('resume');
  if (iCat < 0 || iRes < 0) { console.error('CSV cần cột Category và Resume.'); process.exit(1); }

  // Gom theo danh mục, lọc theo yêu cầu.
  const byCat = new Map();
  for (const r of rows.slice(1)) {
    const cat = (r[iCat] || '').trim();
    const res = (r[iRes] || '').trim();
    if (!cat || res.length < 50) continue;
    if (args.categories && !args.categories.includes(cat)) continue;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(res);
  }

  const client = args.dryRun ? null : getServiceClient();
  const results = [];
  for (const [cat, list] of byCat) {
    for (const res of list.slice(0, args.per)) {
      const cv = normalizeCv(res, {
        source: 'dataset-public',
        sourceMessage: { subject: 'CV công khai: ' + cat },
        attachments: [],
        parsedAt: new Date().toISOString()
      });
      // Bộ dữ liệu ẩn danh, không có tên thật. Đặt nhãn rõ đây là dữ liệu công khai.
      cv.full_name = 'Ứng viên công khai (' + cat + ')';

      if (args.dryRun) { results.push({ danh_muc: cat, so_ky_tu: res.length }); continue; }
      const { candidateId } = await upsertCandidate(client, cv);
      await client.from('hr_candidates').update({ consent_at: null }).eq('id', candidateId);
      await ensureApplication(client, candidateId);
      results.push({ danh_muc: cat, candidate_id: candidateId, so_ky_tu: res.length });
    }
  }

  console.log(JSON.stringify({ dryRun: args.dryRun, so_cv: results.length, theo_danh_muc: [...byCat.keys()], ket_qua: results }, null, 2));
}

main().catch((err) => { console.error('Lỗi nạp dataset:', err.message); process.exit(1); });
