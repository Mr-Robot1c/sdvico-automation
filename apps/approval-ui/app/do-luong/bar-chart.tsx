// Biểu đồ cột ngang đơn giản (CSS thuần, theo theme). Dùng cho trang Đo lường.
// Mỗi cột một màu phân loại (slot 1..8, màu đã kiểm định dataviz) để phân biệt sản phẩm.
// Nhãn tên và số luôn hiện nên màu chỉ là phụ trợ, không phụ thuộc mỗi màu (an toàn mù màu).
type Item = { label: string; value: number; hint?: string; color?: number };

export default function BarChart({
  title,
  items,
  unit = '',
  tone = 'accent',
}: {
  title: string;
  items: Item[];
  unit?: string;
  tone?: 'accent' | 'ok';
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const fallback = tone === 'ok' ? 'tone-ok' : 'tone-accent';
  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      {items.length === 0 ? (
        <p className="muted">Chưa có dữ liệu.</p>
      ) : (
        <div className="chart-bars">
          {items.map((it, i) => {
            const cls = it.color && it.color > 0 ? `cat-${it.color}` : fallback;
            const valText = `${it.value.toLocaleString('vi-VN')}${unit}`;
            return (
              <div className="chart-row" key={it.label + i} title={`${it.label}: ${valText}`}>
                <div className="chart-lbl" title={it.label}>{it.label}</div>
                <div className="chart-track">
                  <div
                    className={`chart-fill ${cls}`}
                    style={{ width: `${Math.round((it.value / max) * 100)}%` }}
                  />
                </div>
                <div className="chart-val">{valText}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
