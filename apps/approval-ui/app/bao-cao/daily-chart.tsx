// Biểu đồ đường 30 ngày. Vẽ bằng SVG thủ công, không kéo thư viện.
// Hai chuỗi: CV nạp (xanh) và bài đăng (vàng). Trục dọc tự co theo giá trị lớn nhất.

const WIDTH = 800;
const HEIGHT = 220;
const PAD = { top: 14, right: 12, bottom: 26, left: 32 };

function points(data: number[], w: number, h: number, max: number): string {
  if (!data.length) return '';
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  return data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - (max > 0 ? (v / max) * h : 0)).toFixed(1)}`)
    .join(' ');
}

export default function DailyChart({ cv, posts }: { cv: number[]; posts: number[] }) {
  const max = Math.max(1, ...cv, ...posts);
  const w = WIDTH - PAD.left - PAD.right;
  const h = HEIGHT - PAD.top - PAD.bottom;

  // Nhãn trục dọc: 0, giữa, max.
  const ticks = [0, Math.round(max / 2), max];

  // Nhãn trục ngang: hôm nay ở phải, 30 ngày trước ở trái, thêm mốc giữa.
  const today = new Date();
  const label = (daysAgo: number): string => {
    const d = new Date(today); d.setDate(d.getDate() - daysAgo);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', maxWidth: WIDTH, height: 'auto', display: 'block' }} role="img" aria-label="Biểu đồ CV và bài đăng theo ngày">
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Lưới ngang mờ */}
          {ticks.map((t, i) => {
            const y = h - (max > 0 ? (t / max) * h : 0);
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={w} y2={y} stroke="var(--line)" strokeWidth={1} />
                <text x={-8} y={y + 4} fontSize={11} textAnchor="end" fill="var(--ink-2)">{t}</text>
              </g>
            );
          })}

          {/* Nhãn ngày */}
          {[29, 22, 15, 7, 0].map((d, i) => {
            const x = ((29 - d) / 29) * w;
            return (
              <text key={i} x={x} y={h + 16} fontSize={11} textAnchor="middle" fill="var(--ink-2)">
                {label(d)}
              </text>
            );
          })}

          {/* Đường CV nạp */}
          <polyline points={points(cv, w, h, max)} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {/* Đường bài đăng */}
          <polyline points={points(posts, w, h, max)} fill="none" stroke="#c48a00" strokeWidth={2} strokeDasharray="4 3" />
        </g>
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.85em' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 3, background: 'var(--accent)', display: 'inline-block' }} />
          CV nạp
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 3, background: '#c48a00', display: 'inline-block' }} />
          Bài đăng thành công
        </span>
      </div>
    </div>
  );
}
