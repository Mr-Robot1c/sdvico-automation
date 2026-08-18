// Phân loại bình luận Facebook mới rồi xử lý theo đúng một trong ba hướng:
//   muon_biet_them — soạn câu mời nhắn Messenger, ĐẨY vào hàng đợi duyệt. KHÔNG đăng ở đây
//                    (điều cấm 1 — worker publish-comment-reply.mjs mới đăng sau khi duyệt).
//   tich_cuc       — tự react (like) trực tiếp, không qua hàng đợi (không phải "thư/tin nhắn").
//   khac           — đánh dấu bỏ qua, không làm gì thêm.
//
// Cách chạy:
//   Chạy thử, không react thật:  node packages/hr/src/post/queue-comment-replies.mjs
//   React thật:                  node packages/hr/src/post/queue-comment-replies.mjs --live

import { getServiceClient, pushApproval, logRun, incrementDailyCounter, isStopped } from '../../../core/src/index.js';
import { classifyComment, composeCommentReply } from './compose-comment-reply.js';

const LIVE = process.argv.includes('--live');
const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const REACT_LIMIT = Number(process.env.HR_FB_REACT_MAX_PER_DAY) || 50;

const client = getServiceClient();

const { data: rows, error } = await client
  .from('hr_fb_comments')
  .select('id, job_post_id, fb_comment_id, from_name, message')
  .eq('trang_thai', 'new')
  .order('created_at', { ascending: true })
  .limit(20);
if (error) throw new Error('Đọc hr_fb_comments lỗi: ' + error.message);

const rowsToProcess = rows || [];
const queued = [];
const reacted = [];
const ignored = [];

async function reactLike(fbCommentId) {
  const url = `https://graph.facebook.com/${VERSION}/${fbCommentId}/likes`;
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ access_token: TOKEN }) });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
}

for (const row of rowsToProcess) {
  const nhan = await classifyComment(row.message || '');

  if (nhan === 'muon_biet_them') {
    let postContext = '';
    if (row.job_post_id) {
      const { data: post } = await client.from('hr_job_posts').select('tieu_de').eq('id', row.job_post_id).maybeSingle();
      postContext = post?.tieu_de || '';
    }
    const { goi_y_tra_loi, generator } = await composeCommentReply({ postContext, comment: row.message || '' });

    await client.from('hr_fb_comments').update({ trang_thai: 'composed', phan_loai: nhan, goi_y_tra_loi }).eq('id', row.id);
    await pushApproval(client, {
      kind: 'fb_comment_reply',
      title: `Trả lời bình luận: ${row.from_name || 'ẩn danh'}`,
      payload: { comment_id: row.id, fb_comment_id: row.fb_comment_id, message: row.message, goi_y_tra_loi, nguon_soan: generator },
      refTable: 'hr_fb_comments',
      refId: row.id
    });
    queued.push({ id: row.id, from: row.from_name, generator });
    console.log(`- Muốn biết thêm, đã soạn và đẩy duyệt: ${row.from_name || 'ẩn danh'} (${generator})`);
    continue;
  }

  if (nhan === 'tich_cuc') {
    await client.from('hr_fb_comments').update({ phan_loai: nhan }).eq('id', row.id);
    if (!LIVE) {
      console.log(`- (chạy thử) Sẽ react like: ${row.from_name || 'ẩn danh'}`);
      continue;
    }
    if (await isStopped(client)) { console.log('  Công tắc dừng khẩn đang bật. Dừng react.'); break; }
    const quota = await incrementDailyCounter(client, { account: 'fb_comment_react', kind: 'hr_fb_comment_react', limit: REACT_LIMIT });
    if (!quota.allowed) { console.log(`  Đã chạm trần ${REACT_LIMIT} lượt react trong ngày. Dừng.`); break; }
    try {
      await reactLike(row.fb_comment_id);
      await client.from('hr_fb_comments').update({ trang_thai: 'reacted' }).eq('id', row.id);
      await logRun(client, { task: 'hr.react_comment', status: 'ok', detail: { commentId: row.id, fbCommentId: row.fb_comment_id } });
      reacted.push(row.id);
      console.log(`- Đã react like: ${row.from_name || 'ẩn danh'}`);
    } catch (err) {
      await client.from('hr_fb_comments').update({ trang_thai: 'failed' }).eq('id', row.id);
      await logRun(client, { task: 'hr.react_comment', status: 'error', detail: { commentId: row.id, error: String(err.message || err) } });
      console.error(`  LỖI khi react: ${err.message || err}`);
    }
    continue;
  }

  // nhan === 'khac'
  await client.from('hr_fb_comments').update({ phan_loai: nhan, trang_thai: 'ignored' }).eq('id', row.id);
  ignored.push(row.id);
  console.log(`- Bỏ qua (không liên quan/spam): ${row.from_name || 'ẩn danh'}`);
}

await logRun(client, {
  task: 'hr.queue_comment_replies',
  status: 'ok',
  detail: { queued: queued.length, reacted: reacted.length, ignored: ignored.length, live: LIVE }
});
console.log(`\nXong. ${queued.length} vào hàng đợi duyệt, ${reacted.length} đã react, ${ignored.length} bỏ qua.`);
