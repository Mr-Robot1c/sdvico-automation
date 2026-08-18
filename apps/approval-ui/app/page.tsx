import { getServerClient } from '../lib/supabase-server';
import AutoRefresh from './auto-refresh';
import DecideActions from './decide-actions';
import ViewModal from './view-modal';
import { editDraft } from './actions';
import { kindMeta, formatRelative, payloadRows, intentLabel, channelsLabel, purposeLabel, riskMeta, COMPLIANCE_LABELS } from './labels';

// Luôn lấy dữ liệu mới, không dùng bản lưu tạm.
// (Hàng đợi duyệt hiện ảnh/video đã gắn từ payload.assets — build 2026-08-12.)
export const dynamic = 'force-dynamic';
// Sinh nội dung gọi Gemini, cho phép chạy tới 60 giây.
export const maxDuration = 60;

type Item = {
  id: string;
  kind: string;
  title: string;
  payload: unknown;
  created_at: string;
};

// Cờ đỏ: chạm quy định nhà nước, cần cấp quản lý duyệt trước (Điều cấm 3).
function isRedFlag(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.risk === 'red' || p.needs_manager_approval === true;
}

// Lấy content_id từ payload (bài marketing) để nạp bản nháp cho nút Chỉnh sửa.
function contentIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  return typeof p.content_id === 'string' ? p.content_id : null;
}

// Lấy id ảnh/video đã gắn từ payload.assets để resolve ra link xem được.
function assetIdsOf(payload: unknown): { image?: string; video?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const a = (payload as Record<string, any>).assets;
  if (!a || typeof a !== 'object') return {};
  return {
    image: typeof a.image === 'string' ? a.image : undefined,
    video: typeof a.video === 'string' ? a.video : undefined
  };
}

// Trích thông tin bài marketing từ payload để hiển thị gọn gàng.
function mktInfo(payload: unknown) {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>;
  const compliance = (p.compliance || {}) as Record<string, string[]>;
  const flags = Object.entries(COMPLIANCE_LABELS)
    .map(([k, label]) => ({ label, items: Array.isArray(compliance[k]) ? compliance[k] : [] }))
    .filter((f) => f.items.length > 0);
  return {
    format: p.format as string | undefined,
    intent: p.intent as string | undefined,
    risk: p.risk as string | undefined,
    authored: p.authored as string | undefined,
    keyword: p.keyword as string | undefined,
    landingUrl: p.landing_url as string | undefined,
    channels: Array.isArray(p.channels) ? (p.channels as string[]) : [],
    postKind: p.post_kind as string | undefined,
    // Cặp bài thử A/B theo hướng đi kế hoạch (rotate v3). Hiển thị badge kín đáo thay vì
    // prefix 🎯A/🎯B lộ trong tiêu đề (user: "để title A/B như vậy thì kì lắm").
    abVariant: (p.ab_variant as string | undefined) || undefined,
    fromPlan: p.from_plan_direction === true,
    flags
  };
}

// Bỏ MỌI nhãn nội bộ khỏi tiêu đề card: prefix A/B cũ (🎯A / ⚡A Shorts) và tag kênh trong
// ngoặc ([Facebook], [FB 16:9 + TikTok dọc], [Video]...) — kể cả nhiều tag liền nhau. Kênh
// đã có badge riêng; tiêu đề chỉ còn tên bài (user 18/8: "lỡ đăng lên nó kèm theo thì sao").
function stripInternalPrefix(t: string): string {
  return String(t || '')
    .replace(/^\s*(🎯[AB]?\s*|⚡[AB]?\s*Shorts\s*)/u, '')
    .replace(/^(\s*\[[^\]]+\]\s*)+/u, '')
    .trim();
}

export default async function Page({ searchParams }: { searchParams: { kind?: string } }) {
  const client = getServerClient();
  const { data, error } = await client
    .from('approval_queue')
    .select('id, kind, title, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const raw = (data || []) as Item[];
  // Bản deploy marketing-only chỉ hiện mục marketing (kind bắt đầu bằng 'mkt'), ẩn HR và demo.
  const marketingOnly = process.env.MARKETING_ONLY === 'true' || process.env.MARKETING_ONLY === '1';
  const all = marketingOnly ? raw.filter((it) => it.kind.startsWith('mkt')) : raw;

  // Đếm theo loại để dựng thanh lọc.
  const counts = new Map<string, number>();
  for (const it of all) counts.set(it.kind, (counts.get(it.kind) || 0) + 1);

  const selected = searchParams?.kind || null;
  const filtered = selected ? all.filter((it) => it.kind === selected) : all;
  // Cờ đỏ (chạm quy định, cần cấp quản lý) xếp lên đầu. Sort ổn định nên phần còn lại giữ thứ tự cũ.
  const items = [...filtered].sort((a, b) => Number(isRedFlag(b.payload)) - Number(isRedFlag(a.payload)));
  const redCount = filtered.filter((it) => isRedFlag(it.payload)).length;

  // Nạp bản nháp cho các bài marketing, để nút Chỉnh sửa preload đúng nội dung.
  // Kèm cờ brief.video_requested: bài đã yêu cầu dây chuyền video AI dựng (cron GitHub 10 phút
  // quét, mỗi bản ~15-20 phút) -> card hiện "🎬 Đang làm video AI" để người duyệt biết là đang
  // chờ, không phải quên (user 18/8: "đợi 15 phút chưa thấy video"). Dựng xong cờ tự tắt.
  const contentIds = items.map((it) => contentIdOf(it.payload)).filter((x): x is string => !!x);
  const drafts = new Map<string, string>();
  const videoPending = new Set<string>();
  // Video Shorts ĐI KÈM bài chữ: bài video-pipeline có brief.source_content = id bài chữ. Card bài
  // chữ hiện thumbnail video + dòng nối để người duyệt không tưởng "chưa có video" (user 18/8).
  // Ngược lại card video hiện tên bài chữ nguồn. Hai bài vẫn duyệt/đăng RIÊNG (video còn đi TikTok).
  const linkedVideo = new Map<string, { contentId: string; videoAssetId: string | null; title: string; queueStatus: string }>();
  const videoSourceTitle = new Map<string, string>(); // contentId video -> tiêu đề bài chữ nguồn
  if (contentIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, draft, brief').in('id', contentIds);
    for (const c of cs || []) {
      drafts.set(c.id as string, (c.draft as string) || '');
      if ((c as any).brief?.video_requested === true) videoPending.add(c.id as string);
    }
    // Bài video-pipeline sinh từ các bài chữ đang trong hàng đợi (bất kỳ trạng thái duyệt).
    const { data: vids } = await client
      .from('mkt_content')
      .select('id, title, brief')
      .eq('brief->>generator', 'video-pipeline')
      .in('brief->>source_content', contentIds);
    const vidIds = (vids || []).map((v: any) => v.id as string);
    const vidQueueStatus = new Map<string, string>();
    if (vidIds.length) {
      const { data: vq } = await client
        .from('approval_queue')
        .select('payload, status')
        .eq('kind', 'mkt_publish_content')
        .in('payload->>content_id', vidIds);
      for (const q of vq || []) vidQueueStatus.set(String((q as any).payload?.content_id || ''), String((q as any).status || ''));
    }
    for (const v of vids || []) {
      const src = String((v as any).brief?.source_content || '');
      const vAsset = ((v as any).brief?.assets?.video_h || (v as any).brief?.assets?.video || null) as string | null;
      linkedVideo.set(src, {
        contentId: (v as any).id as string,
        videoAssetId: vAsset,
        title: ((v as any).title as string) || '',
        queueStatus: vidQueueStatus.get((v as any).id as string) || 'pending',
      });
    }
    // Chiều ngược: card video -> tên bài chữ nguồn.
    const srcIds = (vids || []).map((v: any) => String(v.brief?.source_content || '')).filter(Boolean);
    if (srcIds.length) {
      const { data: srcRows } = await client.from('mkt_content').select('id, title').in('id', srcIds);
      const srcTitle = new Map((srcRows || []).map((r: any) => [r.id as string, (r.title as string) || '']));
      for (const v of vids || []) videoSourceTitle.set((v as any).id as string, srcTitle.get(String((v as any).brief?.source_content || '')) || '');
    }
  }

  // Nạp ảnh/video đã gắn: đổi id trong brand_assets ra link công khai để hiện trong modal và trên card.
  const assetIds = new Set<string>();
  for (const it of items) {
    const a = assetIdsOf(it.payload);
    if (a.image) assetIds.add(a.image);
    if (a.video) assetIds.add(a.video);
  }
  for (const lv of linkedVideo.values()) if (lv.videoAssetId) assetIds.add(lv.videoAssetId);
  const assetUrl = new Map<string, { url: string; kind: string; title: string }>();
  if (assetIds.size) {
    const { data: as } = await client
      .from('brand_assets')
      .select('id, storage_path, kind, title')
      .in('id', [...assetIds]);
    for (const a of as || []) {
      const url = client.storage.from('brand-assets').getPublicUrl(a.storage_path as string).data.publicUrl;
      assetUrl.set(a.id as string, { url, kind: (a.kind as string) || '', title: (a.title as string) || '' });
    }
  }

  // Số liệu tổng quan cho thẻ thống kê trên cùng (đã bỏ thẻ "Từ khóa trong kho" vì kho từ
  // khóa không còn dùng ở luồng sản xuất hiện tại).
  const { count: postCount } = await client
    .from('mkt_posts').select('*', { count: 'exact', head: true }).eq('status', 'published');

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Hàng đợi duyệt</h1>
          <p className="sub">Máy soạn, người bấm. Xem từng mục rồi Duyệt hoặc Từ chối.</p>
        </div>
        <div className="head-actions">
          <AutoRefresh seconds={30} />
        </div>
      </header>

      <div className="statgrid">
        <div className="statcard">
          <span className="statcard-icon" aria-hidden="true">📥</span>
          <div className="statcard-body">
            <span className="statcard-label">Bài chờ duyệt</span>
            <span className="statcard-num">{all.length}</span>
          </div>
        </div>
        <div className="statcard red">
          <span className="statcard-icon" aria-hidden="true">🚩</span>
          <div className="statcard-body">
            <span className="statcard-label">Cần xem xét hoặc ưu tiên</span>
            <span className="statcard-num">{redCount}</span>
          </div>
        </div>
        <div className="statcard">
          <span className="statcard-icon" aria-hidden="true">🌐</span>
          <div className="statcard-body">
            <span className="statcard-label">Bài đã đăng</span>
            <span className="statcard-num">{postCount ?? 0}</span>
          </div>
        </div>
      </div>

      {error ? (
        <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p>
      ) : null}

      {!error && redCount > 0 ? (
        <p className="err" role="status">
          {redCount} mục cần xem xét hoặc ưu tiên (chạm quy định nhà nước). Đã xếp lên đầu.
        </p>
      ) : null}

      {!error && all.length > 0 ? (
        <nav className="filters" aria-label="Lọc theo loại">
          <a className={`chip ${selected ? '' : 'on'}`} href="/">
            Tất cả <span className="n">{all.length}</span>
          </a>
          {[...counts.entries()].map(([kind, n]) => {
            const meta = kindMeta(kind);
            return (
              <a
                key={kind}
                className={`chip ${selected === kind ? 'on' : ''}`}
                href={`/?kind=${encodeURIComponent(kind)}`}
              >
                <span aria-hidden="true">{meta.icon}</span> {meta.label} <span className="n">{n}</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      {!error && all.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">✓</div>
          <p>Không có mục nào chờ duyệt.</p>
          <p className="sub">Khi máy soạn nội dung mới, mục sẽ hiện ở đây.</p>
        </div>
      ) : null}

      <ul className="list">
        {items.map((item) => {
          const meta = kindMeta(item.kind);
          const cid = contentIdOf(item.payload);
          const draft = cid ? drafts.get(cid) : undefined;

          // Thẻ bài marketing: card gọn, chi tiết mở qua nút mắt.
          if (item.kind === 'mkt_publish_content') {
            const info = mktInfo(item.payload);
            const rk = riskMeta(info.risk);
            const cleanTitle = stripInternalPrefix(item.title);
            const ids = assetIdsOf(item.payload);
            const img = ids.image ? assetUrl.get(ids.image) : undefined;
            const vid = ids.video ? assetUrl.get(ids.video) : undefined;
            return (
              <li key={item.id} className="card tone-mkt">
                <div className="head">
                  <span className="kind"><span aria-hidden="true">{meta.icon}</span> {meta.label}</span>
                  <time className="time" dateTime={item.created_at}>{formatRelative(item.created_at)}</time>
                </div>

                <div className="title">{cleanTitle}</div>

                <div className="badges">
                  {info.authored === 'human'
                    ? <span className="badge tone-no" title="Bài do người tự soạn">🚩 Người viết</span>
                    : <span className="badge" title="Bài do máy tự sinh, chờ người duyệt">🤖 Máy viết</span>}
                  <span className="badge badge-format" title="Nơi bài sẽ được đăng">📍 {channelsLabel(info.channels)}</span>
                  {purposeLabel(info.postKind, info.format)
                    ? <span className="badge" title="Bài bán sản phẩm hay bài nội dung nuôi trang">{purposeLabel(info.postKind, info.format)}</span>
                    : (info.intent ? <span className="badge">{intentLabel(info.intent)}</span> : null)}
                  {info.abVariant
                    ? <span className="badge badge-ab" title="Cặp bài thử theo hướng đi kế hoạch. Đăng cả hai, bot đo bản nào bà con thích hơn rồi học cho vòng sau.">🧪 Thử {info.abVariant}</span>
                    : (info.fromPlan ? <span className="badge badge-ab" title="Bài theo hướng đi của kế hoạch tuần">🧭 Theo kế hoạch</span> : null)}
                  {cid && videoPending.has(cid)
                    ? <span className="badge badge-video-pending" title="Dây chuyền video AI đang dựng bản Shorts từ bài này (10 tới 40 phút tuỳ hàng chờ máy). Xong sẽ có thêm một bài video riêng ở hàng đợi để duyệt. Bài chữ này vẫn duyệt đăng bình thường.">🎬 Đang làm video AI</span>
                    : null}
                  {cid && linkedVideo.has(cid)
                    ? <span className="badge badge-video-linked" title="Video Shorts dựng từ bài này đã xong và là một bài riêng trong hàng đợi (đăng cả Facebook lẫn TikTok). Duyệt bài chữ này và bài video riêng.">🎬 Có video Shorts đi kèm</span>
                    : null}
                  {info.postKind === 'video' && cid && videoSourceTitle.get(cid)
                    ? <span className="badge badge-video-linked" title="Video này dựng từ bài chữ bên dưới. Bài chữ và video duyệt riêng.">🔗 Video của bài: {videoSourceTitle.get(cid)}</span>
                    : null}
                  <span className={`badge tone-${rk.tone}`}>{rk.label}</span>
                </div>

                {img || vid || (cid && linkedVideo.get(cid)?.videoAssetId) ? (
                  <div className="card-media">
                    {img ? <img src={img.url} alt={img.title || 'Ảnh bài viết'} loading="lazy" /> : null}
                    {vid ? (
                      <span className="card-media-vid">
                        <video src={vid.url} muted preload="metadata" />
                        <span className="card-media-badge" aria-hidden="true">▶</span>
                      </span>
                    ) : null}
                    {/* Thumbnail video Shorts đi kèm (bài riêng) — hiện cạnh ảnh để thấy đủ bộ. */}
                    {!vid && cid && linkedVideo.get(cid)?.videoAssetId && assetUrl.get(linkedVideo.get(cid)!.videoAssetId!) ? (
                      <span className="card-media-vid card-media-linked" title={`Video Shorts đi kèm: ${linkedVideo.get(cid)!.title} (bài riêng, ${linkedVideo.get(cid)!.queueStatus === 'pending' ? 'đang chờ duyệt' : linkedVideo.get(cid)!.queueStatus === 'approved' ? 'đã duyệt' : linkedVideo.get(cid)!.queueStatus})`}>
                        <video src={assetUrl.get(linkedVideo.get(cid)!.videoAssetId!)!.url} muted preload="metadata" />
                        <span className="card-media-badge" aria-hidden="true">▶</span>
                        <span className="card-media-linked-tag">Shorts đi kèm</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {cid && linkedVideo.has(cid) ? (
                  <p className="sub linked-note">
                    🎬 Video Shorts của bài này: <b>{linkedVideo.get(cid)!.title}</b> — là một bài riêng {linkedVideo.get(cid)!.queueStatus === 'pending' ? 'đang chờ duyệt trong danh sách này' : linkedVideo.get(cid)!.queueStatus === 'approved' ? 'đã được duyệt' : `(${linkedVideo.get(cid)!.queueStatus})`}. Bài chữ và video duyệt riêng, video đăng cả Facebook lẫn TikTok.
                  </p>
                ) : null}

                <div className="card-actions">
                  <ViewModal title={cleanTitle} label="Xem bài viết">
                    {info.flags.length ? (
                      <div className="flagline">
                        {info.flags.map((f) => (
                          <span className="flagchip" key={f.label}>{f.label}: {f.items.join(', ')}</span>
                        ))}
                      </div>
                    ) : null}
                    {info.landingUrl ? <div className="metaline">Trang đích: {info.landingUrl}</div> : null}
                    {draft ? <div className="draftbox">{draft}</div> : <p className="muted">Chưa có bản nháp.</p>}
                    {cid && draft !== undefined ? (
                      <details className="raw editbox">
                        <summary>Chỉnh sửa bản nháp</summary>
                        <form action={editDraft} className="editform">
                          <input type="hidden" name="content_id" value={cid} />
                          <textarea name="draft" defaultValue={draft} rows={10} aria-label="Bản nháp" />
                          <button className="btn ok" type="submit">Lưu chỉnh sửa</button>
                        </form>
                      </details>
                    ) : null}
                    {img || vid ? (
                      <div className="modal-media">
                        {img ? <img src={img.url} alt={img.title || 'Ảnh bài viết'} /> : null}
                        {vid ? <video src={vid.url} controls preload="metadata" /> : null}
                      </div>
                    ) : null}
                  </ViewModal>
                  <DecideActions id={item.id} title={cleanTitle} />
                </div>
              </li>
            );
          }

          // Thẻ chung cho các loại việc khác.
          const rows = payloadRows(item.payload);
          const hasDetail = rows.length > 0 || isRedFlag(item.payload);
          return (
            <li key={item.id} className={`card tone-${meta.tone}`}>
              <div className="head">
                <span className="kind">
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </span>
                <time className="time" dateTime={item.created_at}>{formatRelative(item.created_at)}</time>
              </div>

              <div className="title">{item.title}</div>

              {isRedFlag(item.payload) ? (
                <div className="stages">
                  <span className="stage tone-no">Cần xem xét hoặc ưu tiên</span>
                </div>
              ) : null}

              <div className="card-actions">
                {hasDetail ? (
                  <ViewModal title={item.title} label="Xem chi tiết">
                    {rows.length > 0 ? (
                      <dl className="fields">
                        {rows.map((r) => (
                          <div className={`field ${r.long ? 'field-long' : ''}`} key={r.key}>
                            <dt>{r.label}</dt>
                            <dd>{r.long ? <pre>{r.value}</pre> : r.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="muted">Không có dữ liệu chi tiết.</p>
                    )}
                  </ViewModal>
                ) : null}
                <DecideActions id={item.id} title={item.title} />
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
