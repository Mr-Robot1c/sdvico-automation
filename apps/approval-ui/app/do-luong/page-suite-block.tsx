// Khối "Trang SDVICO VN — Business Suite": số CẤP TRANG (cửa sổ 28 ngày) do bộ quét trên máy
// chủ local ghi vào mkt_metrics (source 'facebook', entity '__page_real__', metrics.suite28 +
// followers). Dùng ở Đo lường ngày (so với lần quét trước) và Báo cáo tuần (so với tuần trước).
// User 28/8: "tự động hoá luôn phần đó, số liệu nhập vào đo lường ngày và báo cáo tuần".
type Suite = {
  views?: number | null; viewers?: number | null; visits?: number | null;
  interactions?: number | null; follows?: number | null; netFollows?: number | null;
};
export type PageScan = { suite28?: Suite; followers?: number | null; scannedAt?: string | null } | null;

function fmtN(n: number | null | undefined): string {
  return n == null ? '—' : Number(n).toLocaleString('vi-VN');
}
function fmtScanTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} · ${g('day')}/${g('month')}`;
}
function Delta({ cur, prev }: { cur: number | null | undefined; prev: number | null | undefined }) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (!d) return null;
  return (
    <span className={`sub ${d > 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: '.78rem', marginLeft: 4 }}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d).toLocaleString('vi-VN')}
    </span>
  );
}

export default function PageSuiteBlock({ cur, prev, compareLabel }: { cur: PageScan; prev?: PageScan; compareLabel: string }) {
  if (!cur || !cur.suite28) return null;
  const s = cur.suite28;
  const p = (prev && prev.suite28) || ({} as Suite);
  const items: Array<[string, number | null | undefined, number | null | undefined]> = [
    ['Lượt xem', s.views, p.views],
    ['Người xem', s.viewers, p.viewers],
    ['Ghé trang', s.visits, p.visits],
    ['Tương tác', s.interactions, p.interactions],
    ['Theo dõi mới', s.netFollows ?? s.follows, p.netFollows ?? p.follows],
  ];
  return (
    <section className="import-manual" style={{ marginBottom: 18 }}>
      <b>📈 Trang SDVICO VN — sức khoẻ 28 ngày gần nhất</b>
      <p className="sub" style={{ margin: '2px 0 8px' }}>
        Quét Business Suite lúc {fmtScanTime(cur.scannedAt)} từ máy chủ local · mũi tên là {compareLabel}.
      </p>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {items.map(([label, v, pv]) => (
          <div key={label}>
            <span className="sub" style={{ fontSize: '.8rem' }}>{label}</span>{' '}
            <b style={{ fontSize: '1.05rem' }}>{fmtN(v)}</b>
            <Delta cur={v ?? null} prev={pv ?? null} />
          </div>
        ))}
        {cur.followers != null ? (
          <div>
            <span className="sub" style={{ fontSize: '.8rem' }}>Người theo dõi</span>{' '}
            <b style={{ fontSize: '1.05rem' }}>{fmtN(cur.followers)}</b>
            <Delta cur={cur.followers} prev={prev?.followers ?? null} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
