import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import { queueEngagementNow, uploadBrandAsset } from '../actions';
import { SubmitButton } from '../submit-button';
import PostListClient, { type PostMetrics } from '../post-list-client';
import MediaLibrary, { type MediaItem } from './media-library';
import { getAllChannels } from '../../lib/channels';
import { refreshStaleMetrics } from '../../lib/fb-metrics';

export const dynamic = 'force-dynamic';

// Bài tương tác dùng chung schema với tin tuyển dụng nhưng lọc theo loai='tuong_tac'.
type Post = {
  id: string; tieu_de: string; trang_thai: string; scheduled_at: string | null;
  posted_at: string | null; noi_dung: string | null; job_id: string | null;
  kenh: string | null; url: string | null; image_url: string | null;
  video_url: string | null;
  ghi_chu: string | null; fb_post_id: string | null; proof_path: string | null;
  loai: string | null; chu_de: string | null; created_at: string;
  metrics?: PostMetrics | null;
};

const THEME_LABEL: Record<string, string> = {
  doi_song: 'Đời sống công ty',
  nganh_bien: 'Ngành biển và thủy sản',
  hoi_dap: 'Hỏi đáp và mẹo nghề',
};

export default async function Page() {
  const client = getServerClient();

  const [postsRes, aqRes, mediaRes] = await Promise.all([
    client
      .from('hr_job_posts')
      .select('id, tieu_de, trang_thai, scheduled_at, posted_at, noi_dung, job_id, kenh, url, image_url, video_url, ghi_chu, fb_post_id, proof_path, loai, chu_de, created_at')
      .eq('loai', 'tuong_tac')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('approval_queue')
      .select('ref_id')
      .eq('kind', 'hr_job_post')
      .eq('status', 'approved'),
    client
      .from('brand_assets')
      .select('id, kind, title, storage_path, mime, size_bytes, public_url, created_at')
      .in('kind', ['image', 'video'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const missingPosts = ['PGRST205', '42P01', '42703'].includes(String(postsRes.error?.code || ''));
  const missingMedia = ['PGRST205', '42P01', '42703'].includes(String(mediaRes.error?.code || ''));
  const needMigration = missingPosts || missingMedia;

  const rawPosts = (postsRes.data || []) as Post[];
  const jobPostMap = new Map<string, string>();
  for (const p of rawPosts) {
    if (p.fb_post_id && p.trang_thai === 'posted') jobPostMap.set(p.fb_post_id, p.id);
  }
  const metricsMap = await refreshStaleMetrics(client, jobPostMap);
  const posts: Post[] = rawPosts.map((p) => ({
    ...p,
    metrics: p.fb_post_id ? metricsMap.get(p.fb_post_id) || null : null,
  }));
  const approvedPostIds = new Set((aqRes.data || []).map((r) => r.ref_id as string));
  const media = (mediaRes.data || []) as MediaItem[];

  const allChannels = await getAllChannels(client);
  const channelMeta = Object.fromEntries(
    allChannels.map((c) => [c.kenh, { ten: c.ten, post_url: c.post_url, field_hints: c.field_hints }])
  );

  const draftCount = posts.filter((p) => p.trang_thai === 'draft').length;
  const postedCount = posts.filter((p) => p.trang_thai === 'posted').length;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Bài tương tác</h1>
          <p className="sub">
            Bài hâm nóng trang trước khi đăng tin tuyển. Máy soạn nháp, người bấm Duyệt, worker đăng.
            Song song với tin tuyển dụng, dùng chung trần số bài mỗi ngày trên Facebook.
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </header>

      {needMigration ? (
        <div className="err" role="alert">
          Chưa bật đủ tính năng. Chạy migration <code>20260819600000_hr_job_posts_loai.sql</code> và{' '}
          <code>20260820000000_engagement_media.sql</code> trong Supabase rồi tải lại.
        </div>
      ) : null}

      {/* Trạng thái nhanh */}
      <div className="sys-status">
        <span className="sys-label">Bài tương tác:</span>
        <span className="sys-chip tone-default">
          <span className="sys-dot" />
          {posts.length} bài · {draftCount} nháp · {postedCount} đã đăng
        </span>
        <span className="sys-chip tone-default">
          <span className="sys-dot" />
          {media.length} media trong thư viện
        </span>
      </div>

      {/* Soạn bài tương tác mới */}
      <form action={queueEngagementNow} className="settings-box" style={{ marginTop: 16 }}>
        <b>Soạn bài tương tác mới</b>
        <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.85em' }}>
          Máy soạn nháp từ kho góc bài (Groq khi có khóa, lùi bản sẵn khi không), đẩy hàng đợi duyệt.
          Không đăng gì.
        </p>
        <div className="row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 6 }}>
            Số bài:
            <select className="note" name="count" defaultValue="1">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 6 }}>
            Chủ đề:
            <select className="note" name="theme" defaultValue="">
              <option value="">Xoay vòng cả ba</option>
              {Object.entries(THEME_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <SubmitButton label="Soạn bài" pendingLabel="Đang soạn..." />
        </div>
      </form>

      {/* Danh sách bài tương tác — tái dùng PostListClient của tuyển dụng */}
      <h2 style={{ marginTop: 24, fontSize: '1.05em' }}>Danh sách bài</h2>
      {posts.length === 0 && !needMigration ? (
        <p className="muted">Chưa có bài tương tác nào. Bấm &quot;Soạn bài&quot; ở trên để tạo bài đầu tiên.</p>
      ) : (
        <PostListClient posts={posts} approvedPostIds={[...approvedPostIds]} channelMeta={channelMeta} />
      )}

      {/* Thư viện media */}
      <h2 style={{ marginTop: 24, fontSize: '1.05em' }}>Thư viện media</h2>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.85em' }}>
        Ảnh và video công ty. Copy URL rồi dán vào ô &quot;Ảnh đính kèm&quot; hoặc &quot;Video đính kèm&quot;
        khi Sửa bài. Chỉ tải lên tư liệu công ty sở hữu (điều cấm 5).
      </p>

      <form action={uploadBrandAsset} className="settings-box" style={{ marginTop: 8 }} encType="multipart/form-data">
        <b>Tải media lên thư viện</b>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            className="note"
            type="text"
            name="title"
            placeholder="Tên gợi nhớ (tùy chọn)"
            aria-label="Tên"
            style={{ minWidth: 200 }}
          />
          <input
            type="file"
            name="file"
            accept="image/*,video/*"
            required
            style={{ fontSize: '0.85em' }}
          />
          <SubmitButton label="Tải lên" pendingLabel="Đang tải..." />
        </div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.78em' }}>
          Ảnh: JPG/PNG/WebP. Video: MP4 dưới ~1 GB, dưới 20 phút (giới hạn Facebook).
        </p>
      </form>

      <div style={{ marginTop: 12 }}>
        <MediaLibrary items={media} />
      </div>
    </main>
  );
}
