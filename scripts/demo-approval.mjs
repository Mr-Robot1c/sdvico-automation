// Tác vụ demo cho mốc cuối Ngày 1.
// Sinh một mục chờ duyệt trong approval_queue và ghi một dòng run_log.
// Chạy tay: node scripts/demo-approval.mjs
// Chạy theo lịch: GitHub Action .github/workflows/daily-demo.yml
import { getServiceClient, pushApproval, logRun } from '../packages/core/src/index.js';

async function main() {
  const client = getServiceClient();

  const approvalId = await pushApproval(client, {
    kind: 'demo',
    title: 'Mục demo chờ duyệt, sinh tự động theo lịch',
    payload: {
      ghi_chu: 'Mục thử để kiểm tra luồng duyệt cuối Ngày 1. Người duyệt bấm Duyệt hoặc Từ chối.',
      sinh_luc: new Date().toISOString()
    }
  });

  await logRun(client, {
    task: 'demo-approval',
    actor: 'github-actions',
    status: 'ok',
    detail: { approvalId }
  });

  console.log('Đã tạo mục chờ duyệt:', approvalId);
}

main().catch((err) => {
  console.error('Lỗi tác vụ demo:', err.message);
  process.exit(1);
});
