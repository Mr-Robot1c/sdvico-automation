// Phân tích JD thành tiêu chí tuyển dụng. Bộ não cho đăng tin và tìm kiếm.
//
// Cách chạy:
//   Từ tệp:   node packages/hr/src/sourcing/run.mjs --file duong/dan/jd.txt
//   Từ chữ:   node packages/hr/src/sourcing/run.mjs --text "Mô tả công việc..."
//   Từ DB:    node packages/hr/src/sourcing/run.mjs --job <id vị trí trong hr_jobs>

import { readFile } from 'node:fs/promises';
import { getServiceClient } from '../../../core/src/index.js';
import { analyzeJd, buildTargeting } from './jd-analyzer.js';

function parseArgs(argv) {
  const args = { file: null, text: null, job: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--text') args.text = argv[++i];
    else if (argv[i] === '--job') args.job = argv[++i];
  }
  return args;
}

async function jdFromJob(jobId) {
  const client = getServiceClient();
  const { data, error } = await client
    .from('hr_jobs')
    .select('title, short_desc, requirements, location, jd_versions')
    .eq('id', jobId)
    .single();
  if (error) throw new Error('Đọc vị trí lỗi: ' + error.message);
  const parts = [
    data.title,
    data.location ? 'Nơi làm việc: ' + data.location : '',
    data.short_desc || '',
    data.requirements || '',
    data.jd_versions?.website || ''
  ];
  return parts.filter(Boolean).join('\n');
}

async function main() {
  const args = parseArgs(process.argv);

  let jdText = args.text;
  if (args.file) jdText = await readFile(args.file, 'utf8');
  if (args.job) jdText = await jdFromJob(args.job);

  if (!jdText) {
    console.error('Cần một trong: --file, --text, hoặc --job.');
    process.exit(1);
  }

  const analysis = await analyzeJd(jdText);
  const targeting = buildTargeting(analysis);
  console.log(JSON.stringify(targeting, null, 2));
}

main().catch((err) => {
  console.error('Lỗi phân tích JD:', err.message);
  process.exit(1);
});
