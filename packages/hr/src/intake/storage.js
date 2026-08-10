// Lưu tệp CV vào Supabase Storage. Bucket riêng tư, chỉ backend dùng khóa service role đọc ghi.
// Điều cấm 6: dữ liệu ứng viên nằm trong hạ tầng công ty, không sao ra dịch vụ ngoài.

import { createHash } from 'node:crypto';

const BUCKET = process.env.CV_BUCKET || 'cv';

// Đảm bảo bucket tồn tại. Gọi một lần đầu mỗi lượt chạy. Không lỗi nếu đã có.
export async function ensureBucket(client, bucket = BUCKET) {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw new Error('Liệt kê bucket lỗi: ' + error.message);
  if (buckets.some((b) => b.name === bucket)) return bucket;
  const { error: createErr } = await client.storage.createBucket(bucket, { public: false });
  // Có thể một lượt chạy song song vừa tạo. Bỏ qua lỗi trùng.
  if (createErr && !/exist/i.test(createErr.message)) {
    throw new Error('Tạo bucket lỗi: ' + createErr.message);
  }
  return bucket;
}

// Đường dẫn lưu trữ: cv/<năm>/<khóa băm>/<tên tệp>.
// Khóa băm lấy từ dedup_key nếu có, không thì băm nội dung, để tệp cùng ứng viên gom một chỗ.
function buildPath(filename, { dedupKey, buffer, year }) {
  const safeName = String(filename || 'cv').replace(/[^\w.\-]+/g, '_').slice(-80);
  const basis = dedupKey || createHash('sha1').update(buffer).digest('hex').slice(0, 16);
  const folder = createHash('sha1').update(basis).digest('hex').slice(0, 16);
  return `${year}/${folder}/${Date.now()}_${safeName}`;
}

// Tải một tệp lên. Trả về đường dẫn trong bucket.
export async function uploadCv(client, { filename, mime, buffer, dedupKey, year }, bucket = BUCKET) {
  const path = buildPath(filename, { dedupKey, buffer, year: year || 'unknown' });
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType: mime || 'application/octet-stream',
    upsert: true
  });
  if (error) throw new Error('Tải CV lên Storage lỗi: ' + error.message);
  return `${bucket}/${path}`;
}

export { BUCKET as CV_BUCKET };
