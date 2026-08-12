'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';

// Người quyết. Đọc từ form, cập nhật trạng thái, chỉ đổi mục còn pending.
export async function decideForm(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  const note = String(formData.get('note') || '');

  const decision = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!id || !decision) return;

  const client = getServerClient();
  const { error } = await client
    .from('approval_queue')
    .update({ status: decision, decided_at: new Date().toISOString(), note: note || null })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/noi-dung');
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
}) {
  const path = String(input?.path || '').trim();
  if (!path) throw new Error('Thiếu đường dẫn file đã tải lên.');
  const kind = input.kind === 'video' ? 'video' : 'image';
  const license = input.license === 'licensed' ? 'licensed' : 'owned';
  const client = getServerClient();
  const { error } = await client.from('brand_assets').insert({
    kind,
    title: String(input.title || '').trim() || path,
    storage_path: path,
    license
  });
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
  assetHint: string = ''
): Promise<string> {
  const clean = (keyword || '').trim();
  if (!clean) return '';
  // @ts-ignore — module JS thuần, không có .d.ts
  const { generateContentAsync } = await import('../lib/gen/content.mjs');
  try {
    const r = await generateContentAsync({ keyword: clean, intent, landing_url }, { assetHint: (assetHint || '').trim() });
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
