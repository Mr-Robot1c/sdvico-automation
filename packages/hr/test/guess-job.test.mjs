// Test heuristic đoán job_id cho application mới (từ subject email + CV text).
// Chạy: node --test packages/hr/test/guess-job.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessJobId } from '../src/intake/guess-job.js';

const JOBS = [
  { id: 'j1', title: 'Kỹ sư phần mềm' },
  { id: 'j2', title: 'Kỹ sư phần mềm backend' },
  { id: 'j3', title: 'Chuyên viên marketing' },
  { id: 'j4', title: 'IT' }, // quá ngắn — không match được
];

test('subject khớp title → match', () => {
  const id = guessJobId(JOBS, { subject: 'Ứng tuyển Kỹ sư phần mềm', cvText: '' });
  assert.equal(id, 'j1');
});

test('subject khớp cả 2 title, chọn cái DÀI HƠN (specificity)', () => {
  const id = guessJobId(JOBS, { subject: 'Ứng tuyển Kỹ sư phần mềm backend', cvText: '' });
  assert.equal(id, 'j2', 'j2 dài hơn j1 → thắng');
});

test('không có subject, match từ CV text', () => {
  const id = guessJobId(JOBS, { subject: '', cvText: 'Tôi mong muốn ứng tuyển vào vị trí Chuyên viên marketing tại quý công ty...' });
  assert.equal(id, 'j3');
});

test('subject match được ưu tiên hơn CV match', () => {
  // Subject match j1 (Kỹ sư phần mềm), CV match j3. Subject phải thắng vì trọng số cao hơn.
  const id = guessJobId(JOBS, {
    subject: 'Ứng tuyển Kỹ sư phần mềm',
    cvText: 'Kinh nghiệm 5 năm Chuyên viên marketing',
  });
  assert.equal(id, 'j1');
});

test('không có gì khớp → null', () => {
  const id = guessJobId(JOBS, { subject: 'Chào buổi sáng', cvText: 'Kinh nghiệm quản lý dự án' });
  assert.equal(id, null);
});

test('bỏ dấu khi so sánh (subject không dấu vẫn match title có dấu)', () => {
  const id = guessJobId(JOBS, { subject: 'Ung tuyen Ky su phan mem', cvText: '' });
  assert.equal(id, 'j1', 'phải bỏ dấu 2 vế để match');
});

test('title quá ngắn (2 ký tự) không match', () => {
  const id = guessJobId(JOBS, { subject: 'Về vị trí IT tại quý công ty', cvText: '' });
  // "IT" chỉ 2 ký tự, dưới MIN_TITLE_LEN=5 → không match
  assert.equal(id, null);
});

test('jobs rỗng → null', () => {
  assert.equal(guessJobId([], { subject: 'Kỹ sư', cvText: '' }), null);
});

test('input null/undefined không lỗi', () => {
  assert.equal(guessJobId(JOBS, { subject: null, cvText: undefined }), null);
});
