// Biểu đồ cột ngang đơn giản (CSS thuần, theo theme). Dùng cho trang Đo lường.
type Item = { label: string; value: number; hint?: string };

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
  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      {items.length === 0 ? (
        <p className="muted">Chưa có dữ liệu.</p>
      ) : (
        <div className="chart-bars">
          {items.map((it, i) => (
            <div className="chart-row" key={it.label + i}>
              <div className="chart-lbl" title={it.label}>{it.label}</div>
              <div className="chart-track">
                <div
                  className={`chart-fill ${tone === 'ok' ? 'tone-ok' : 'tone-accent'}`}
                  style={{ width: `${Math.round((it.value / max) * 100)}%` }}
                />
              </div>
              <div className="chart-val">{it.value.toLocaleString('vi-VN')}{unit}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
