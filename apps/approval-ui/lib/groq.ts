// Gọi Groq qua REST (tương thích OpenAI) từ phía máy chủ. Dùng cho trang Tạo JD.
// Không có GROQ_API_KEY thì trả null để nơi gọi lùi về bản ghép, không làm hỏng trang.
// Điều cấm 7: khóa nằm trong biến môi trường máy chủ, không gửi xuống trình duyệt.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat(
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  // Model mặc định: openai/gpt-oss-120b (mạnh, KHÔNG agentic nên không tự tra web — an toàn
  // dữ liệu, điều cấm 6). Đổi từ 'llama-3.3-70b-versatile' vì Groq đã gỡ model đó (gọi trả 404
  // "model_not_found") khiến mọi lời gọi AI rơi về bản dự phòng. Ghi đè bằng biến môi trường
  // HR_JD_MODEL nếu muốn dùng model khác. Lưu ý: gpt-oss là model suy luận, cần max_tokens đủ
  // rộng để kịp trả JSON (các lời gọi JSON nên để tối thiểu ~1000 token).
  const model = process.env.HR_JD_MODEL || process.env.HR_SCREEN_MODEL || 'openai/gpt-oss-120b';
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 2200,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    }),
    cache: 'no-store'
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq lỗi HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text : null;
}
