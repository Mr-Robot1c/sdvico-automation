// asset-url.mjs — MỘT chỗ đổi storage_path của brand_assets thành URL tải được (15/9, kho tư liệu có
// thể nằm ở Supabase Storage (cũ) HOẶC Google Drive ("gdrive:<id>/<tên>")). Bản TS cho app:
// apps/approval-ui/lib/asset-url.ts (cùng luật).
import { driveUrl, isDrivePath } from './gdrive.mjs';

export function assetPublicUrl(client, storagePath, kind = '') {
  const sp = String(storagePath || '');
  if (!sp) return null;
  if (isDrivePath(sp)) return driveUrl(sp, kind);
  return client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
}
