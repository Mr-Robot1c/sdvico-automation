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
}
