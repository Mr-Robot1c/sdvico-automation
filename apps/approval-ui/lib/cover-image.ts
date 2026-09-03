// cover-image.ts — gắn ẢNH RIÊNG CỐ ĐỊNH cho một bài blog (3/9, user: "blog không được dính
// trùng ảnh — không có ảnh phù hợp thì kêu Gemini kiếm 1 cái trên Google").
//
// Trước đây bài thiếu ảnh được GHÉP LÚC HIỂN THỊ từ pool chung -> hai bệnh user bắt tận tay:
// bài máy lọc NƯỚC mang ảnh máy lọc DẦU (pool chung không hiểu bài), và nhiều thẻ trùng một
// ảnh (pool cạn thì lặp). Từ giờ: mỗi bài public phải có ảnh riêng LƯU VÀO brief.assets ngay
// lúc đăng (hoặc backfill 1 lần cho bài cũ):
//   1. Đoán nhóm sản phẩm từ keyword + tiêu đề (guessGroup — hiểu cả keyword dài).
//   2. Có nhóm -> lấy ảnh trong folder nhóm CHƯA bài nào khác giữ (không cấp 1 ảnh 2 lần).
//   3. Không nhóm / folder hết ảnh trống -> pickImageForContent: Gemini sinh keyword, tìm
//      Google CSE -> Unsplash, CHẤM ĐIỂM bằng mắt AI rồi mới lấy (đường có sẵn của bài content).
//   4. Không kiếm được gì -> trả null, thẻ hiện placeholder logo (KHÔNG lặp ảnh bài khác).

// @ts-ignore module JS thuần
import { guessGroup } from './gen/products.mjs';
// @ts-ignore
import { pickImageForContent } from './gen/pick-image.mjs';

type Client = any;

// Ảnh mà các bài public khác đã giữ (id kho + url ngoài) — để không cấp trùng.
export async function collectTakenCovers(client: Client, excludeContentId?: string): Promise<Set<string>> {
  const taken = new Set<string>();
  const { data: rows } = await client
    .from('mkt_content')
    .select('id, brief')
    .is('deleted_at', null)
    .limit(1000);
  for (const r of rows || []) {
    if (excludeContentId && r.id === excludeContentId) continue;
    const a = r?.brief?.assets || {};
    if (a.image) taken.add(String(a.image));
    if (a.image_url) taken.add(String(a.image_url));
  }
  return taken;
}

// Folder ảnh theo nhóm sản phẩm (mirror cách rotate gom).
async function loadImageFolders(client: Client): Promise<Map<string, Array<{ id: string; title: string }>>> {
  const { data } = await client
    .from('brand_assets')
    .select('id, kind, title, product_group')
    .eq('kind', 'image')
    .not('product_group', 'is', null);
  const folders = new Map<string, Array<{ id: string; title: string }>>();
  for (const a of (data || []) as any[]) {
    if (!folders.has(a.product_group)) folders.set(a.product_group, []);
    folders.get(a.product_group)!.push({ id: a.id, title: a.title });
  }
  return folders;
}

// Gắn ảnh riêng cho 1 bài. Trả về mô tả kết quả để ghi log; KHÔNG throw (best effort —
// thiếu ảnh không được chặn việc đăng bài).
export async function ensureCoverForContent(
  client: Client,
  contentId: string,
  opts: { taken?: Set<string>; force?: boolean } = {}
): Promise<{ via: string; note?: string }> {
  try {
    const { data: c } = await client
      .from('mkt_content')
      .select('id, title, draft, brief')
      .eq('id', contentId)
      .maybeSingle();
    if (!c) return { via: 'skip', note: 'không thấy bài' };
    const brief = c.brief || {};
    const assets = brief.assets || {};
    const taken = opts.taken || (await collectTakenCovers(client, contentId));

    // Đã có ảnh riêng, còn sống và không trùng bài khác -> giữ.
    if (!opts.force) {
      if (assets.image_url && !taken.has(String(assets.image_url))) return { via: 'giu-nguyen' };
      if (assets.image && !taken.has(String(assets.image))) {
        const { data: row } = await client.from('brand_assets').select('storage_path').eq('id', assets.image).maybeSingle();
        if (row?.storage_path) {
          const url = client.storage.from('brand-assets').getPublicUrl(row.storage_path).data.publicUrl;
          const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
          if (res?.ok) return { via: 'giu-nguyen' };
        }
      }
    }

    const topic = `${brief.keyword || brief.topic || ''} ${c.title || ''}`.trim();
    const body = String(c.draft || '').slice(0, 800);

    // 1. Ảnh nhà đúng nhóm, chưa ai giữ.
    const grp = guessGroup(topic) as string | null;
    if (grp) {
      const folders = await loadImageFolders(client);
      const key = [...folders.keys()].find(
        (g) => g.replace(/^\s*\d+\.\s*/, '').toLowerCase() === String(grp).replace(/^\s*\d+\.\s*/, '').toLowerCase()
      );
      const free = (key ? folders.get(key)! : []).filter((img) => !taken.has(img.id));
      if (free.length) {
        const pick = free[parseInt(contentId.replace(/-/g, '').slice(0, 8), 16) % free.length];
        await client.from('mkt_content').update({
          brief: { ...brief, assets: { ...assets, image: pick.id, image_url: null }, image_via: 'product-folder' },
        }).eq('id', contentId);
        taken.add(pick.id);
        return { via: 'product-folder', note: key };
      }
    }

    // 2. Gemini kiếm ảnh ngoài (CSE -> Unsplash, có chấm điểm) — né url đã cấp.
    const picked: any = await pickImageForContent(client, new Map(), topic, null, body);
    if (picked?.url && !taken.has(String(picked.url))) {
      await client.from('mkt_content').update({
        brief: {
          ...brief,
          assets: { ...assets, image: null, image_url: picked.url },
          image_via: picked.via, ...(picked.credit ? { image_credit: picked.credit } : {}),
          ...(picked.note ? { image_note: picked.note } : {}),
        },
      }).eq('id', contentId);
      taken.add(String(picked.url));
      return { via: picked.via || 'external', note: picked.note };
    }
    if (picked?.id && !taken.has(String(picked.id))) {
      await client.from('mkt_content').update({
        brief: { ...brief, assets: { ...assets, image: picked.id, image_url: null }, image_via: picked.via },
      }).eq('id', contentId);
      taken.add(String(picked.id));
      return { via: picked.via || 'pool' };
    }
    return { via: 'khong-tim-duoc', note: 'thẻ sẽ hiện placeholder logo' };
  } catch (e: any) {
    return { via: 'loi', note: String(e?.message || e).slice(0, 120) };
  }
}
