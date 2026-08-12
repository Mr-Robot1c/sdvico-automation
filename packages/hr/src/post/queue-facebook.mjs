// Soạn bài đăng tuyển Facebook cho các vị trí rồi ĐẨY vào hàng đợi duyệt. KHÔNG đăng.
// Máy soạn, người bấm Duyệt (điều cấm 1). Worker publish-facebook.mjs mới đăng sau khi được duyệt.
//
// Cách chạy:
//   Mọi vị trí đang tuyển chưa có bài:  node packages/hr/src/post/queue-facebook.mjs
//   Một vị trí cụ thể:                  node packages/hr/src/post/queue-facebook.mjs --job <job_id>

import { getServiceClient, pushApproval, logRun } from '../../../core/src/index.js';
import { composeFacebookPost } from './compose-social.js';

const client = getServiceClient();
const jobArg = (() => {
  const i = process.argv.indexOf('--job');
  return i >= 0 ? process.argv[i + 1] : null;
})();

// Nền tảng Facebook trong hr_platforms nếu đã cấu hình, để gắn platform_id cho tin đăng.
async function facebookPlatformId() {
  const { data } = await client.from('hr_platforms').select('id, ten, loai').eq('loai', 'social');
  const fb = (data || []).find((p) => /face/i.test(p.ten));
  return fb ? fb.id : null;
}

async function chooseJobs() {
  if (jobArg) {
    const { data, error } = await client.from('hr_jobs').select('*').eq('id', jobArg).single();
    if (error) throw new Error('Không tìm thấy vị trí: ' + error.message);
    return [data];
  }
  const { data, error } = await client
    .from('hr_jobs')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Đọc hr_jobs lỗi: ' + error.message);
  return data || [];
}

// Vị trí đã có bài Facebook đang chờ hoặc đã đăng thì bỏ, tránh tạo trùng.
async function alreadyQueued(jobId) {
  const { data } = await client
    .from('hr_job_posts')
    .select('id')
    .eq('job_id', jobId)
    .eq('kenh', 'facebook')
    .in('trang_thai', ['draft', 'scheduled', 'posted']);
  return (data || []).length > 0;
}

const platformId = await facebookPlatformId();
const jobs = await chooseJobs();
const done = [];

for (const job of jobs) {
  if (!jobArg && (await alreadyQueued(job.id))) continue;

  const { noi_dung, generator } = await composeFacebookPost(job);
  const tieu_de = `Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .insert({ job_id: job.id, platform_id: platformId, kenh: 'facebook', tieu_de, noi_dung, trang_thai: 'draft' })
    .select('id')
    .single();
  if (e1) throw new Error('Lưu hr_job_posts lỗi: ' + e1.message);

  await pushApproval(client, {
    kind: 'hr_job_post',
    title: tieu_de,
    payload: { post_id: post.id, job_id: job.id, kenh: 'facebook', dia_diem: job.location || null, body: noi_dung, nguon_soan: generator },
    refTable: 'hr_job_posts',
    refId: post.id
  });

  done.push({ job: job.title, post_id: post.id, generator });
  console.log(`- Đã soạn và đẩy duyệt: ${tieu_de} (${generator})`);
}

await logRun(client, { task: 'hr.queue_facebook', status: 'ok', detail: { queued: done.length, items: done } });
console.log(done.length
  ? `\nXong. ${done.length} bài vào hàng đợi duyệt, chờ người bấm Duyệt trong giao diện.`
  : 'Không có vị trí nào cần soạn. Vị trí phải ở trạng thái đang tuyển và chưa có bài Facebook.');
