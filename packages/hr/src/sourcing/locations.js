// Bản đồ địa điểm gần, để ưu tiên nơi làm việc quanh HCM và Vũng Tàu.
// Việc làm ở HCM hoặc Vũng Tàu nên ưu tiên ứng viên ở đó và các tỉnh lân cận.

// Tên chuẩn và các cách viết hay gặp.
const CANON = [
  { key: 'Hồ Chí Minh', aliases: ['ho chi minh', 'hcm', 'tphcm', 'tp hcm', 'sai gon', 'saigon', 'thanh pho ho chi minh'] },
  { key: 'Vũng Tàu', aliases: ['vung tau', 'ba ria', 'ba ria - vung tau', 'ba ria vung tau', 'brvt'] },
  { key: 'Bình Dương', aliases: ['binh duong', 'thu dau mot'] },
  { key: 'Đồng Nai', aliases: ['dong nai', 'bien hoa'] },
  { key: 'Long An', aliases: ['long an'] }
];

// Tỉnh lân cận theo từng nơi chính. Dùng để xếp ưu tiên gần.
const NEARBY = {
  'Hồ Chí Minh': ['Bình Dương', 'Đồng Nai', 'Long An', 'Vũng Tàu'],
  'Vũng Tàu': ['Đồng Nai', 'Hồ Chí Minh', 'Bình Dương']
};

function strip(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

// Đưa một tên địa điểm về tên chuẩn. Không nhận ra thì trả lại nguyên văn đã cắt khoảng trắng.
export function normalizeLocation(raw) {
  const s = strip(raw);
  if (!s) return null;
  for (const c of CANON) {
    if (strip(c.key) === s) return c.key;
    if (c.aliases.some((a) => s === strip(a) || s.includes(strip(a)))) return c.key;
  }
  return raw.trim();
}

// Từ các nơi chính trong JD, dựng danh sách ưu tiên: nơi chính trước, lân cận sau.
// Trả [{ dia_diem, uu_tien }] với uu_tien 1 là nơi chính, 2 là lân cận.
export function prioritizeLocations(bases) {
  const norm = [...new Set((bases || []).map(normalizeLocation).filter(Boolean))];
  const out = [];
  const seen = new Set();
  for (const b of norm) {
    if (!seen.has(b)) { out.push({ dia_diem: b, uu_tien: 1 }); seen.add(b); }
  }
  for (const b of norm) {
    for (const n of NEARBY[b] || []) {
      if (!seen.has(n)) { out.push({ dia_diem: n, uu_tien: 2 }); seen.add(n); }
    }
  }
  return out;
}
