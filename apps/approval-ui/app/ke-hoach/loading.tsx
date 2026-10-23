// Khung chờ khi đổi tab Kế hoạch (23/10): layout giữ nguyên tiêu đề, chỉ phần thân nhấp nháy.
// Hiện sau 150ms như app/loading.tsx để tab nhanh không bị chớp.
export default function Loading() {
  return (
    <div className="kh-loading" aria-busy="true" aria-label="Đang tải">
      <div className="blk"><span className="kh-ld-bar" style={{ width: '45%' }} /></div>
      <div className="blk">
        <span className="kh-ld-bar" style={{ width: '25%', height: 18 }} />
        <span className="kh-ld-bar" style={{ width: '100%', height: 160, marginTop: 12 }} />
      </div>
    </div>
  );
}
