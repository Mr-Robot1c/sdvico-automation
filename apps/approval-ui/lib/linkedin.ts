// Đăng bài lên LinkedIn Company Page qua REST Posts API.
// NGỦ cho tới khi có LINKEDIN_ACCESS_TOKEN + LINKEDIN_ORG_URN (chưa cấu hình thì không đăng).
// Điều cấm 1: chỉ đăng bài đã qua cổng Duyệt. Không lách API (chỉ dùng API chính thức).
//
// Env cần khi bật:
//   LINKEDIN_ACCESS_TOKEN   token có quyền w_organization_social (Community Management API)
//   LINKEDIN_ORG_URN        urn:li:organization:XXXX  (Company Page của SDVICO)
//   LINKEDIN_VERSION        YYYYMM, mặc định 202601

export function linkedinConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_URN);
}

// Đăng bài text lên Company Page. Trả về URN của bài (để lưu, dùng cho xóa/repost).
// Ảnh: bản này đăng text-only cho gọn (ảnh cần luồng upload riêng, bổ sung khi bật thật).
export async function postToLinkedIn(text: string): Promise<string> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const org = process.env.LINKEDIN_ORG_URN;
  const version = process.env.LINKEDIN_VERSION || '202601';
  if (!token || !org) throw new Error('Chưa cấu hình LINKEDIN_ACCESS_TOKEN / LINKEDIN_ORG_URN.');
  if (!text?.trim()) throw new Error('Bài chưa có nội dung.');

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': version,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: org,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LinkedIn lỗi HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  // ID bài nằm ở header x-restli-id (hoặc x-linkedin-id).
  return res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || 'posted';
}
