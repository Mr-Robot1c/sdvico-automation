// Đường nạp CV từ hộp thư. Chạy 30 phút một lần qua GitHub Actions.
// Luồng: đọc thư gần đây -> trích PDF/DOCX/OCR ảnh -> chuẩn hóa JSON ->
//        khử trùng theo email và số điện thoại -> lưu tệp lên Storage ->
//        ghi hr_candidates và hr_applications -> đánh dấu đã xử lý -> ghi run_log.
//
// Chống nạp trùng bằng bộ đánh dấu đã xử lý trong cơ sở dữ liệu (seen.js),
// không dựa cờ "đã đọc" của hộp thư, nên người mở thư không làm pipeline bỏ sót.
//
// Điều cấm 1 và 2: chỉ nạp và xếp vào luồng, không tự trả lời, không tự loại ai.
// Điều cấm 6: tệp và dữ liệu nằm trong Supabase công ty.
//
// Cách chạy:
//   Thật:     node packages/hr/src/intake/run.mjs
//   Diễn tập một tệp cục bộ (không cần hộp thư, không ghi gì):
//             node packages/hr/src/intake/run.mjs --dry-run --file duong/dan/cv.pdf
//   Diễn tập hộp thư (đọc thư gần đây, không ghi, không đánh dấu):
//             node packages/hr/src/intake/run.mjs --dry-run

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { getServiceClient, logRun } from '../../../core/src/index.js';
import { extractText, detectKind } from './extract.js';
import { normalizeCv } from './normalize.js';
import { ensureBucket, uploadCv } from './storage.js';
import { upsertCandidate, ensureApplication } from './candidates.js';
import { getMailConfig, withMailbox, fetchRecentCvMessages } from './mailbox.js';
import { loadProcessed, saveProcessed } from './seen.js';

function parseArgs(argv) {
  const args = { dryRun: false, file: null, max: 300, sinceDays: 3 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--max') args.max = Number(argv[++i]);
    else if (argv[i] === '--since-days') args.sinceDays = Number(argv[++i]);
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

// Trích văn bản từ mọi đính kèm của một thư, gộp lại. Trả { text, parts }.
async function extractAll(attachments) {
  const parts = [];
  const texts = [];
  for (const att of attachments) {
    const res = await extractText(att);
    parts.push({
      filename: att.filename,
      kind: res.kind,
      chars: (res.text || '').length,
      needsOcr: res.needsOcr || false,
      error: res.error || null
    });
    if (res.text) texts.push(res.text);
  }
  return { text: texts.join('\n\n'), parts };
}

// Diễn tập một tệp cục bộ: chỉ trích và chuẩn hóa, in JSON, không đụng IMAP hay cơ sở dữ liệu.
async function runDryFile(file) {
  const buffer = await readFile(file);
  const filename = basename(file);
  const att = { filename, mime: mimeFromName(filename), buffer, kind: detectKind(filename) };
  const { text, parts } = await extractAll([att]);
  const cv = normalizeCv(text, {
    source: 'dry-file',
    sourceMessage: { file },
    attachments: parts,
    parsedAt: new Date().toISOString()
  });
  console.log(JSON.stringify({ dryRun: true, file, extract: parts, candidate: cv }, null, 2));
}

// Xử lý một thư đã lấy từ hộp thư. Trả về tóm tắt để ghi log.
async function processMessage(client, msg, { dryRun }) {
  const year = String((msg.date ? new Date(msg.date) : new Date()).getFullYear());
  const { text, parts } = await extractAll(msg.attachments);

  const cv = normalizeCv(text, {
    source: 'email',
    sourceMessage: { from: msg.from, subject: msg.subject, date: msg.date, uid: msg.uid, messageId: msg.messageId },
    attachments: parts,
    parsedAt: new Date().toISOString()
  });

  if (dryRun) {
    return {
      uid: msg.uid,
      messageId: msg.messageId,
      from: msg.from,
      subject: msg.subject,
      dedup_key: cv.dedup_key,
      email: cv.email,
      phone: cv.phone,
      dinh_kem: parts,
      dry: true
    };
  }

  // Tải các tệp đính kèm lên Storage.
  const storagePaths = [];
  for (const att of msg.attachments) {
    const path = await uploadCv(client.__db, {
      filename: att.filename,
      mime: att.mime,
      buffer: att.buffer,
      dedupKey: cv.dedup_key,
      year
    });
    storagePaths.push(path);
  }
  cv.attachments = cv.attachments.map((p, i) => ({ ...p, storage_path: storagePaths[i] || null }));

  const { candidateId, isNew } = await upsertCandidate(client.__db, cv, {
    cvStoragePath: storagePaths[0] || null
  });
  const app = await ensureApplication(client.__db, candidateId);

  return {
    uid: msg.uid,
    messageId: msg.messageId,
    from: msg.from,
    subject: msg.subject,
    candidate_id: candidateId,
    ung_vien_moi: isNew,
    ho_so_moi: app.isNew,
    dedup_key: cv.dedup_key,
    storage: storagePaths
  };
}

async function main() {
  const args = parseArgs(process.argv);

  // Diễn tập một tệp cục bộ, không cần gì khác.
  if (args.dryRun && args.file) {
    await runDryFile(args.file);
    return;
  }

  const db = getServiceClient();
  const config = getMailConfig();

  if (!args.dryRun) await ensureBucket(db);
  const processed = args.dryRun ? {} : await loadProcessed(db);

  const results = await withMailbox(config, async (imap) => {
    imap.__db = db;
    const messages = await fetchRecentCvMessages(imap, { sinceDays: args.sinceDays, max: args.max });
    const out = [];
    for (const msg of messages) {
      // Bỏ qua thư không có đính kèm CV.
      if (!msg.attachments || msg.attachments.length === 0) continue;

      const mid = msg.messageId || `uid:${config.mailbox}:${msg.uid}`;
      if (!args.dryRun && processed[mid]) {
        out.push({ messageId: mid, from: msg.from, skipped: 'đã xử lý trước đó' });
        continue;
      }

      try {
        const r = await processMessage(imap, msg, { dryRun: args.dryRun });
        out.push(r);
        if (!args.dryRun && r.candidate_id) processed[mid] = new Date().toISOString();
      } catch (err) {
        out.push({ messageId: mid, from: msg.from, error: err.message });
      }
    }
    return out;
  });

  const okCount = results.filter((r) => r.candidate_id).length;
  const skipCount = results.filter((r) => r.skipped).length;
  const errCount = results.filter((r) => r.error).length;

  if (!args.dryRun) {
    await saveProcessed(db, processed);
    await logRun(db, {
      task: 'hr-intake',
      actor: 'github-actions',
      status: errCount ? 'error' : 'ok',
      detail: { thu_co_cv: results.length, ghi_ung_vien: okCount, bo_qua_da_xu_ly: skipCount, loi: errCount, ket_qua: results }
    });
  }

  console.log(
    JSON.stringify(
      { dryRun: args.dryRun, thu_co_cv: results.length, ghi_ung_vien: okCount, bo_qua_da_xu_ly: skipCount, loi: errCount, ket_qua: results },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Lỗi nạp CV:', err.message);
  process.exit(1);
});
