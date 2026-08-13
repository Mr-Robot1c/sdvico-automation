'use server';

// Bật đăng Facebook khi Duyệt: đã cấu hình FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN (2026-08-12).
import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';

// Đăng một bài marketing đã duyệt lên Facebook Page qua Graph API. CHỈ đăng nội dung SDVICO
// lên Page của SDVICO (API chính thức). Máy soạn, người bấm Duyệt (điều cấm 1) — hàm này chạy
// SAU khi người đã bấm Duyệt. Chưa cấu hình token thì bỏ qua, không lỗi.
async function publishContentToFacebook(
  client: ReturnType<typeof getServerClient>,
  contentId: string
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!PAGE_ID || !TOKEN) return { ok: false, error: 'chưa cấu hình Facebook token' };

  // Không đăng lại bài đã đăng thành công.
  const { data: posted } = await client
    .from('mkt_posts')
    .select('id')
    .eq('channel', 'facebook')
    .eq('content_id', contentId)
    .eq('status', 'published')
    .limit(1);
  if (posted && posted.length) return { ok: true, url: undefined };

  const { data: c } = await client
    .from('mkt_content')
    .select('id, title, draft, brief')
    .eq('id', contentId)
    .single();
  if (!c) return { ok: false, error: 'không tìm thấy nội dung' };
  const message = [(c as any).title, '', (c as any).draft || ''].join('\n').trim();

  let imageUrl: string | null = null;
  const imgAssetId = (c as any).brief?.assets?.image;
  if (imgAssetId) {
    const { data: a } = await client.from('brand_assets').select('storage_path').eq('id', imgAssetId).single();
    const sp = (a as { storage_path?: string } | null)?.storage_path;
    if (sp) imageUrl = client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
  }

  try {
    const endpoint = imageUrl
      ? `https://graph.facebook.com/${VERSION}/${PAGE_ID}/photos`
      : `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
    const body = imageUrl
      ? new URLSearchParams({ url: imageUrl, caption: message, access_token: TOKEN })
      : new URLSearchParams({ message, access_token: TOKEN });
    const res = await fetch(endpoint, { method: 'POST', body });
    const json: any = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
    const postId = json.post_id || json.id;
    const externalUrl = `https://www.facebook.com/${postId}`;
    await client.from('mkt_posts').insert({
      content_id: contentId,
      channel: 'facebook',
      status: 'published',
      external_url: externalUrl,
      published_at: new Date().toISOString()
    });
    await client.from('mkt_content').update({ status: 'published' }).eq('id', contentId);
    return { ok: true, url: externalUrl };
  } catch (e: any) {
    await client.from('mkt_posts').insert({ content_id: contentId, channel: 'facebook', status: 'failed' });
    return { ok: false, error: String(e?.message || e) };
  }
}

// Người quyết. Đọc từ form, cập nhật trạng thái, chỉ đổi mục còn pending.
// Duyệt bài marketing thì đăng NGAY lên Facebook (nếu đã cấu hình token).
export async function decideForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  const note = String(formData.get('note') || '');

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!id || !decision) return;

  const client = getServerClient();
  // Lấy loại + payload để biết có phải bài marketing không.
  const { data: row } = await client.from('approval_queue').select('kind, payload').eq('id', id).single();
  const { data: updated, error } = await client
    .from('approval_queue')
    .update({ status: decision, decided_at: new Date().toISOString(), note: note || null })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(error.message);

  // Chỉ đăng khi vừa chuyển pending -> approved lần đầu, và đúng là bài marketing.
  const justApproved = decision === 'approved' && (updated?.length || 0) > 0;
  if (justApproved && (row as any)?.kind === 'mkt_publish_content') {
    const contentId = (row as any)?.payload?.content_id as string | undefined;
    if (contentId) await publishContentToFacebook(client, contentId);
  }

  revalidatePath('/');
  revalidatePath('/noi-dung');
  revalidatePath('/da-dang');
}

// Thêm một từ khóa vào kho.
export async function addKeyword(formData: FormData) {
  const keyword = String(formData.get('keyword') || '').trim();
  const intent = String(formData.get('intent') || '').trim();
  const landing_url = String(formData.get('landing_url') || '').trim() || null;
  const source = String(formData.get('source') || '').trim() || null;
  if (!keyword) return;

  const client = getServerClient();
  const { error } = await client.from('mkt_keywords').insert({ keyword, intent: intent || null, landing_url, source });
  if (error) throw new Error(error.message);
  revalidatePath('/tu-khoa');
}

// Xóa một từ khóa.
export async function deleteKeyword(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_keywords').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/tu-khoa');
}

// Thêm một dòng dữ kiện sản phẩm (Phòng Kinh doanh nhập số thật).
export async function addFact(formData: FormData) {
  const attribute = String(formData.get('attribute') || '').trim();
  const value = String(formData.get('value') || '').trim();
  if (!attribute || !value) return;
  const row = {
    category: String(formData.get('category') || '').trim() || null,
    brand: String(formData.get('brand') || '').trim() || null,
    model: String(formData.get('model') || '').trim() || null,
    attribute,
    value,
    source: String(formData.get('source') || '').trim() || null,
    confirmed_by: String(formData.get('confirmed_by') || '').trim() || null,
    verified: formData.get('verified') === 'on'
  };
  const client = getServerClient();
  const { error } = await client.from('product_facts').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/du-kien');
}

// Xóa một dòng dữ kiện.
export async function deleteFact(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('product_facts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/du-kien');
}

// Tải tư liệu thật lên kho brand_assets (ảnh, clip, logo do công ty sở hữu hoặc có giấy phép).
// Giới hạn kích thước qua server action khoảng 4,5MB. File lớn thì tải qua Supabase Storage.
export async function uploadAsset(formData: FormData) {
  const file = formData.get('file') as File | null;
  const kind = String(formData.get('kind') || 'image');
  if (!file || file.size === 0) return;

  const client = getServerClient();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safe}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await client.storage
    .from('brand-assets')
    .upload(path, buf, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error('Tải lên lỗi: ' + upErr.message);

  const license = String(formData.get('license') || 'owned') === 'licensed' ? 'licensed' : 'owned';
  const { error } = await client.from('brand_assets').insert({
    kind,
    title: String(formData.get('title') || '').trim() || file.name,
    storage_path: path,
    license,
    license_note: String(formData.get('license_note') || '').trim() || null,
    source: String(formData.get('source') || '').trim() || null
  });
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
}

// Tạo URL tải lên ký sẵn để TRÌNH DUYỆT tải thẳng file lên Supabase Storage.
// Dùng cho video và ảnh lớn: đi thẳng browser -> Supabase, không qua server action,
// nên không dính giới hạn body 4,5MB của hàm serverless trên Vercel.
export async function createAssetUploadUrl(fileName: string, kind: string) {
  const client = getServerClient();
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safe}`;
  const { data, error } = await client.storage.from('brand-assets').createSignedUploadUrl(path);
  if (error || !data) throw new Error('Không tạo được URL tải lên: ' + (error?.message || 'không rõ'));
  // Supabase trả sẵn signedUrl đầy đủ; nếu thiếu thì tự dựng để trình duyệt PUT thẳng file lên.
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const uploadUrl =
    data.signedUrl || `${base}/storage/v1/object/upload/sign/brand-assets/${data.path}?token=${data.token}`;
  return { path: data.path, uploadUrl };
}

// Ghi nhận tư liệu vào brand_assets sau khi trình duyệt đã tải file lên Storage xong.
// Chỉ nhận đường dẫn, không nhận nội dung file, nên nhẹ và không dính giới hạn dung lượng.
export async function registerAsset(input: {
  path: string;
  kind: string;
  title?: string;
  license?: string;
  source?: string;
}) {
  const path = String(input?.path || '').trim();
  if (!path) throw new Error('Thiếu đường dẫn file đã tải lên.');
  const KINDS = ['image', 'video', 'audio', 'logo', 'clip'];
  const kind = KINDS.includes(input.kind) ? input.kind : 'image';
  const license = input.license === 'licensed' ? 'licensed' : 'owned';
  const client = getServerClient();
  const { error } = await client.from('brand_assets').insert({
    kind,
    title: String(input.title || '').trim() || path,
    storage_path: path,
    license,
    source: String(input.source || '').trim() || null
  });
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
  revalidatePath('/san-xuat');
}

// Báo lượt tải về cho Unsplash theo hướng dẫn API (chạy ngầm, không chặn).
function triggerUnsplashDownload(loc?: string) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!loc || !key) return;
  fetch(`${loc}${loc.includes('?') ? '&' : '?'}client_id=${key}`).catch(() => {});
}

// Tải một buffer ảnh lên brand-assets và ghi bản ghi, trả { id, url }.
async function uploadImageBuffer(
  client: ReturnType<typeof getServerClient>,
  buf: Buffer,
  title: string,
  contentType: string,
  licenseNote: string | null
) {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const safe = (title || 'anh').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const path = `${Date.now()}-${safe}.${ext}`;
  const { error: upErr } = await client.storage.from('brand-assets').upload(path, buf, { contentType });
  if (upErr) throw new Error('Tải lên Storage lỗi: ' + upErr.message);
  const { data, error } = await client
    .from('brand_assets')
    .insert({
      kind: 'image',
      title: title || path,
      storage_path: path,
      license: licenseNote ? 'licensed' : 'owned',
      license_note: licenseNote
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const url = client.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
  return { id: (data as { id: string }).id, url };
}

// Tìm ảnh trên Unsplash theo từ khóa. Trả danh sách ảnh kèm thông tin tác giả.
export async function searchUnsplash(query: string) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error('Chưa cấu hình UNSPLASH_ACCESS_KEY trên máy chủ.');
  const q = (query || '').trim() || 'fishing boat sea';
  const r = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape&content_filter=high&client_id=${key}`
  );
  if (!r.ok) throw new Error('Lỗi Unsplash: ' + r.status);
  const j = await r.json();
  return ((j.results as any[]) || []).map((x) => ({
    id: x.id as string,
    thumb: x.urls?.small as string,
    regular: x.urls?.regular as string,
    downloadLocation: x.links?.download_location as string | undefined,
    author: x.user?.name as string | undefined,
    authorUrl: x.user?.links?.html as string | undefined
  }));
}

// Lưu thẳng một ảnh Unsplash vào kho tư liệu để dùng làm ảnh minh họa.
export async function saveUnsplashAsAsset(input: {
  regular: string;
  downloadLocation?: string;
  author?: string;
  title?: string;
}) {
  if (!input?.regular) throw new Error('Thiếu ảnh Unsplash.');
  const client = getServerClient();
  const r = await fetch(input.regular);
  if (!r.ok) throw new Error('Không tải được ảnh Unsplash.');
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || 'image/jpeg';
  const res = await uploadImageBuffer(
    client,
    buf,
    input.title || 'anh-unsplash',
    ct,
    input.author ? `Unsplash: ${input.author}` : 'Unsplash'
  );
  triggerUnsplashDownload(input.downloadLocation);
  revalidatePath('/san-xuat');
  return res;
}

// Cắt nền ảnh sản phẩm bằng remove.bg, trả PNG trong suốt (Buffer). Free tier độ phân giải preview.
async function removeBgCutout(imageUrl: string): Promise<Buffer> {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) throw new Error('Chưa cấu hình REMOVE_BG_API_KEY trên máy chủ.');
  const form = new FormData();
  form.append('image_url', imageUrl);
  form.append('size', 'preview');
  form.append('type', 'product');
  form.append('format', 'png');
  const r = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: form
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`remove.bg lỗi ${r.status}: ${t.slice(0, 160)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

// Ghép: cắt nền ảnh sản phẩm (remove.bg) rồi đặt lên nền Unsplash (hoặc nền thương hiệu) có bóng đổ,
// thêm tiêu đề và hotline. Sản phẩm giữ nguyên, chỉ tách khỏi nền cũ (điều cấm 5).
export async function createCompositeFromBackground(input: {
  productAssetId: string;
  background?: string;
  downloadLocation?: string;
  title?: string;
  author?: string;
}) {
  if (!input?.productAssetId) throw new Error('Chọn ảnh sản phẩm trước khi ghép.');
  const client = getServerClient();
  const { data } = await client
    .from('brand_assets')
    .select('storage_path, title')
    .eq('id', input.productAssetId)
    .single();
  const sp = (data as { storage_path?: string } | null)?.storage_path;
  if (!sp) throw new Error('Không tìm thấy ảnh sản phẩm.');
  // Tên mô tả lấy từ tên ảnh sản phẩm (đã đặt rõ), làm tiêu đề banner và tên ảnh ghép.
  const prodName = String((data as { title?: string } | null)?.title || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{10,}[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bannerTitle = String(input.title || '').trim() || prodName;
  const productUrl = client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
  const cutoutBuffer = await removeBgCutout(productUrl);
  let backgroundBuffer: Buffer | null = null;
  if (input.background) {
    const r = await fetch(input.background);
    if (r.ok) backgroundBuffer = Buffer.from(await r.arrayBuffer());
  }
  // @ts-ignore — module JS thuần, không có .d.ts
  const { buildBanner } = await import('../lib/gen/banner.mjs');
  const png = (await buildBanner({
    cutoutBuffer,
    backgroundBuffer,
    title: bannerTitle
  } as any)) as Buffer;
  const res = await uploadImageBuffer(
    client,
    png,
    (bannerTitle || 'anh ghép sdvico') + ' (ghép)',
    'image/png',
    input.author ? `Nền Unsplash: ${input.author}` : null
  );
  triggerUnsplashDownload(input.downloadLocation);
  revalidatePath('/san-xuat');
  return res;
}

// Đổi tên (title) một tư liệu. Tên này cũng là gợi ý cho AI khi sinh text theo hình.
export async function renameAsset(formData: FormData) {
  const id = String(formData.get('id') || '');
  const title = String(formData.get('title') || '').trim();
  if (!id || !title) return;
  const client = getServerClient();
  const { error } = await client.from('brand_assets').update({ title }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/tu-lieu');
  revalidatePath('/san-xuat');
}

// Xóa một tư liệu, gỡ cả file trên Storage.
export async function deleteAsset(formData: FormData) {
  const id = String(formData.get('id') || '');
  const storagePath = String(formData.get('storage_path') || '');
  if (!id) return;
  const client = getServerClient();
  if (storagePath) await client.storage.from('brand-assets').remove([storagePath]);
  await client.from('brand_assets').delete().eq('id', id);
  revalidatePath('/tu-lieu');
}

// Sinh text cho khung sản xuất: nhập từ khóa (kèm intent/landing_url tùy chọn), trả bản nháp
// qua bản mẫu (hoặc Gemini nếu có khóa). Trả string, gọi từ client component qua await.
// Không đụng DB, không tạo hàng đợi.
export async function generateTextForTitle(
  keyword: string,
  intent: string = 'giao_dich',
  landing_url: string | null = null,
  assetHint: string = '',
  format: string = 'social'
): Promise<string> {
  const clean = (keyword || '').trim();
  if (!clean) return '';
  // @ts-ignore — module JS thuần, không có .d.ts
  const { generateContentAsync } = await import('../lib/gen/content.mjs');
  try {
    const r = await generateContentAsync(
      { keyword: clean, intent, landing_url },
      { assetHint: (assetHint || '').trim(), format }
    );
    return (r?.draft as string) || '';
  } catch (e: any) {
    return `Không sinh được bằng AI: ${e?.message || e}. Bấm Xong để tự soạn tay và đẩy vào hàng đợi.`;
  }
}

// Xong khung sản xuất: tạo bản ghi mkt_content + đẩy vào approval_queue.
// KHÔNG tự đăng — người duyệt bấm 'Duyệt' ở Hàng đợi duyệt mới thực sự lên trang (Điều cấm 1).
export async function createContent(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const draft = String(formData.get('draft') || '').trim();
  const kind = (String(formData.get('kind') || 'social') as 'article' | 'social' | 'video');
  const imageAssetId = String(formData.get('image_asset_id') || '') || null;
  const videoAssetId = String(formData.get('video_asset_id') || '') || null;
  const keywordId = String(formData.get('keyword_id') || '') || null;
  const keyword = String(formData.get('keyword') || '').trim() || title;
  const intent = String(formData.get('intent') || 'giao_dich').trim() || 'giao_dich';
  const landingUrl = String(formData.get('landing_url') || '').trim() || null;
  if (!title || !draft) return;

  const client = getServerClient();
  const brief = {
    keyword,
    intent,
    landing_url: landingUrl,
    keyword_id: keywordId,
    generator: 'xuong-san-xuat',
    assets: { image: imageAssetId, video: videoAssetId }
  };
  const { data: inserted, error } = await client
    .from('mkt_content')
    .insert({ kind, title, brief, draft, status: 'review' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const contentId = (inserted as { id: string })?.id;
  const { error: qErr } = await client.from('approval_queue').insert({
    kind: 'mkt_publish_content',
    title: `[${kind === 'video' ? 'Video' : kind === 'article' ? 'Bài website' : 'Bài Facebook'}] ${title}`,
    payload: {
      content_id: contentId,
      format: kind,
      keyword,
      intent,
      landing_url: landingUrl,
      risk: 'amber',
      assets: { image: imageAssetId, video: videoAssetId }
    },
    status: 'pending'
  });
  if (qErr) throw new Error(qErr.message);

  revalidatePath('/');
  revalidatePath('/noi-dung');
  revalidatePath('/san-xuat');
}

// Chỉnh sửa bản nháp trước khi duyệt. Người sửa là người kiểm soát (điều cấm 1).
export async function editDraft(formData: FormData) {
  const contentId = String(formData.get('content_id') || '');
  const draft = String(formData.get('draft') || '');
  if (!contentId) return;
  const client = getServerClient();
  const { error } = await client.from('mkt_content').update({ draft }).eq('id', contentId);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/noi-dung');
}
