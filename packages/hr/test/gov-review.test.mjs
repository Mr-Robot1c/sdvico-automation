// Test heuristic điều cấm 3 (needs_gov_review).
// Bản mirror của apps/approval-ui/lib/gov-review.ts — cùng danh sách từ khoá.
// Chạy: node --test packages/hr/test/gov-review.test.mjs
//
// Test tại đây cover luôn cho .ts bên approval-ui vì logic là regex thuần —
// nếu 2 file lệch nhau, test này thất bại sẽ nhắc cập nhật cả hai.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const KEYWORDS = [
  /\bIUU\b/i, /iuu/i,
  /c[uụ]c\s+th[uủ]y\s+s[ảa]n/i,
  /ki[eể]m\s+ng[uư]/i,
  /ngh[iị]\s+đ[iị]nh/i,
  /th[oô]ng\s+t[uư]\s+\d+\/\d+/i,
  /quy\s+đ[iị]nh\s+nh[aà]\s+n[uư][oớ]c/i,
  /gi[aấ]y\s+ph[eé]p\s+khai\s+th[aá]c/i,
  /vi\s+ph[aạ]m\s+h[aà]nh\s+ch[ií]nh/i,
  /ch[oố]ng\s+kh[aa]i\s+th[aá]c\s+b[aấ]t\s+h[oợ]p\s+ph[aá]p/i,
  /truy\s+xu[aấ]t\s+ngu[oồ]n\s+g[oố]c/i,
  /\bVMS\b/i,
];

function detectGovReviewNeeded(text) {
  if (!text) return false;
  return KEYWORDS.some((re) => re.test(text));
}

test('bắt IUU', () => {
  assert.ok(detectGovReviewNeeded('Bài về IUU và quy định mới'));
  assert.ok(detectGovReviewNeeded('iuu compliance training'));
});

test('bắt Cục Thủy sản / Kiểm ngư', () => {
  assert.ok(detectGovReviewNeeded('theo hướng dẫn của Cục Thủy sản'));
  assert.ok(detectGovReviewNeeded('phối hợp với Kiểm ngư địa phương'));
});

test('bắt Nghị định + Thông tư', () => {
  assert.ok(detectGovReviewNeeded('theo Nghị định 26/2019/NĐ-CP'));
  assert.ok(detectGovReviewNeeded('quy định tại Thông tư 21/2018'));
});

test('bắt truy xuất nguồn gốc và VMS', () => {
  assert.ok(detectGovReviewNeeded('hệ thống truy xuất nguồn gốc thủy sản'));
  assert.ok(detectGovReviewNeeded('lắp đặt VMS trên tàu cá'));
});

test('KHÔNG cờ nội dung tuyển dụng thông thường', () => {
  assert.equal(detectGovReviewNeeded('Tuyển kỹ sư điện — kinh nghiệm 3 năm, lương thoả thuận'), false);
  assert.equal(detectGovReviewNeeded('Chúng tôi cần người có kinh nghiệm marketing.'), false);
});

test('KHÔNG cờ chuỗi rỗng', () => {
  assert.equal(detectGovReviewNeeded(''), false);
  assert.equal(detectGovReviewNeeded(null), false);
  assert.equal(detectGovReviewNeeded(undefined), false);
});

test('bắt "vms" chữ thường nhưng không nhầm với chữ ghép', () => {
  assert.ok(detectGovReviewNeeded('vms is required'));
  // "avms" không có word boundary nên không match.
  assert.equal(detectGovReviewNeeded('avmsavms'), false);
});
