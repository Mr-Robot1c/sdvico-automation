// facts.mjs — nạp nguồn dữ kiện sản phẩm từ bảng product_facts (DB).
// Nếu bảng trống hoặc lỗi, lùi về danh sách trong product-facts.mjs (code) để không kẹt.
// Dùng chung knownFactValues và testFactValues của product-facts.mjs (chúng nhận mảng facts).

import { PRODUCT_FACTS } from './product-facts.mjs';

export async function loadFacts(client) {
  const { data, error } = await client
    .from('product_facts')
    .select('category, brand, model, attribute, value, verified');
  if (error || !data || data.length === 0) return PRODUCT_FACTS;
  return data;
}
