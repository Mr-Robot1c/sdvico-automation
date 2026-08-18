-- Bucket lưu tài liệu nhân viên (hợp đồng, bằng cấp, BHXH, CCCD). PRIVATE — khác bucket
-- post-images (public) vì đây là giấy tờ cá nhân, không phải ảnh bài đăng công khai.
-- Chạy một lần trong Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do nothing;

-- Chỉ service role (server) đọc/ghi. Không có policy nào cho authenticated/anon/public —
-- app tự ký URL tạm (createSignedUrl) sau khi kiểm role admin, giống cách /ho-so ký URL đọc CV.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'service role manage employee documents'
  ) then
    execute $p$
      create policy "service role manage employee documents"
      on storage.objects for all to service_role
      using (bucket_id = 'employee-documents')
      with check (bucket_id = 'employee-documents')
    $p$;
  end if;
end $$;
