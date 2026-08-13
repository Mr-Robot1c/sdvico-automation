// Dọn bài Facebook Page: xóa bài cũ vi phạm quy tắc.
// Quy tắc:
//   1. Mỗi (job_id, kenh): chỉ giữ bài mới nhất. Bài cũ hơn bị xóa.
//   2. Tổng bài đang posted trên trang không quá HR_FB_MAX_POSTS (mặc định 20).
//
// Cách chạy:
//   Chạy thử (chỉ in, không xóa):  node packages/hr/src/post/cleanup-facebook.mjs
//   Xóa thật:                      node packages/hr/src/post/cleanup-facebook.mjs --live

import { getServiceClient, logRun } from '../../../core/src/index.js';

const LIVE = process.argv.includes('--live');
const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const MAX_POSTS = Number(process.env.HR_FB_MAX_POSTS) || 20;

const client = getServiceClient();

// Lấy tất cả bài đã đăng (chưa xóa mềm), cũ nhất trước.
const { data: posted, error } = await client
  .from('hr_job_posts')
  .select('id, job_id, kenh, posted_at, fb_post_id, tieu_de')
  .eq('trang_thai', 'posted')
  .is('deleted_at', null)
  .order('posted_at', { ascending: true });
if (error) throw new Error('Đọc hr_job_posts lỗi: ' + error.message);
const all = posted || [];

console.log(`=== Dọn bài Facebook (${LIVE ? 'XÓA THẬT' : 'CHỈ IN'}) ===`);
console.log(`Đang có ${all.length} bài đã đăng (giới hạn ${MAX_POSTS}).\n`);

const toDelete = new Set();

// Quy tắc 1: trùng (job_id, kenh) — duyệt từ mới nhất, giữ bài đầu tiên gặp.
const seen = new Set();
for (const p of [...all].reverse()) {
  const key = `${p.job_id}:${p.kenh}`;
  if (!seen.has(key)) {
    seen.add(key);
  } else {
    toDelete.add(p.id);
  }
}

// Quy tắc 2: tổng vượt giới hạn — xóa bài cũ nhất.
const kept = all.filter(p => !toDelete.has(p.id));
if (kept.length > MAX_POSTS) {
  const excess = kept.slice(0, kept.length - MAX_POSTS); // all đã sort cũ nhất trước
  for (const p of excess) toDelete.add(p.id);
}

if (toDelete.size === 0) {
  console.log('Không có bài vi phạm. Xong.');
  process.exit(0);
}

const targets = all.filter(p => toDelete.has(p.id));
console.log(`Cần xóa ${targets.length} bài:`);
for (const p of targets) {
  const reason = seen.has(`${p.job_id}:${p.kenh}`) ? 'vượt giới hạn 20' : 'trùng vị trí + kênh';
  console.log(`  [${p.kenh}] ${p.tieu_de} — ${reason}`);
}

if (!LIVE) {
  console.log('\n(Chạy thử — không xóa. Thêm --live để xóa thật.)');
  process.exit(0);
}

if (!PAGE_ID || !TOKEN) {
  console.error('Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN.');
  process.exit(1);
}

let deleted = 0;
for (const p of targets) {
  try {
    if (p.fb_post_id) {
      const res = await fetch(
        `https://graph.facebook.com/${VERSION}/${p.fb_post_id}?access_token=${TOKEN}`,
        { method: 'DELETE' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        console.warn(`  [${p.id}] Facebook: ${json.error?.message || res.status} — vẫn cập nhật DB.`);
      }
    }
    await client.from('hr_job_posts')
      .update({ trang_thai: 'cancelled', ghi_chu: 'Tự dọn: vi phạm giới hạn đồng thời' })
      .eq('id', p.id);
    await logRun(client, {
      task: 'hr.cleanup_facebook', status: 'ok',
      detail: { postId: p.id, fbPostId: p.fb_post_id, tieu_de: p.tieu_de }
    });
    deleted++;
    console.log(`  Đã xóa: ${p.tieu_de}`);
  } catch (err) {
    console.error(`  Lỗi khi xóa ${p.id}: ${err.message || err}`);
    await logRun(client, {
      task: 'hr.cleanup_facebook', status: 'error',
      detail: { postId: p.id, error: String(err.message || err) }
    });
  }
}

console.log(`\nXong. Đã xóa ${deleted} bài.`);
