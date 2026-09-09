// fresh-clip.mjs - chon CLIP THAT (video Zalo) moi trong kho de ep vao video (user 9/9: video
// "nguoi that tau that"). Ban sao y het o packages/marketing/src/video (build-video, rotate-run)
// va apps/approval-ui/lib/gen (route rotate tren Vercel). Khong import gi de Vercel goi nhe.
export const FRESH_DAYS = 14;
// source do up-media-kho-tu-lieu.mjs ('zalo-auto'), upload-zalo-to-bucket.mjs ('zalo') va lo
// chep tay thang 8 ('zalo-backlog-tkkd') ghi. Video do day chuyen dung ra la 'video-pipeline'.
export const ZALO_SOURCES = new Set(['zalo-auto', 'zalo', 'zalo-backlog-tkkd']);

export function isZaloClip(a) {
  return !!a && (a.kind === 'video' || a.kind === 'clip') && ZALO_SOURCES.has(String(a.source || ''));
}

// assets: [{id, kind, source, created_at, title}]. usedIds: Set id da dung dung video content.
// Tra ve clip Zalo tao trong `days` ngay, chua co trong usedIds, MOI NHAT truoc.
export function pickFreshClips(assets, usedIds = new Set(), now = Date.now(), days = FRESH_DAYS) {
  const since = now - days * 86400e3;
  return (assets || [])
    .filter((a) => isZaloClip(a) && a.created_at && Date.parse(a.created_at) >= since && !usedIds.has(a.id))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// Nhan them vao danh sach tu lieu trong prompt kich ban de model nhin ra clip that moi.
export function clipLabel(a, now = Date.now()) {
  if (!isZaloClip(a) || !a.created_at) return '';
  const t = Date.parse(a.created_at);
  if (Number.isNaN(t)) return '';
  if (now - t > FRESH_DAYS * 86400e3) return 'clip thật';
  const d = new Date(t + 7 * 3600e3);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `CLIP THẬT MỚI quay ${dd}/${mm}`;
}
