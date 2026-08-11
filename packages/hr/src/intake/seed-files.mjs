// Nạp CV thật hàng loạt từ một thư mục vào pipeline, để kiểm chứng AI trên dữ liệu thật.
// Dùng cho hai nguồn hợp lệ: bộ dữ liệu CV công khai (cấp phép cho ML) và CV tình nguyện có consent.
// KHÔNG dùng để cào dữ liệu người khác trên mạng (ToS nền tảng, Nghị định 13).
//
// Dùng chung đường trích và ghi thật (extract, normalize, upsertCandidate) như đường nạp từ hộp thư.
//
// Cách chạy:
//   Diễn tập, chỉ trích và in, không ghi:
//     node packages/hr/src/intake/seed-files.mjs --dir "duong/dan/thu-muc" --dry-run
//   Nạp thật (đánh dấu nguồn), có consent nếu là CV tình nguyện:
//     node packages/hr/src/intake/seed-files.mjs --dir "duong/dan" --source dataset
//     node packages/hr/src/intake/seed-files.mjs --dir "duong/dan" --source volunteer --consent

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { getServiceClient } from '../../../core/src/index.js';
import { detectKind, extractText } from './extract.js';
import { normalizeCv } from './normalize.js';
import { upsertCandidate, ensureApplication } from './candidates.js';

function parseArgs(argv) {
  const args = { dir: null, source: 'file-test', dryRun: false, consent: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--consent') args.consent = true;
  }
  return args;
}

function mimeFromName(name = '') {
  const kind = detectKind(name);
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (kind === 'image') return 'image/' + (name.split('.').pop() || 'png').toLowerCase();
  return 'application/octet-stream';
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dir) {
    console.error('Cần --dir <thư mục chứa CV>.');
    process.exit(1);
  }

  const names = (await readdir(args.dir)).filter((n) => detectKind(n) !== 'unknown');
  if (!names.length) {
    console.log('Không thấy tệp CV nào (PDF, DOCX, ảnh) trong thư mục.');
    return;
  }

  const client = args.dryRun ? null : getServiceClient();
  const results = [];

  for (const name of names) {
    try {
      const buffer = await readFile(join(args.dir, name));
      const att = { filename: name, mime: mimeFromName(name), buffer, kind: detectKind(name) };
      const res = await extractText(att);
      const cv = normalizeCv(res.text, {
        source: args.source,
        sourceMessage: { subject: 'CV từ tệp: ' + basename(name) },
        attachments: [{ filename: name, kind: res.kind, chars: (res.text || '').length, needsOcr: res.needsOcr || false }],
        parsedAt: new Date().toISOString()
      });

      if (args.dryRun) {
        results.push({ tep: name, so_ky_tu: (res.text || '').length, email: cv.email, phone: cv.phone, ten: cv.full_name, needsOcr: res.needsOcr || false });
        continue;
      }

      // Nạp thật. upsertCandidate ghi consent lúc nhận; với dữ liệu không consent thì gỡ sau.
      const { candidateId, isNew } = await upsertCandidate(client, cv);
      if (!args.consent) {
        // Bộ dữ liệu công khai không có consent cá nhân: để trống consent_at cho đúng thực tế.
        await client.from('hr_candidates').update({ consent_at: null }).eq('id', candidateId);
      }
      const app = await ensureApplication(client, candidateId);
      results.push({ tep: name, ung_vien: cv.full_name, so_ky_tu: (res.text || '').length, moi: isNew, ho_so_moi: app.isNew });
    } catch (err) {
      results.push({ tep: name, loi: err.message });
    }
  }

  console.log(JSON.stringify({ dryRun: args.dryRun, source: args.source, so_tep: results.length, ket_qua: results }, null, 2));
}

main().catch((err) => {
  console.error('Lỗi nạp CV từ tệp:', err.message);
  process.exit(1);
});
