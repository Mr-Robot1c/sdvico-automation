#!/usr/bin/env node
// Máy canh cổng duyệt (audit bảo mật 29/8, mục 14).
//
// Điều cấm 1 (máy soạn, người bấm) được thực thi ở NHIỀU chỗ ghi approval_queue:
// packages/core/src/approval.js cho script, còn apps/approval-ui + packages/marketing insert
// thẳng rải rác. Chưa gộp hết về một module được (approval-ui chạy trên Vercel, import
// workspace package cần kiểm chứng deploy riêng) thì máy phải canh chỗ trôi thay người:
//   1. INSERT vào approval_queue: status phải là 'pending' theo nghĩa đen, hoặc bỏ trống
//      (schema default 'pending'). Cấm insert thẳng approved/rejected — không nhánh nào được
//      tự duyệt cho chính nó.
//   2. UPDATE có đổi status: phải kèm .eq('status', 'pending') — chỉ quyết được mục đang chờ,
//      không ghi đè quyết định người đã bấm.
//
// Chạy tay: node scripts/check-approval-gate.mjs
// Tự chạy: .githooks/pre-commit gọi khi commit có file code.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SELF = 'scripts/check-approval-gate.mjs';

let files;
try {
  files = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.js', '*.mjs'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((f) => f !== SELF);
} catch (e) {
  // Không có git (ví dụ build trên Vercel) thì bỏ qua, không chặn build.
  console.error('check-approval-gate: khong chay duoc git ls-files, bo qua:', e.message);
  process.exit(0);
}

const FROM_RE = /\.from\(\s*['"]approval_queue['"]\s*\)/g;
const violations = [];

for (const f of files) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  if (!src.includes('approval_queue')) continue;

  FROM_RE.lastIndex = 0;
  let m;
  while ((m = FROM_RE.exec(src))) {
    const start = m.index + m[0].length;
    // Cửa sổ = phần code ngay sau .from('approval_queue'), cắt ở lệnh .from( kế tiếp để
    // không dính status của bảng khác (mkt_posts 'failed', mkt_leads 'new'...).
    let win = src.slice(start, start + 700);
    const nextFrom = win.search(/\.from\(/);
    if (nextFrom > -1) win = win.slice(0, nextFrom);
    const line = src.slice(0, m.index).split('\n').length;

    if (/\.insert\s*\(/.test(win)) {
      const literal = win.match(/status\s*:\s*(['"])([^'"]+)\1/);
      const anyStatus = /status\s*:/.test(win);
      if (literal && literal[2] !== 'pending') {
        violations.push(`${f}:${line} — insert approval_queue voi status '${literal[2]}' (phai 'pending', dieu cam 1)`);
      } else if (anyStatus && !literal) {
        violations.push(`${f}:${line} — insert approval_queue voi status la BIEN/bieu thuc — phai ghi status: 'pending' theo nghia den (dieu cam 1)`);
      }
    }

    if (/\.update\s*\(/.test(win) && /status\s*:/.test(win)) {
      if (!/\.eq\(\s*['"]status['"]\s*,\s*['"]pending['"]\s*\)/.test(win)) {
        violations.push(`${f}:${line} — update doi status approval_queue ma khong kem .eq('status', 'pending') — ghi de duoc quyet dinh cu`);
      }
    }
  }
}

if (violations.length) {
  console.error('BLOCK: cong duyet (dieu cam 1) co cho ghi approval_queue sai luat:');
  for (const v of violations) console.error('  - ' + v);
  console.error('  -> Sua ve status: \'pending\' / them .eq(\'status\', \'pending\') roi commit lai.');
  process.exit(1);
}
console.log(`check-approval-gate: OK — moi cho ghi approval_queue deu dung luat (quet ${files.length} file).`);
