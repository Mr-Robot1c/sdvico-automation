-- Tạo bucket lưu ảnh bài đăng tuyển dụng. Public để Facebook tải ảnh từ URL được.
-- Chạy một lần trong Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Service role (server) được phép upload và xoá ảnh.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'service role manage post images'
  ) then
    execute $p$
      create policy "service role manage post images"
      on storage.objects for all to service_role
      using (bucket_id = 'post-images')
      with check (bucket_id = 'post-images')
    $p$;
  end if;
end $$;

-- Đọc công khai — Facebook cần tải ảnh từ URL để đăng kèm ảnh.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'public read post images'
  ) then
    execute $p$
      create policy "public read post images"
      on storage.objects for select to public
      using (bucket_id = 'post-images')
    $p$;
  end if;
end $$;
