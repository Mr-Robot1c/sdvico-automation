// CƠ CẤU CHẤP HÀNH: đăng bài tuyển dụng ĐÃ DUYỆT lên Facebook Page qua Graph API.
// Chỉ đăng mục approval_queue kind='hr_job_post' status='approved'. Máy soạn, người bấm Duyệt,
// worker mới đăng (điều cấm 1). Nội dung lấy từ hr_job_posts.noi_dung, là nguồn sự thật.
//
// Cách chạy:
//   Chạy thử, không đăng, chỉ in:  node packages/hr/src/post/publish-facebook.mjs
//   Đăng thật lên Page:            node packages/hr/src/post/publish-facebook.mjs --live
//
// An toàn (bám kế hoạch Phần 6): trần cứng số bài mỗi ngày (HR_FB_MAX_PER_DAY, mặc định 3),
// bộ đếm lưu trong cơ sở dữ liệu; kiểm dừng khẩn trước mỗi lần đăng; gặp lỗi thì DỪNG, không
// thử lại vòng lặp; không đăng lại bài đã 'posted'.

import { getServiceClient, logRun, incrementDailyCounter, isStopped } from '../../../core/src/index.js';

const LIVE = process.argv.includes('--live');
const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const LIMIT = Number(process.env.HR_FB_MAX_PER_DAY) || 3;

const client = getServiceClient();

// 1. Lấy các bài đã duyệt trong hàng đợi.
const { data: approved, error: e1 } = await client
  .from('approval_queue')
  .select('id, title, payload')
  .eq('kind', 'hr_job_post')
  .eq('status', 'approved')
  .order('created_at', { ascending: true });
if (e1) throw new Error('Đọc approval_queue lỗi: ' + e1.message);

const jobs = (approved || [])
  .map((a) => ({ approvalId: a.id, title: a.title, postId: a.payload?.post_id }))
  .filter((j) => j.postId);

if (jobs.length === 0) {
  console.log('Không có bài tuyển dụng nào đã duyệt chờ đăng. Xong.');
  process.exit(0);
}

// 2. Đọc nội dung nháp, bỏ bài đã đăng hoặc thiếu nội dung.
const postIds = jobs.map((j) => j.postId);
const { data: posts, error: e2 } = await client
  .from('hr_job_posts')
  .select('id, tieu_de, noi_dung, trang_thai, url')
  .in('id', postIds);
if (e2) throw new Error('Đọc hr_job_posts lỗi: ' + e2.message);
const byId = new Map((posts || []).map((p) => [p.id, p]));

const queue = jobs.filter((j) => {
  const p = byId.get(j.postId);
  return p && p.trang_thai !== 'posted' && p.noi_dung && p.noi_dung.trim();
});

console.log(`=== Đăng tin tuyển dụng lên Facebook (${LIVE ? 'LIVE' : 'CHẠY THỬ'}) ===`);
console.log(`${jobs.length} bài đã duyệt, ${queue.length} bài sẽ đăng (trần ${LIMIT} bài mỗi ngày).\n`);

if (queue.length === 0) {
  console.log('Các bài đã duyệt đều đăng rồi hoặc thiếu nội dung. Xong.');
  process.exit(0);
}

if (LIVE && (!PAGE_ID || !TOKEN)) {
  console.error('Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN. Xem docs/facebook-test-setup.md.');
  process.exit(1);
}

let published = 0;
for (const j of queue) {
  const p = byId.get(j.postId);
  const message = [p.tieu_de, '', p.noi_dung].join('\n').trim();

  console.log(`- ${p.tieu_de}`);
  if (!LIVE) {
    for (const line of message.split('\n')) console.log('    ' + line);
    console.log('');
    continue;
  }

  // Công tắc dừng khẩn: bật thì dừng ngay, không đăng gì thêm.
  if (await isStopped(client)) {
    console.log('  Công tắc dừng khẩn đang bật. Dừng, không đăng.');
    break;
  }

  // Trần hạn mức ngày, đếm trong cơ sở dữ liệu. Chạm trần thì dừng.
  const quota = await incrementDailyCounter(client, { account: PAGE_ID, kind: 'hr_fb_post', limit: LIMIT });
  if (!quota.allowed) {
    console.log(`  Đã chạm trần ${LIMIT} bài trong ngày. Dừng, để mai chạy tiếp.`);
    break;
  }

  try {
    const url = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ message, access_token: TOKEN }) });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);

    const fbPostId = json.id; // dạng {pageId}_{postId}
    const externalUrl = `https://www.facebook.com/${fbPostId}`;
    await client.from('hr_job_posts')
      .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl })
      .eq('id', p.id);
    await logRun(client, { task: 'hr.publish_facebook', status: 'ok', detail: { postId: p.id, fbPostId, externalUrl } });

    published++;
    console.log(`  Đã đăng: ${externalUrl}`);
  } catch (err) {
    // Gặp rào là dừng, không thử lại vòng lặp (Phần 6 nguyên lý 7).
    await client.from('hr_job_posts').update({ trang_thai: 'failed' }).eq('id', p.id);
    await logRun(client, { task: 'hr.publish_facebook', status: 'error', detail: { postId: p.id, error: String(err.message || err) } });
    console.error(`  LỖI khi đăng, dừng lại: ${err.message || err}`);
    console.error('  Kiểm token, quyền, hoặc rào chắn của Facebook rồi chạy lại.');
    break;
  }
}

console.log(`\nXong. Đăng thật ${published} bài.`);
