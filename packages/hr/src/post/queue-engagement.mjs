// Soạn bài tương tác hâm nóng trang tuyển dụng rồi ĐẨY vào hàng đợi duyệt. KHÔNG đăng.
// Máy soạn, người bấm Duyệt (điều cấm 1). Worker publish-facebook.mjs đăng sau khi được duyệt,
// dùng chung đường ống với tin tuyển dụng (kind='hr_job_post').
//
// Cách chạy:
//   Ba bài, xoay vòng ba chủ đề:      node packages/hr/src/post/queue-engagement.mjs
//   Số lượng tùy chọn:                node packages/hr/src/post/queue-engagement.mjs --count 2
//   Lọc chủ đề (doi_song|nganh_bien|hoi_dap, cách nhau bằng dấu phẩy):
//                                     node packages/hr/src/post/queue-engagement.mjs --theme hoi_dap,nganh_bien
//   Chạy thử, chỉ in, không ghi DB:   node packages/hr/src/post/queue-engagement.mjs --dry-run

import { getServiceClient, pushApproval, logRun } from '../../../core/src/index.js';
import { composeEngagementPost } from './compose-engagement.js';
import { pickTopics } from './engagement-topics.js';

const client = getServiceClient();

function argVal(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DRY = process.argv.includes('--dry-run');
const COUNT = Math.max(1, Number(argVal('--count', '3')) || 3);
const THEMES_ARG = (argVal('--theme', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

// Nền tảng Facebook trong hr_platforms nếu đã cấu hình, để gắn platform_id cho bài.
async function facebookPlatformId() {
  const { data } = await client.from('hr_platforms').select('id, ten, loai').eq('loai', 'social');
  const fb = (data || []).find((p) => /face/i.test(p.ten));
  return fb ? fb.id : null;
}

// Số bài tương tác đã có, không tính bài xóa mềm. Dùng làm điểm bắt đầu xoay vòng góc bài,
// để mỗi lần chạy soạn góc khác nhau, tránh lặp.
async function existingCount() {
  const { count } = await client
    .from('hr_job_posts')
    .select('id', { count: 'exact', head: true })
    .eq('loai', 'tuong_tac')
    .is('deleted_at', null);
  return count || 0;
}

// Đã có bài tương tác cùng góc đang chờ duyệt hoặc chờ đăng thì bỏ, tránh chất đống nháp trùng.
async function pendingSameTopic(topicId) {
  const { data } = await client
    .from('hr_job_posts')
    .select('id')
    .eq('loai', 'tuong_tac')
    .eq('ghi_chu', `topic:${topicId}`)
    .is('deleted_at', null)
    .in('trang_thai', ['draft', 'scheduled']);
  return (data || []).length > 0;
}

const startAt = DRY ? 0 : await existingCount();
const topics = pickTopics({ count: COUNT, themes: THEMES_ARG.length ? THEMES_ARG : null, startAt });
const platformId = DRY ? null : await facebookPlatformId();
const done = [];

for (const topic of topics) {
  const { tieu_de, noi_dung, generator } = await composeEngagementPost(topic);

  if (DRY) {
    console.log(`--- [${topic.chu_de}] ${topic.id} (${generator}) ---`);
    console.log(tieu_de);
    console.log('');
    console.log(noi_dung);
    console.log('');
    continue;
  }

  if (await pendingSameTopic(topic.id)) {
    console.log(`- Bỏ qua, đã có nháp chờ duyệt cùng góc: ${topic.id}`);
    continue;
  }

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .insert({
      job_id: null,
      platform_id: platformId,
      kenh: 'facebook',
      loai: 'tuong_tac',
      chu_de: topic.chu_de,
      tieu_de,
      noi_dung,
      ghi_chu: `topic:${topic.id}`,
      trang_thai: 'draft'
    })
    .select('id')
    .single();
  if (e1) throw new Error('Lưu hr_job_posts lỗi: ' + e1.message);

  await pushApproval(client, {
    kind: 'hr_job_post',
    title: `[Tương tác] ${tieu_de}`,
    payload: { post_id: post.id, loai: 'tuong_tac', chu_de: topic.chu_de, kenh: 'facebook', body: noi_dung, nguon_soan: generator },
    refTable: 'hr_job_posts',
    refId: post.id
  });

  done.push({ topic: topic.id, post_id: post.id, generator });
  console.log(`- Đã soạn và đẩy duyệt: [Tương tác] ${tieu_de} (${generator})`);
}

if (!DRY) {
  await logRun(client, { task: 'hr.queue_engagement', status: 'ok', detail: { queued: done.length, items: done } });
  console.log(done.length
    ? `\nXong. ${done.length} bài tương tác vào hàng đợi duyệt, chờ người bấm Duyệt trong giao diện.`
    : 'Không soạn bài mới. Các góc chọn đều đang có nháp chờ duyệt.');
}
