// Test cho bài tương tác: bản lùi luôn dùng được, kho góc bài sạch giọng văn, tách tiêu đề thân bài.
// Chạy: node --test packages/hr/test/engagement.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TOPICS, THEMES, pickTopics } from '../src/post/engagement-topics.js';
import { composeEngagementPost, sanitizeVoice, checkVoice, checkQuality } from '../src/post/compose-engagement.js';

test('kho góc bài không có lỗi giọng văn', () => {
  assert.ok(TOPICS.length >= 6, 'cần đủ góc bài để xoay vòng');
  for (const t of TOPICS) {
    assert.ok(t.id && t.chu_de && t.goc, `góc bài thiếu trường: ${t.id}`);
    assert.ok(THEMES[t.chu_de], `chu_de không hợp lệ: ${t.chu_de}`);
    const loi = checkVoice(`${t.tieu_de}\n${t.noi_dung}`);
    assert.deepEqual(loi, [], `góc bài ${t.id} vi phạm giọng văn: ${loi.join(', ')}`);
  }
});

test('mỗi chủ đề đều có ít nhất một góc bài', () => {
  for (const chuDe of Object.keys(THEMES)) {
    const co = TOPICS.some((t) => t.chu_de === chuDe);
    assert.ok(co, `chủ đề ${chuDe} chưa có góc bài`);
  }
});

test('bản lùi luôn trả bài dùng được khi không có khóa mô hình', async () => {
  for (const t of TOPICS) {
    const bai = await composeEngagementPost(t, { apiKey: null });
    assert.equal(bai.generator, 'fallback');
    assert.ok(bai.tieu_de.trim().length > 0, `thiếu tiêu đề: ${t.id}`);
    assert.ok(bai.noi_dung.trim().length > 0, `thiếu thân bài: ${t.id}`);
    assert.deepEqual(checkVoice(`${bai.tieu_de}\n${bai.noi_dung}`), [], `bài lùi ${t.id} vi phạm giọng văn`);
    // Không để số điện thoại hay link trong thân bài, phần đó để ở bình luận.
    assert.ok(!/1900|https?:\/\//.test(bai.noi_dung), `thân bài ${t.id} không nên chứa hotline hoặc link`);
  }
});

test('sanitizeVoice sửa các ký hiệu cấm', () => {
  assert.equal(sanitizeVoice('a — b'), 'a, b');
  assert.ok(!/[→►•·—–]/.test(sanitizeVoice('x → y • z — t')));
  assert.equal(sanitizeVoice('cá & tôm'), 'cá và tôm');
});

test('sanitizeVoice bỏ markdown Facebook không render', () => {
  assert.equal(sanitizeVoice('**Tiêu đề**'), 'Tiêu đề');
  assert.equal(sanitizeVoice('nói *nhẹ* thôi'), 'nói nhẹ thôi');
  assert.equal(sanitizeVoice('__quan trọng__'), 'quan trọng');
  assert.equal(sanitizeVoice('# Heading\nthân bài'), 'Heading\nthân bài');
  assert.equal(sanitizeVoice('## Cấp 2\nnội dung'), 'Cấp 2\nnội dung');
  // Dấu * lẻ trong câu (ví dụ nhân số 3*5) không bị nuốt.
  assert.ok(sanitizeVoice('kích thước 3 * 5 mét').includes('3 * 5'));
});

test('checkVoice bắt được lỗi', () => {
  assert.ok(checkVoice('a — b').length > 0);
  assert.ok(checkVoice('a → b').length > 0);
  assert.ok(checkVoice('**bold**').length > 0);
  assert.ok(checkVoice('__gạch chân__').length > 0);
  assert.ok(checkVoice('# heading').length > 0);
  assert.ok(checkVoice('bình thường không lỗi').length === 0);
});

test('checkQuality bắt bài cụt, xưng sai, chèn tiếng Anh', () => {
  // Bài đủ dấu kết, xưng hô đúng, không tiếng Anh: sạch.
  assert.deepEqual(checkQuality('Anh em ơi, chuyến biển vừa rồi thế nào?'), []);
  // Cụt giữa câu.
  assert.ok(checkQuality('Bài kể chuyện mà chưa hết').some((s) => s.includes('cụt')));
  // Xưng "bạn".
  assert.ok(checkQuality('Bạn ơi, theo dõi trang nhé.').some((s) => s.includes('bạn')));
  // Xưng "các bạn".
  assert.ok(checkQuality('Các bạn nghĩ sao?').some((s) => s.includes('bạn')));
  // Tiếng Anh.
  assert.ok(checkQuality('Anh em nhớ follow trang nhé.').some((s) => s.includes('tiếng Anh')));
  // Kho góc bài sạch cả với checkQuality (bản lùi luôn dùng được).
  for (const t of TOPICS) {
    assert.deepEqual(checkQuality(`${t.tieu_de}\n\n${t.noi_dung}`), [], `kho ${t.id} vi phạm quality`);
  }
});

test('pickTopics đúng số lượng, lọc chủ đề và xoay vòng', () => {
  const ba = pickTopics({ count: 3 });
  assert.equal(ba.length, 3);

  const chiHoiDap = pickTopics({ count: 4, themes: ['hoi_dap'] });
  assert.equal(chiHoiDap.length, 4);
  assert.ok(chiHoiDap.every((t) => t.chu_de === 'hoi_dap'));

  // startAt khác nhau cho góc bài bắt đầu khác nhau (xoay vòng, tránh soạn trùng mỗi ngày).
  const r0 = pickTopics({ count: 1, startAt: 0 })[0].id;
  const r1 = pickTopics({ count: 1, startAt: 1 })[0].id;
  assert.notEqual(r0, r1);
});
