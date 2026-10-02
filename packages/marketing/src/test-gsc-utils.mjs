import assert from 'node:assert/strict';
import {
  aggregateGscPageRows,
  fetchAllGscRows,
  gscDateRange,
  normalizeGscPageUrl,
} from '../../../apps/approval-ui/lib/gsc-utils.mjs';

const canonical = 'sdvico.vn/blog/bai-viet-12345678';
assert.equal(normalizeGscPageUrl('https://sdvico.vn/blog/bai-viet-12345678/'), canonical, 'trailing slash');
assert.equal(normalizeGscPageUrl('http://sdvico.vn/blog/bai-viet-12345678'), canonical, 'http/https');
assert.equal(normalizeGscPageUrl('https://www.sdvico.vn/blog/bai-viet-12345678'), canonical, 'www/non-www');
assert.equal(normalizeGscPageUrl('https://sdvico.vn/BLOG/BAI-VIET-12345678?utm_source=x#top'), canonical, 'case/query/hash');
assert.equal(normalizeGscPageUrl('https://sdvico.vn/blog/b%C3%A0i-vi%E1%BA%BFt/'), 'sdvico.vn/blog/bài-viết', 'URL encoding');
assert.equal(normalizeGscPageUrl(null), '', 'null URL');

const aggregated = aggregateGscPageRows([
  { page: 'https://sdvico.vn/blog/a-12345678', clicks: 0, impressions: 0, ctr: 0, position: 0 },
  { page: 'http://www.sdvico.vn/blog/a-12345678/', clicks: 2, impressions: 10, ctr: 0.2, position: 4 },
  { page: 'https://sdvico.vn/blog/a-12345678?x=1', clicks: 1, impressions: 30, ctr: 0.033, position: 8 },
]);
assert.equal(aggregated.length, 1, 'các biến thể URL phải gộp thành một trang');
assert.equal(aggregated[0].clicks, 3, 'SUM clicks, giữ được zero clicks');
assert.equal(aggregated[0].impressions, 40, 'SUM impressions, giữ được zero impressions');
assert.equal(aggregated[0].ctr, 3 / 40, 'CTR phải tính từ tổng, không AVG ctr');
assert.equal(aggregated[0].position, 7, 'position phải weighted theo impressions');
assert.equal(new Map(aggregated.map((r) => [r.normalizedPage, r])).get('sdvico.vn/blog/chua-co-87654321'), undefined, 'bài chưa có GSC row giữ null/undefined');

const batches = [[{ page: 'a' }, { page: 'b' }], [{ page: 'c' }]];
const paged = await fetchAllGscRows(async (startRow, rowLimit) => {
  assert.equal(rowLimit, 2);
  return batches[startRow / rowLimit] || [];
}, 2);
assert.equal(paged.pagesFetched, 2, 'pagination phải lấy batch kế tiếp');
assert.deepEqual(paged.rows.map((r) => r.page), ['a', 'b', 'c']);

assert.deepEqual(
  gscDateRange(new Date('2026-09-28T18:30:00.000Z'), 28, 2),
  { from: '2026-08-31', to: '2026-09-27' },
  '00:00-07:00 giờ Việt Nam không được lùi nhầm thêm một ngày theo UTC',
);

console.log('GSC utils: 16/16 ca đạt.');
