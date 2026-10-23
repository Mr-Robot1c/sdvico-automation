// rank-products.mjs — xếp bậc sản phẩm cho BOSS, MỘT luật dùng chung (22/10, user: "thật sự con BOSS agent có hoạt
// động kh vậy?").
//
// Trước đây 3 chỗ tự xếp bậc, mỗi chỗ một luật: học tuần (learn-weekly.ts), bản sống mỗi tối (plan-live.ts) và kế
// hoạch tuần (plan.ts buildPlan). Cả 3 chỉ đo 1 tuần (khoảng 7 bài, gần 20 tương tác cả trang) nên gần như sản phẩm
// nào cũng "chưa đủ số liệu", và vẫn xếp "thắng" cho sản phẩm 2 bài 0 tương tác (bản học 18/10). Giờ:
//   - đo GỘP 4 tuần gần nhất (mergeProductWeeks),
//   - phải có tương tác hoặc đơn mới được xếp thắng; 0 tương tác và 0 đơn thì chỉ là "theo dõi",
//   - phải có ít nhất 2 sản phẩm đủ bài để so mới có "thắng" (4 tuần tới 25/10 chỉ lọc dầu đủ bài: 16 bài 9 tương
//     tác, thắng mặc định thì trọng số 3 dồn thêm vào đúng sản phẩm đang chiếm gần hết lịch).
// Thuần hàm, không mạng: npm run test:rank.

export const WEIGHT_BY_TIER = { winner: 3, watch: 2, weak: 1, insufficient: 1, manual: 1 };
export const MIN_POSTS_4W = 3;            // số bài tối thiểu trong 4 tuần để được xếp bậc
export const WEEKS_WINDOW = 4;
const NOT_PRODUCT = new Set(['Khác', 'Bài content']);

// Gộp byProduct của nhiều tuần (mỗi phần tử như WeekReport.byProduct) thành một danh sách: cộng dồn rồi tính lại
// trung bình theo tổng số bài.
export function mergeProductWeeks(weeks) {
  const acc = new Map();
  for (const week of weeks || []) {
    for (const p of week || []) {
      const g = acc.get(p.product) || { product: p.product, count: 0, totalScore: 0, totalEng: 0, totalViews: 0, conversions: 0 };
      g.count += Number(p.count) || 0;
      g.totalScore += Number(p.totalScore ?? (p.avgScore || 0) * (p.count || 0)) || 0;
      g.totalEng += Number(p.totalEng) || 0;
      g.totalViews += Number(p.totalViews) || 0;
      g.conversions += Number(p.conversions) || 0;
      acc.set(p.product, g);
    }
  }
  return [...acc.values()].map((g) => ({
    ...g,
    avgScore: g.count ? g.totalScore / g.count : 0,
    avgEng: g.count ? Math.round(g.totalEng / g.count) : 0,
    avgViews: g.count ? Math.round(g.totalViews / g.count) : 0,
  }));
}

// Xếp bậc: sản phẩm đủ bài sắp theo đơn trung bình, rồi điểm tổng hợp. Đỉnh 1/3 là thắng NẾU có tương tác hoặc đơn
// và có từ 2 sản phẩm đủ bài trở lên; đáy 1/3 chưa ra đơn là đuối; còn lại theo dõi. Dưới ngưỡng bài là chưa đủ số
// liệu. Trả mảng { product, count, totalEng, conversions, avgScore, avgEng, tier, weight }.
export function rankProducts(byProduct, { minPosts = MIN_POSTS_4W } = {}) {
  const pool = (byProduct || []).filter((p) => !NOT_PRODUCT.has(p.product));
  const avgConv = (p) => (p.count ? p.conversions / p.count : 0);
  const eligible = pool.filter((p) => p.count >= minPosts)
    .sort((a, b) => avgConv(b) - avgConv(a) || (b.avgScore || 0) - (a.avgScore || 0) || (b.avgEng || 0) - (a.avgEng || 0));
  const n = eligible.length;
  const topCut = n ? Math.max(1, Math.round(n / 3)) : 0;
  const botStart = n - Math.max(1, Math.round(n / 3));
  const hasSignal = (p) => (Number(p.totalEng) || 0) > 0 || (Number(p.conversions) || 0) > 0;
  const ranked = eligible.map((p, idx) => {
    let tier;
    if (n > 1 && idx < topCut && hasSignal(p)) tier = 'winner';
    else if (n > 1 && idx >= botStart && !p.conversions && idx >= topCut) tier = 'weak';
    else tier = 'watch';
    return { ...p, tier, weight: WEIGHT_BY_TIER[tier] };
  });
  const insufficient = pool.filter((p) => p.count < minPosts)
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ ...p, tier: 'insufficient', weight: WEIGHT_BY_TIER.insufficient }));
  return [...ranked, ...insufficient];
}
