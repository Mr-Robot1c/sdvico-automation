// app/loading.tsx — KHUNG CHỜ khi chuyển trang (17/9, Thanh: "bấm chuyển đổi giữa các trang vẫn
// còn quá chậm"). Trước đây không có loading boundary: bấm menu là màn hình ĐỨNG IM cho tới khi
// máy chủ dựng xong cả trang (Vercel lạnh có thể 1-3 giây) — cảm giác web đơ. Giờ bấm phát là
// sang trang ngay với khung xám nhấp nháy, nội dung thật đổ vào sau.
// Khung chỉ hiện sau 150ms (animation-delay) để trang nhanh không bị chớp.
export default function Loading() {
  const bar = (w: string, h = 14) => (
    <span className="ld-bar" style={{ width: w, height: h }} />
  );
  return (
    <main aria-busy="true" aria-label="Đang tải trang">
      <style>{`
        .ld-wrap { opacity: 0; animation: ld-in .01s linear .15s forwards; display: grid; gap: 18px; }
        @keyframes ld-in { to { opacity: 1; } }
        .ld-bar { display: block; border-radius: 8px; background: var(--surface-2); position: relative; overflow: hidden; }
        .ld-bar::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ink) 7%, transparent), transparent);
          animation: ld-sh 1.2s infinite; }
        @keyframes ld-sh { to { transform: translateX(100%); } }
        .ld-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .ld-card { flex: 1 1 180px; border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: grid; gap: 10px; background: var(--surface); }
      `}</style>
      <div className="ld-wrap">
        {bar('220px', 26)}
        {bar('60%', 12)}
        <div className="ld-row">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ld-card">{bar('40%', 22)}{bar('80%', 10)}</div>
          ))}
        </div>
        <div className="ld-card" style={{ minHeight: 180 }}>{bar('30%', 16)}{bar('100%', 10)}{bar('92%', 10)}{bar('96%', 10)}{bar('60%', 10)}</div>
      </div>
    </main>
  );
}
