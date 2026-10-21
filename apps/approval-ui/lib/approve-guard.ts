// approve-guard.ts — điều kiện CHẶN duyệt đăng một phiếu bài marketing, kiểm ở server trong decideForm (21/10, rà soát
// hệ thống). Tách khỏi app/actions.ts (file 'use server' chỉ được export hàm action) để test được: npm run test:approve.

// Bài cần cấp quản lý: cờ đỏ trên phiếu, cờ quản lý trên phiếu, hoặc mkt_content.needs_gov_review.
export function needsManagerApproval(payload: Record<string, unknown>, contentGov: boolean): boolean {
  return payload.risk === 'red' || payload.needs_manager_approval === true || contentGov;
}

// Lý do KHÔNG được duyệt đăng bài marketing này, null = được duyệt. Gọi ở server trước khi đổi trạng thái phiếu.
export async function approveBlockReason(
  client: any,
  payload: Record<string, unknown>,
  managerOk: boolean
): Promise<string | null> {
  const contentId = payload.content_id ? String(payload.content_id) : null;
  const { data: c } = contentId
    ? await client.from('mkt_content').select('brief, needs_gov_review').eq('id', contentId).maybeSingle()
    : { data: null };
  // Điều cấm 3: bài chạm quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư phải qua cấp quản lý. Hệ thống chỉ có một tài
  // khoản chung nên không biết ai bấm; người duyệt phải tick ô "Quản lý đã duyệt" (user chốt 21/10), thiếu thì chặn.
  if (needsManagerApproval(payload, (c as any)?.needs_gov_review === true) && !managerOk) return 'can-quan-ly-duyet';
  if (!contentId) return null;
  const brief = ((c as any)?.brief || {}) as Record<string, any>;
  const channels: string[] = Array.isArray(payload.channels) ? (payload.channels as string[])
    : Array.isArray(brief.channels) ? brief.channels : [];
  // Ô YouTube duyệt trước khi video dựng xong thì bài không lên đâu và video dựng sau bị bỏ.
  if (channels.includes('youtube')) {
    const a = brief.assets || {};
    if (!a.video_v && !a.video) return brief.video_failed ? 'youtube-video-loi' : 'youtube-chua-co-video';
  }
  return null;
}
