import { getServerClient } from '../../lib/supabase-server';
import SanXuatForm from './form';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Asset = { id: string; kind: string; title: string; storage_path: string };

// Trang xưởng sản xuất: chọn 1 ảnh + 1 video (từ kho hoặc tải mới), gõ tiêu đề, bấm Sinh text để
// máy viết theo tiêu đề/ảnh, sửa lại rồi Xong để đẩy vào hàng đợi duyệt.
// Máy soạn, người bấm — nút Xong chỉ tạo khung sườn (mkt_content + approval_queue), KHÔNG tự đăng.
export default async function Page() {
  const client = getServerClient();
  const { data: assetRows } = await client
    .from('brand_assets')
    .select('id, kind, title, storage_path')
    .in('kind', ['image', 'video', 'logo', 'clip'])
    .order('created_at', { ascending: false })
    .limit(40);

  const assets = (assetRows || []) as Asset[];
  const images = assets.filter((a) => a.kind === 'image' || a.kind === 'logo');
  const videos = assets.filter((a) => a.kind === 'video' || a.kind === 'clip');
  const urlOf = (p: string) => client.storage.from('brand-assets').getPublicUrl(p).data.publicUrl;
  const withUrl = <T extends { storage_path: string }>(a: T) => ({ ...a, url: urlOf(a.storage_path) });

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Xưởng sản xuất — Hôm nay</h1>
          <p className="sub">
            Gắn 1 ảnh và 1 video, gõ tiêu đề, bấm Sinh text, sửa lại rồi Xong để đẩy vào hàng đợi duyệt.
            Máy soạn, người bấm gửi — nội dung ở đây chưa lên trang, phải qua duyệt trước.
          </p>
        </div>
      </header>

      <div className="pipeline">
        <span className="pipe-step">1. Gắn ảnh và video</span>
        <span className="pipe-step">2. Gõ tiêu đề</span>
        <span className="pipe-step">3. Sinh text bằng AI</span>
        <span className="pipe-step">4. Sửa nội dung</span>
        <span className="pipe-step">5. Xong — đẩy hàng đợi duyệt</span>
        <span className="pipe-step">6. Người bấm Duyệt mới đăng</span>
      </div>

      <SanXuatForm images={images.map(withUrl)} videos={videos.map(withUrl)} />
    </main>
  );
}
