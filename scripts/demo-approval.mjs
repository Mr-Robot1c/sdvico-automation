// Tác vụ demo cho mốc cuối Ngày 1, có bù hàng đợi.
// Giữ hàng đợi ở mức TARGET mục chờ duyệt: đếm số đang pending,
// nếu đã đủ TARGET thì dừng, chưa đủ thì thêm cho đủ.
// Chạy tay: node scripts/demo-approval.mjs
// Chạy theo lịch: GitHub Action .github/workflows/daily-demo.yml
import { getServiceClient, pushApproval, logRun } from '../packages/core/src/index.js';

const TARGET = 10;

async function main() {
  const client = getServiceClient();

  // Đếm số mục đang chờ duyệt. head true, chỉ lấy số đếm, không kéo dữ liệu.
  const { count, error } = await client
    .from('approval_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw new Error('Đếm hàng đợi lỗi: ' + error.message);

  const pending = count || 0;

  if (pending >= TARGET) {
    console.log(`Hàng đợi đã đủ ${pending}/${TARGET} mục chờ. Dừng, không thêm.`);
    await logRun(client, {
      task: 'demo-approval',
      actor: 'github-actions',
      status: 'ok',
      detail: { pending, target: TARGET, added: 0 }
    });
    return;
  }

  const toAdd = TARGET - pending;
  const ids = [];
  for (let i = 0; i < toAdd; i++) {
    const id = await pushApproval(client, {
      kind: 'demo',
      title: 'Mục demo chờ duyệt, sinh tự động theo lịch',
      payload: {
        ghi_chu: 'Mục thử để kiểm tra luồng duyệt cuối Ngày 1. Người duyệt bấm Duyệt hoặc Từ chối.',
        sinh_luc: new Date().toISOString()
      }
    });
    ids.push(id);
  }

  await logRun(client, {
    task: 'demo-approval',
    actor: 'github-actions',
    status: 'ok',
    detail: { pending_truoc: pending, target: TARGET, added: toAdd, ids }
  });

  console.log(`Đã thêm ${toAdd} mục, hàng đợi giờ đủ ${TARGET} mục chờ.`);
}

main().catch((err) => {
  console.error('Lỗi tác vụ demo:', err.message);
  process.exit(1);
});
