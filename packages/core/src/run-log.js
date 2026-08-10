// Ghi nhật ký một thao tác tự động vào bảng run_log.
// Mọi thao tác tự động phải ghi lại, kèm ảnh chụp khi lỗi.
export async function logRun(client, {
  task,
  actor = null,
  status = 'ok',
  detail = {},
  screenshotPath = null,
  costVnd = 0
}) {
  const { data, error } = await client
    .from('run_log')
    .insert({
      task,
      actor,
      status,
      detail,
      screenshot_path: screenshotPath,
      cost_vnd: costVnd
    })
    .select('id')
    .single();
  if (error) throw new Error('Ghi run_log lỗi: ' + error.message);
  return data.id;
}
