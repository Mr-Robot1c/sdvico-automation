// token-log.mjs — ghi lại token Gemini đã dùng, cho dashboard "Quản trị token" (24/8, user:
// "sếp bảo đốt quá nhiều token rồi", cần quản trị token các agent để dễ quản lý).
//
// Chỉ THÊM 1 dòng gọi hàm này sau mỗi lần generateContent thành công — KHÔNG đổi logic gì
// khác ở call site. Fire-and-forget (không await ở call site, lỗi ghi log không được làm
// hỏng luồng sinh nội dung chính).
//
// Field usageMetadata trả về từ @google/genai SDK: { promptTokenCount, candidatesTokenCount,
// totalTokenCount }. Không phải mọi model/version đều trả field này — thiếu thì bỏ qua, không lỗi.

// task: nhãn tác vụ ('plan_directions' | 'knowledge_internal' | 'knowledge_public' | ...) —
// dùng để breakdown "theo tác vụ" ở dashboard. model: tên model Gemini đã dùng.
export function logTokenUsage(client, task, model, usageMetadata) {
  if (!client || !usageMetadata) return;
  const promptTokens = Number(usageMetadata.promptTokenCount) || 0;
  const candidatesTokens = Number(usageMetadata.candidatesTokenCount) || 0;
  const totalTokens = Number(usageMetadata.totalTokenCount) || (promptTokens + candidatesTokens);
  if (!totalTokens) return;
  // Promise.resolve() adopt Supabase query builder (PromiseLike) thành true Promise —
  // .catch() chắc chắn bắt được lỗi reject, không cần await ở call site.
  Promise.resolve(
    client.from('run_log').insert({
      task: 'mkt.token_usage',
      actor: 'gemini',
      status: 'ok',
      detail: { source_task: task, model, promptTokens, candidatesTokens, totalTokens },
    })
  ).catch(() => {});
}
