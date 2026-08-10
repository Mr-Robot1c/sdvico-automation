// Hàng đợi duyệt. Điều cấm 1 và 2: máy soạn, người bấm.
// Mọi thư, tin nhắn, bài đăng đi qua đây, trạng thái mặc định pending.

export async function pushApproval(client, {
  kind,
  title,
  payload = {},
  refTable = null,
  refId = null
}) {
  const { data, error } = await client
    .from('approval_queue')
    .insert({
      kind,
      title,
      payload,
      ref_table: refTable,
      ref_id: refId,
      status: 'pending'
    })
    .select('id')
    .single();
  if (error) throw new Error('Đẩy approval_queue lỗi: ' + error.message);
  return data.id;
}

// Người quyết. Chỉ đổi được mục còn đang pending, tránh ghi đè quyết định cũ.
export async function decideApproval(client, id, decision, { decidedBy = null, note = null } = {}) {
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error('decision phải là approved hoặc rejected');
  }
  const { data, error } = await client
    .from('approval_queue')
    .update({
      status: decision,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      note
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error('Cập nhật approval_queue lỗi: ' + error.message);
  if (!data || data.length === 0) {
    throw new Error('Mục không tồn tại hoặc đã được quyết trước đó.');
  }
  return data[0].id;
}
