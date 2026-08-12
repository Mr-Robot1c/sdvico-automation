// seo-audit.mjs — rà soát SEO tự động bằng Lighthouse chạy CỤC BỘ (Playwright/Chrome thật).
//
// Chạy: npm run seo:audit                                  (mặc định sdvico.vn, điện thoại)
//       node packages/marketing/src/seo-audit.mjs https://sdvico.vn desktop
//
// Dùng trình duyệt nhân Chromium có sẵn trên máy (Chrome, nếu không có thì Edge, rồi Brave).
// Kết quả xếp lỗi THEO MỨC TÁC ĐỘNG (trọng số nhóm nhân phần chưa đạt), ghi run_log và xuất
// báo cáo seo-report.md để giao cho người sửa.

import fs from 'node:fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { getServiceClient, logRun } from '@sdvico/core';

const url = process.argv[2] || 'https://sdvico.vn';
const strategy = process.argv[3] || 'mobile';

const CAT_LABEL = {
  performance: 'Tốc độ',
  accessibility: 'Khả năng truy cập',
  seo: 'Chuẩn SEO',
  'best-practices': 'Thực hành tốt'
};

// Tìm trình duyệt Chromium trên máy. Trả về undefined để chrome-launcher tự dò nếu không thấy.
function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  ];
  return candidates.find((p) => fs.existsSync(p));
}

console.log(`Rà SEO: ${url} (${strategy}). Đang mở trình duyệt và chạy Lighthouse, chờ chút...`);

const chrome = await chromeLauncher.launch({
  chromePath: findBrowser(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
});

let lr;
try {
  const runnerResult = await lighthouse(url, {
    port: chrome.port,
    onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'],
    formFactor: strategy === 'desktop' ? 'desktop' : 'mobile',
    screenEmulation: strategy === 'desktop' ? { disabled: true } : undefined
  });
  lr = runnerResult.lhr;
} finally {
  // Windows đôi khi EPERM khi xóa thư mục tạm của trình duyệt. Bỏ qua để không chặn báo cáo.
  try { await chrome.kill(); } catch { /* thư mục tạm sẽ được dọn sau */ }
}

// Điểm từng nhóm, quy về thang 100.
const scores = {};
for (const [k, cat] of Object.entries(lr.categories)) scores[k] = Math.round((cat.score ?? 0) * 100);

// Xếp lỗi theo mức tác động.
const issues = [];
for (const [k, cat] of Object.entries(lr.categories)) {
  for (const ref of cat.auditRefs || []) {
    if (!ref.weight) continue;
    const a = lr.audits[ref.id];
    if (!a || a.score === null || a.score >= 1) continue;
    issues.push({
      category: k,
      title: a.title,
      description: (a.description || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim(),
      display: a.displayValue || '',
      impact: ref.weight * (1 - a.score)
    });
  }
}
issues.sort((x, y) => y.impact - x.impact);

console.log('\n=== Điểm từng nhóm (0 tới 100) ===');
for (const [k, s] of Object.entries(scores)) console.log(`  ${CAT_LABEL[k] || k}: ${s}`);
console.log('\n=== Lỗi xếp theo mức tác động (12 lỗi đầu) ===');
for (const it of issues.slice(0, 12)) {
  console.log(`- [${CAT_LABEL[it.category] || it.category}] ${it.title}${it.display ? ' (' + it.display + ')' : ''}`);
}

// Xuất báo cáo markdown đầy đủ.
const out = [
  `# Báo cáo rà SEO: ${url}`,
  '',
  `Chiến lược: ${strategy}. Nguồn: Lighthouse chạy cục bộ.`,
  '',
  '## Điểm từng nhóm',
  ''
];
for (const [k, s] of Object.entries(scores)) out.push(`- ${CAT_LABEL[k] || k}: **${s}/100**`);
out.push('', '## Lỗi xếp theo mức tác động', '');
for (const it of issues.slice(0, 20)) {
  out.push(`### [${CAT_LABEL[it.category] || it.category}] ${it.title}${it.display ? ' — ' + it.display : ''}`);
  if (it.description) out.push(it.description);
  out.push('');
}
fs.writeFileSync('seo-report.md', out.join('\n'));

// Ghi run_log.
const client = getServiceClient();
await logRun(client, {
  task: 'mkt.seo_audit',
  status: 'ok',
  detail: { url, strategy, scores, top_issues: issues.slice(0, 10).map((i) => i.title) }
});

console.log('\nXong. Báo cáo đầy đủ ở seo-report.md, điểm đã ghi vào run_log.');
