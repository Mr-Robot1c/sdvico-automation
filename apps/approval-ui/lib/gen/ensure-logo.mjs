// ensure-logo.mjs — bảo đảm ảnh có logo SDVICO TRƯỚC KHI dùng cho bài đăng.
// Kiểm tra bằng Gemini (ảnh đã có logo/watermark thương hiệu chưa) rồi mới đóng logo, tránh
// đóng chồng lên ảnh vốn đã có logo. Xử lý IN-PLACE trên brand_assets (đổi storage_path).
// Không có cột riêng để đánh dấu nên dùng quy ước: storage_path chứa '-logo-' nghĩa là đã xử lý.
import { overlayLogo } from './logo-overlay.mjs';

const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';
const BUCKET = 'brand-assets';

// Ảnh đã được xử lý logo (của mình) khi storage_path chứa '-logo-'.
function pathMarkedLogo(p) {
  return /-logo-/i.test(String(p || ''));
}

function mimeOf(path) {
  const p = String(path || '').toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// Hỏi Gemini (đa phương thức): ảnh này đã có sẵn logo/watermark thương hiệu chưa?
// Trả true nếu CÓ, false nếu KHÔNG, null nếu không rõ (lỗi vision) để chỗ gọi tự quyết an toàn.
export async function imageHasLogo(buf, mimeType = 'image/jpeg') {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: MKT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Ảnh này đã có sẵn LOGO hoặc WATERMARK của một thương hiệu chưa (thường ở góc ảnh)?',
                'Chữ ký nhiếp ảnh gia, tín dụng ảnh (vd Unsplash), hay chữ nhỏ mờ KHÔNG tính là logo thương hiệu.',
                'Chỉ trả JSON đúng dạng, không thêm chữ nào ngoài JSON: {"has_logo": true} hoặc {"has_logo": false}.',
              ].join(' '),
            },
            { inlineData: { mimeType, data: buf.toString('base64') } },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    const t = (res.text || '').trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return parsed.has_logo === true;
  } catch (e) {
    console.warn('imageHasLogo loi:', e?.message || e);
    return null;
  }
}

// Đóng logo lên ảnh và cập nhật brand_assets IN-PLACE. preBuf: buffer ảnh đã tải sẵn (khỏi tải lại).
// Trả về storage_path mới, hoặc ném lỗi.
export async function stampLogoInPlace(client, asset, preBuf = null) {
  let buf = preBuf;
  if (!buf) {
    const dl = await client.storage.from(BUCKET).download(asset.storage_path);
    if (dl.error || !dl.data) throw new Error('Không tải được ảnh gốc: ' + (dl.error?.message || ''));
    buf = Buffer.from(await dl.data.arrayBuffer());
  }
  const outBuf = await overlayLogo(buf, { position: 'br', scale: 0.14, format: 'jpeg' });
  const stamp = Date.now();
  const newPath = asset.storage_path.replace(/(\.[a-z0-9]+)?$/i, `-logo-${stamp}.jpg`);
  const up = await client.storage.from(BUCKET).upload(newPath, outBuf, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (up.error) throw new Error('Không tải ảnh mới lên được: ' + up.error.message);
  const upd = await client.from('brand_assets').update({ storage_path: newPath }).eq('id', asset.id);
  if (upd.error) throw new Error(upd.error.message);
  await client.storage.from(BUCKET).remove([asset.storage_path]).catch(() => undefined);
  return newPath;
}

// Đánh dấu ảnh "đã có logo" mà KHÔNG đổi nội dung: đổi tên path thêm '-logo-' để lần sau bỏ qua
// (khỏi gọi lại vision). Đổi tên lỗi thì bỏ qua, giữ nguyên.
async function markHasLogo(client, asset) {
  const stamp = Date.now();
  const newPath = asset.storage_path.replace(/(\.[a-z0-9]+)?$/i, (m) => `-logo-${stamp}${m || ''}`);
  const mv = await client.storage.from(BUCKET).move(asset.storage_path, newPath);
  if (mv.error) return asset.storage_path;
  await client.from('brand_assets').update({ storage_path: newPath }).eq('id', asset.id);
  return newPath;
}

// Bảo đảm ảnh (theo id) có logo trước khi gắn vào bài. Xử lý in-place nên giữ NGUYÊN id.
// stampWhenUnknown: khi vision lỗi/không rõ có đóng logo không (mặc định false: an toàn, không đóng chồng).
// Trả { id, action: 'skip'|'already'|'kept'|'stamped', reason }.
export async function ensureLogoForPost(client, assetId, { stampWhenUnknown = false } = {}) {
  if (!assetId) return { id: assetId, action: 'skip', reason: 'no-id' };
  const { data: a } = await client
    .from('brand_assets')
    .select('id, kind, storage_path')
    .eq('id', assetId)
    .single();
  const asset = a;
  if (!asset || asset.kind !== 'image') return { id: assetId, action: 'skip', reason: 'not-image' };
  if (pathMarkedLogo(asset.storage_path)) return { id: assetId, action: 'already', reason: 'marked' };

  const dl = await client.storage.from(BUCKET).download(asset.storage_path);
  if (dl.error || !dl.data) return { id: assetId, action: 'skip', reason: 'download-fail' };
  const buf = Buffer.from(await dl.data.arrayBuffer());

  const has = await imageHasLogo(buf, mimeOf(asset.storage_path));
  if (has === true) {
    await markHasLogo(client, asset).catch(() => undefined);
    return { id: assetId, action: 'kept', reason: 'da-co-logo' };
  }
  if (has === null && !stampWhenUnknown) {
    return { id: assetId, action: 'skip', reason: 'vision-khong-ro' };
  }
  try {
    await stampLogoInPlace(client, asset, buf);
    return { id: assetId, action: 'stamped', reason: has === false ? 'chua-co-logo' : 'khong-ro-van-dong' };
  } catch (e) {
    return { id: assetId, action: 'skip', reason: 'stamp-loi: ' + (e?.message || e) };
  }
}
