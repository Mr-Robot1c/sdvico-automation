// test-approve-guard.mjs — kiểm 21/10: bài cờ đỏ phải tick "Quản lý đã duyệt", ô YouTube chưa có video không duyệt được,
// giờ hẹn YouTube đổi đúng giờ VN. Chạy: npm run test:approve (không mạng; Node 24 nạp thẳng file .ts).
import assert from 'node:assert/strict';
import { approveBlockReason, needsManagerApproval } from './approve-guard.ts';
import { youtubePublishAt } from './youtube-schedule.ts';

const fakeClient = (row) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
});
const withVideo = { brief: { assets: { video: 'v1' }, channels: ['youtube'] }, needs_gov_review: false };
const noVideo = { brief: { assets: {}, channels: ['youtube'] }, needs_gov_review: false };

let n = 0;
const t = async (name, fn) => { await fn(); n++; };

await t('cờ quản lý: risk đỏ, cờ phiếu, cờ bài', () => {
  assert.equal(needsManagerApproval({ risk: 'red' }, false), true);
  assert.equal(needsManagerApproval({ needs_manager_approval: true }, false), true);
  assert.equal(needsManagerApproval({ risk: 'amber' }, true), true);
  assert.equal(needsManagerApproval({ risk: 'amber' }, false), false);
});
await t('bài cờ đỏ chưa tick -> chặn', async () => {
  assert.equal(await approveBlockReason(fakeClient({ brief: {}, needs_gov_review: false }), { content_id: 'c', risk: 'red', channels: ['facebook'] }, false), 'can-quan-ly-duyet');
});
await t('bài gov ở mkt_content (phiếu không ghi cờ) chưa tick -> chặn', async () => {
  assert.equal(await approveBlockReason(fakeClient({ brief: {}, needs_gov_review: true }), { content_id: 'c', risk: 'none', channels: ['facebook'] }, false), 'can-quan-ly-duyet');
});
await t('bài cờ đỏ đã tick -> cho duyệt', async () => {
  assert.equal(await approveBlockReason(fakeClient({ brief: {}, needs_gov_review: true }), { content_id: 'c', risk: 'red', channels: ['facebook'] }, true), null);
});
await t('ô YouTube chưa có video -> chặn', async () => {
  assert.equal(await approveBlockReason(fakeClient(noVideo), { content_id: 'c', channels: ['youtube'] }, false), 'youtube-chua-co-video');
});
await t('ô YouTube video lỗi -> lý do riêng', async () => {
  assert.equal(await approveBlockReason(fakeClient({ ...noVideo, brief: { ...noVideo.brief, video_failed: true } }), { content_id: 'c', channels: ['youtube'] }, false), 'youtube-video-loi');
});
await t('ô YouTube có video -> cho duyệt', async () => {
  assert.equal(await approveBlockReason(fakeClient(withVideo), { content_id: 'c', channels: ['youtube'] }, false), null);
});
await t('bài Facebook thường -> cho duyệt', async () => {
  assert.equal(await approveBlockReason(fakeClient({ brief: { assets: {} }, needs_gov_review: false }), { content_id: 'c', channels: ['facebook'] }, false), null);
});
await t('giờ hẹn YouTube: 19:30 VN -> 12:30 UTC', () => {
  assert.equal(youtubePublishAt('2026-10-21T19:30', Date.parse('2026-10-21T03:00:00Z')), '2026-10-21T12:30:00.000Z');
});
await t('giờ hẹn đã qua, quá gần, trống, sai dạng -> đăng ngay', () => {
  const now = Date.parse('2026-10-21T12:20:00Z'); // 19:20 VN
  assert.equal(youtubePublishAt('2026-10-21T19:30', now), null);
  assert.equal(youtubePublishAt('2026-10-21T08:00', now), null);
  assert.equal(youtubePublishAt(null, now), null);
  assert.equal(youtubePublishAt('sai', now), null);
});
console.log(`${n}/${n} test approve-guard xanh`);
