// publish-facebook.mjs — CƠ CẤU CHẤP HÀNH: đăng bài đã Duyệt lên Facebook Page qua Graph API.
//
// Chạy thử (không đăng, chỉ in ra): node packages/marketing/src/publish-facebook.mjs
// Đăng thật:                        node packages/marketing/src/publish-facebook.mjs --live
//
// Nguyên tắc an toàn (bám kế hoạch):
//  - CHỈ đăng mục trong approval_queue có status='approved' và kind='mkt_publish_content'.
//    Máy soạn, người bấm Duyệt, worker mới đăng. Không có nhánh nào tự đăng bài chưa duyệt.
//  - Dùng API CHÍNH THỨC (Graph API), đăng nội dung của SDVICO lên Page của SDVICO. Không
//    phải tương tác ảo, không thu thập dữ liệu người khác (khác hẳn SMM panel).
//  - Trần cứng mỗi lần chạy (mặc định 3 bài, đổi bằng MKT_MAX_POSTS_PER_RUN). Thấp hơn hạn
//    mức sàn (Phần 6 nguyên lý 5).
//  - Gặp lỗi thì DỪNG ngay, ghi run_log, không thử lại vòng lặp (Phần 6 nguyên lý 7).
//  - Không đăng lại bài đã đăng (kiểm mkt_posts theo content_id + channel facebook).

import { getServiceClient, logRun } from '@sdvico/core';

const LIVE = process.argv.includes('--live');
const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const CAP = Number(process.env.MKT_MAX_POSTS_PER_RUN) || 3;

const client = getServiceClient();

// 1. Lấy các bài ĐÃ DUYỆT trong hàng đợi.
const { data: approved, error: e1 } = await client
  .from('approval_queue')
  .select('id, title, payload')
  .eq('kind', 'mkt_publish_content')
  .eq('status', 'approved')
  .order('created_at', { ascending: true });
if (e1) throw new Error('Đọc approval_queue lỗi: ' + e1.message);

const jobs = (approved || [])
  .map((a) => ({ approvalId: a.id, title: a.title, contentId: a.payload?.content_id, channel: a.payload?.channel }))
  // Chỉ đăng Facebook bản định dạng Facebook (social). Bài website và kịch bản video đi kênh khác.
  .filter((j) => j.contentId && (j.channel === 'facebook' || !j.channel));

if (jobs.length === 0) {
  console.log('Không có bài nào đã duyệt chờ đăng. Xong.');
  process.exit(0);
}

// 2. Bỏ các bài đã đăng lên Facebook rồi.
const contentIds = jobs.map((j) => j.contentId);
const { data: posted } = await client
  .from('mkt_posts')
  .select('content_id')
  .eq('channel', 'facebook')
  .in('content_id', contentIds);
const done = new Set((posted || []).map((p) => p.content_id));

// 3. Lấy nội dung bản nháp (kèm brief để biết ảnh đã gắn).
const { data: contents } = await client
  .from('mkt_content')
  .select('id, title, draft, brief')
  .in('id', contentIds);
const byId = new Map((contents || []).map((c) => [c.id, c]));

// 3b. Đổi id ảnh/video đã gắn (brief.assets) ra link công khai để đăng kèm bài.
const assetIds = [
  ...new Set(
    (contents || [])
      .flatMap((c) => [c?.brief?.assets?.image, c?.brief?.assets?.video])
      .filter((x) => typeof x === 'string')
  ),
];
const imageUrlById = new Map();
if (assetIds.length) {
  const { data: assets } = await client
    .from('brand_assets')
    .select('id, storage_path')
    .in('id', assetIds);
  for (const a of assets || []) {
    imageUrlById.set(a.id, client.storage.from('brand-assets').getPublicUrl(a.storage_path).data.publicUrl);
  }
}

const queue = jobs.filter((j) => !done.has(j.contentId)).slice(0, CAP);
console.log(`=== Đăng Facebook (${LIVE ? 'LIVE' : 'CHẠY THỬ'}) ===`);
console.log(`${jobs.length} bài đã duyệt, ${queue.length} bài sẽ đăng lần này (trần ${CAP}).\n`);

if (queue.length === 0) {
  console.log('Các bài đã duyệt đều đăng rồi. Xong.');
  process.exit(0);
}

if (LIVE && (!PAGE_ID || !TOKEN)) {
  console.error('Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN trong .env. Xem hướng dẫn lấy token.');
  process.exit(1);
}

let publishedCount = 0;
for (const j of queue) {
  const c = byId.get(j.contentId);
  const message = [c?.title || j.title, '', c?.draft || ''].join('\n').trim();
  const imageUrl = c?.brief?.assets?.image ? imageUrlById.get(c.brief.assets.image) : null;
  const videoUrl = c?.brief?.assets?.video ? imageUrlById.get(c.brief.assets.video) : null;

  console.log(`- ${j.title}${videoUrl ? ' (kèm video)' : imageUrl ? ' (kèm ảnh)' : ''}`);
  if (!LIVE) {
    console.log('  (chạy thử, chưa đăng) nội dung:');
    for (const line of message.split('\n')) console.log('    ' + line);
    if (videoUrl) console.log('    [video] ' + videoUrl);
    else if (imageUrl) console.log('    [ảnh] ' + imageUrl);
    console.log('');
    continue;
  }

  try {
    // Ưu tiên video (/videos), rồi ảnh (/photos), không thì chữ (/feed).
    const url = videoUrl
      ? `https://graph.facebook.com/${VERSION}/${PAGE_ID}/videos`
      : imageUrl
        ? `https://graph.facebook.com/${VERSION}/${PAGE_ID}/photos`
        : `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
    const body = videoUrl
      ? new URLSearchParams({ file_url: videoUrl, description: message, access_token: TOKEN })
      : imageUrl
      ? new URLSearchParams({ url: imageUrl, caption: message, access_token: TOKEN })
      : new URLSearchParams({ message, access_token: TOKEN });
    const res = await fetch(url, { method: 'POST', body });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);

    // /feed trả {id: pageId_postId}; /photos trả {id: photoId, post_id: pageId_postId}.
    const postId = json.post_id || json.id;
    const externalUrl = `https://www.facebook.com/${postId}`;

    await client.from('mkt_posts').insert({
      content_id: j.contentId,
      channel: 'facebook',
      status: 'published',
      external_url: externalUrl,
      published_at: new Date().toISOString(),
    });
    await client.from('mkt_content').update({ status: 'published' }).eq('id', j.contentId);
    await logRun(client, { task: 'mkt.publish_facebook', status: 'ok', detail: { contentId: j.contentId, postId, externalUrl } });

    publishedCount++;
    console.log(`  Đã đăng: ${externalUrl}`);
  } catch (err) {
    // Gặp rào thì dừng, không thử lại vòng lặp (Phần 6 nguyên lý 7).
    await client.from('mkt_posts').insert({
      content_id: j.contentId,
      channel: 'facebook',
      status: 'failed',
    });
    await logRun(client, { task: 'mkt.publish_facebook', status: 'error', detail: { contentId: j.contentId, error: String(err.message || err) } });
    console.error(`  LỖI khi đăng, dừng lại: ${err.message || err}`);
    console.error('  Kiểm tra token, quyền, hoặc rào chắn của Facebook rồi chạy lại.');
    break;
  }
}

console.log(`\nXong. Đăng thật ${publishedCount} bài.`);
