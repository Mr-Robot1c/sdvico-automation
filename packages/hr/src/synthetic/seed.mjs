// Nạp CV giả vào cơ sở dữ liệu để chạy thử pipeline (kế hoạch Phần 5.3).
// Dùng đúng đường ghi thật (upsertCandidate, ensureApplication) nên vừa nạp vừa
// kiểm khử trùng. Nguồn đánh dấu 'verify-synthetic', giao diện hiện nhãn Dữ liệu test.
//
// Cách chạy:  node packages/hr/src/synthetic/seed.mjs

import { getServiceClient } from '../../../core/src/index.js';
import { upsertCandidate, ensureApplication } from '../intake/candidates.js';
import { generateSyntheticCandidates } from './generate.js';

async function main() {
  const client = getServiceClient();
  const cvs = generateSyntheticCandidates();

  let created = 0;
  let deduped = 0;
  const results = [];

  for (const cv of cvs) {
    const { candidateId, isNew } = await upsertCandidate(client, cv);
    const app = await ensureApplication(client, candidateId);
    if (isNew) created += 1; else deduped += 1;
    results.push({ ung_vien: cv.full_name, moi: isNew, ho_so_moi: app.isNew });
  }

  console.log(
    JSON.stringify(
      { tong: cvs.length, ung_vien_moi: created, trung_lap_gop: deduped, ket_qua: results },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Lỗi nạp CV giả:', err.message);
  process.exit(1);
});
