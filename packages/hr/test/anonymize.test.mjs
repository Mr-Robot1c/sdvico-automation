// Test bất biến an toàn cho anonymize CV.
// Chạy: node --test packages/hr/test/anonymize.test.mjs
// Điều cấm 6 + chống thiên vị (mục 1 của cổng an toàn mảng).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeCv } from '../src/screen/anonymize.js';

test('bỏ dòng có nhãn nhạy cảm ở đầu (họ tên, email, sđt)', () => {
  const cv = {
    raw_text: [
      'Họ tên: Nguyễn Văn A',
      'Email: a@example.com',
      'SĐT: 0901234567',
      'Kinh nghiệm 5 năm phát triển phần mềm.',
    ].join('\n'),
  };
  const { text } = anonymizeCv(cv);
  assert.ok(!text.includes('Nguyễn Văn A'), 'phải xoá dòng "Họ tên"');
  assert.ok(!text.includes('a@example.com'), 'phải xoá email');
  assert.ok(!text.includes('0901234567'), 'phải xoá SĐT');
  assert.ok(text.includes('phát triển phần mềm'), 'phải giữ nội dung năng lực');
});

test('bắt được banner tên viết hoa không nhãn ở đầu CV', () => {
  const cv = {
    raw_text: [
      'NGUYỄN VĂN A',
      'Kỹ sư phần mềm',
      '',
      'Mục tiêu nghề nghiệp: trở thành chuyên gia backend.',
    ].join('\n'),
  };
  const { text } = anonymizeCv(cv);
  assert.ok(!text.includes('NGUYỄN VĂN A'), 'banner tên toàn chữ hoa phải bị xoá');
});

test('bắt được SĐT có dấu cách và dấu chấm', () => {
  const cv = { raw_text: 'Liên hệ 090 123 4567 hoặc 084.987.6543 để trao đổi.' };
  const { text } = anonymizeCv(cv);
  assert.ok(!text.includes('090 123 4567'), 'SĐT có dấu cách phải bị che');
  assert.ok(!text.includes('084.987.6543'), 'SĐT có dấu chấm phải bị che');
  assert.ok(text.includes('[SĐT]'), 'phải thay bằng thẻ [SĐT]');
});

test('che tên đã biết dù không có nhãn', () => {
  const cv = {
    full_name: 'Trần Thị Bình',
    raw_text: 'Trần Thị Bình có 10 năm làm marketing. Trần thị bình đã dẫn team 20 người.',
  };
  const { text } = anonymizeCv(cv);
  assert.ok(!/Trần\s*Thị\s*Bình/i.test(text), 'tên đã biết phải bị che');
  assert.ok(text.includes('[TÊN]'), 'phải thay bằng thẻ [TÊN]');
});

test('giữ nguyên nội dung khi không có PII', () => {
  const cv = { raw_text: 'Kỹ năng: JavaScript, Python, quản trị dự án.' };
  const { text, removed } = anonymizeCv(cv);
  assert.equal(removed.lines, 0);
  assert.equal(removed.values, 0);
  assert.ok(text.includes('JavaScript'));
});

test('regex email bắt cả email dạng nested trong text', () => {
  const cv = { raw_text: 'Liên hệ qua work.nguyen@company.co.vn hoặc a+tag@x.io.' };
  const { text } = anonymizeCv(cv);
  assert.ok(!text.includes('work.nguyen@company.co.vn'));
  assert.ok(!text.includes('a+tag@x.io'));
});
