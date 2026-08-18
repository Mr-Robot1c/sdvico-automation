// CƠ CẤU CHẤP HÀNH: đăng câu trả lời bình luận ĐÃ DUYỆT lên Facebook qua Graph API.
// Chỉ đăng mục approval_queue kind='fb_comment_reply' status='approved'. Máy soạn, người bấm
// Duyệt, worker mới đăng (điều cấm 1). Nội dung lấy từ approval_queue.payload (người có thể đã
// sửa lại câu trả lời trước khi duyệt), không lấy lại goi_y_tra_loi gốc.
//
// Cách chạy:
//   Chạy thử, không đăng, chỉ in:  node packages/hr/src/post/publish-comment-reply.mjs
//   Đăng thật:                     node packages/hr/src/post/publish-comment-reply.mjs --live
//
// An toàn: trần cứng số câu trả lời mỗi ngày (HR_FB_COMMENT_MAX_PER_DAY, mặc định 20), bộ đếm
// lưu trong cơ sở dữ liệu; kiểm dừng khẩn trước mỗi lần đăng; gặp lỗi thì DỪNG, không thử lại.

import { getServiceClient, logRun, incrementDailyCounter, isStopped } from '../../../core/src/index.js';

const LIVE = process.argv.includes('--live');
const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const LIMIT = Number(process.env.HR_FB_COMMENT_MAX_PER_DAY) || 20;

const client = getServiceClient();

const { data: approved, error: e1 } = await client
  .from('approval_queue')
  .select('id, payload')
  .eq('kind', 'fb_comment_reply')
  .eq('status', 'approved')
  .order('created_at', { ascending: true });
if (e1) throw new Error('Đọc approval_queue lỗi: ' + e1.message);

const items = (approved || [])
  .map((a) => ({
    approvalId: a.id,
    commentId: a.payload?.comment_id,
    fbCommentId: a.payload?.fb_comment_id,
    replyText: a.payload?.reply_text || a.payload?.goi_y_tra_loi
  }))
  .filter((i) => i.commentId && i.fbCommentId && i.replyText);

if (items.length === 0) {
  console.log('Không có câu trả lời nào đã duyệt chờ đăng. Xong.');
  process.exit(0);
}

console.log(`=== Đăng trả lời bình luận Facebook (${LIVE ? 'LIVE' : 'CHẠY THỬ'}) ===`);
console.log(`${items.length} câu đã duyệt (trần ${LIMIT} câu mỗi ngày).\n`);

if (LIVE && !TOKEN) {
  console.error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN.');
  process.exit(1);
}

let published = 0;
for (const item of items) {
  console.log(`- Trả lời cho comment ${item.fbCommentId}: ${item.replyText.slice(0, 80)}`);
  if (!LIVE) continue;

  if (await isStopped(client)) {
    console.log('  Công tắc dừng khẩn đang bật. Dừng, không đăng.');
    break;
  }

  const quota = await incrementDailyCounter(client, { account: 'fb_comment_reply', kind: 'hr_fb_comment_reply', limit: LIMIT });
  if (!quota.allowed) {
    console.log(`  Đã chạm trần ${LIMIT} câu trong ngày. Dừng, để mai chạy tiếp.`);
    break;
  }

  try {
    const url = `https://graph.facebook.com/${VERSION}/${item.fbCommentId}/comments`;
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ message: item.replyText, access_token: TOKEN }) });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);

    await client.from('hr_fb_comments')
      .update({ trang_thai: 'replied', reply_text: item.replyText, replied_at: new Date().toISOString() })
      .eq('id', item.commentId);
    await client.from('approval_queue').update({ note: 'Đã đăng trả lời' }).eq('id', item.approvalId);
    await logRun(client, { task: 'hr.publish_comment_reply', status: 'ok', detail: { commentId: item.commentId, fbCommentId: item.fbCommentId } });

    published++;
    console.log('  Đã đăng trả lời.');
  } catch (err) {
    await client.from('hr_fb_comments').update({ trang_thai: 'failed' }).eq('id', item.commentId);
    await logRun(client, { task: 'hr.publish_comment_reply', status: 'error', detail: { commentId: item.commentId, error: String(err.message || err) } });
    console.error(`  LỖI khi đăng, dừng lại: ${err.message || err}`);
    break;
  }
}

console.log(`\nXong. Đăng thật ${published} câu trả lời.`);
