// Biểu đồ CỘT DỌC đơn giản (CSS thuần, theo theme). Dùng cho trang Đo lường.
// Mỗi cột một màu phân loại (slot 1..8, màu đã kiểm định dataviz) để phân biệt sản phẩm.
// Số hiện trên đỉnh cột, tên dưới chân cột. Nhãn + số luôn hiện nên không phụ thuộc mỗi màu.
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
        <div className="colchart">
          {items.map((it, i) => {
            const cls = it.color && it.color > 0 ? `cat-${it.color}` : fallback;
            const valText = `${it.value.toLocaleString('vi-VN')}${unit}`;
            const h = Math.max(4, Math.round((it.value / max) * 150));
            return (
              <div className="col" key={it.label + i} title={`${it.label}: ${valText}`}>
                <div className="col-plot">
                  <div className="col-val">{valText}</div>
                  <div className={`col-bar ${cls}`} style={{ height: `${h}px` }} />
                </div>
                <div className="col-lbl">{it.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
