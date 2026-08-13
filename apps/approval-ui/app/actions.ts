'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../lib/supabase-server';
import { composeJdVersions } from '../lib/jd-compose';
import { groqChat } from '../lib/groq';
import { fetchUnsplashPhoto } from '../lib/unsplash';
import { overlayLogo } from '../lib/image-composite';

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

// Người quyết đưa một hồ sơ vào phỏng vấn. Điều cấm 2: máy chấm và xếp, người chọn ai đi tiếp.
// Chỉ chuyển được hồ sơ đang ở bước 'review' (đã chấm xong), tránh nhảy bước.
// Sau đó tác vụ hr-interview sẽ soạn câu hỏi và thư mời cho hồ sơ này.
export async function advanceToInterview(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  if (!appId) return;

  const client = getServerClient();
  const { error } = await client
    .from('hr_applications')
    .update({ stage: 'interview' })
    .eq('id', appId)
    .eq('stage', 'review');
  if (error) throw new Error(error.message);

  revalidatePath('/ho-so');
}

// Từ chối một ứng viên nguồn ngoài và XOÁ khỏi cơ sở dữ liệu.
// Nghị định 13: dữ liệu nguồn ngoài chưa có consent thì tối thiểu hóa, từ chối là xoá luôn.
// Chốt an toàn: chỉ xoá ứng viên nguồn ngoài chưa có consent, KHÔNG đụng ứng viên đã tự nộp.
export async function rejectSourced(formData: FormData) {
  const candidateId = String(formData.get('candidateId') || '');
  if (!candidateId) return;

  const client = getServerClient();
  const { data: cand, error: e1 } = await client
    .from('hr_candidates')
    .select('id, source, consent_at')
    .eq('id', candidateId)
    .single();
  if (e1) throw new Error(e1.message);

  const sourced = String(cand.source || '').startsWith('sourced');
  if (!sourced || cand.consent_at) {
    // Ứng viên đã tự nộp hoặc có consent thì không xoá cứng, tránh mất dữ liệu có nghĩa vụ lưu.
    throw new Error('Chỉ xoá được ứng viên nguồn ngoài chưa có consent.');
  }

  // Xoá ứng viên. Hồ sơ ứng tuyển liên kết tự xoá theo (on delete cascade).
  const { error: e2 } = await client.from('hr_candidates').delete().eq('id', candidateId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/ho-so');
}

// Lưu ghi chú của người duyệt cho một hồ sơ.
export async function saveNote(formData: FormData) {
  const appId = String(formData.get('appId') || '');
  const note = String(formData.get('note') || '').slice(0, 4000);
  if (!appId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_applications').update({ note: note || null }).eq('id', appId);
  if (error) throw new Error(error.message);
  revalidatePath('/ho-so');
}

// Lưu khung giờ phỏng vấn mong muốn. Nhận chuỗi giờ cách nhau bằng dấu phẩy, ví dụ 09:00, 14:00.
export async function saveWindows(formData: FormData) {
  const raw = String(formData.get('windows') || '');
  const times = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s));
  if (!times.length) return;
  const client = getServerClient();
  const { error } = await client
    .from('app_config')
    .upsert({ key: 'interview_windows', value: times, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  revalidatePath('/lich');
}

// Thêm một nền tảng đăng tuyển hoặc tìm ứng viên.
export async function addPlatform(formData: FormData) {
  const ten = String(formData.get('ten') || '').trim();
  const loai = String(formData.get('loai') || 'job_board');
  const ghi_chu = String(formData.get('ghi_chu') || '').trim() || null;
  if (!ten) return;
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').insert({ ten, loai, ghi_chu });
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Xoá một nền tảng.
export async function removePlatform(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const client = getServerClient();
  const { error } = await client.from('hr_platforms').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Tạo một tin đăng ở trạng thái nháp hoặc đặt lịch.
export async function addJobPost(formData: FormData) {
  const tieu_de = String(formData.get('tieu_de') || '').trim();
  const platform_id = String(formData.get('platform_id') || '') || null;
  const scheduledRaw = String(formData.get('scheduled_at') || '').trim();
  if (!tieu_de) return;
  const scheduled_at = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
  const trang_thai = scheduled_at ? 'scheduled' : 'draft';
  const client = getServerClient();
  const { error } = await client.from('hr_job_posts').insert({ tieu_de, platform_id, scheduled_at, trang_thai });
  if (error) throw new Error(error.message);
  revalidatePath('/dang-tin');
}

// Đổi trạng thái tin đăng: đánh dấu đã đăng, huỷ, hoặc xoá.
export async function updateJobPost(formData: FormData) {
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  if (!id) return;
  const client = getServerClient();
  if (action === 'delete') {
    // Gỡ bài khỏi Facebook trước (nếu đã đăng và có fb_post_id).
    // Lỗi Facebook thì ghi log và vẫn xoá cứng khỏi DB.
    const { data: existing } = await client
      .from('hr_job_posts').select('fb_post_id, trang_thai').eq('id', id).maybeSingle();
    if (existing?.fb_post_id && existing.trang_thai === 'posted') {
      try {
        await callFacebookDeleteApi(existing.fb_post_id);
        await client.from('run_log').insert({ task: 'hr.delete_facebook_post', status: 'ok', detail: { postId: id, fbPostId: existing.fb_post_id } });
      } catch (err) {
        await client.from('run_log').insert({ task: 'hr.delete_facebook_post', status: 'error', detail: { postId: id, error: String(err) } });
      }
    }
    // Xoá cứng — không còn thùng rác.
    const { error } = await client.from('hr_job_posts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } else if (action === 'posted') {
    const { error } = await client.from('hr_job_posts').update({ trang_thai: 'posted', posted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  } else if (action === 'cancel') {
    const { error } = await client.from('hr_job_posts').update({ trang_thai: 'cancelled' }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/dang-tin');
}


// Đưa một vị trí vào hàng đợi đăng Facebook: soạn nháp từ bản JD sẵn có rồi đẩy vào hàng đợi duyệt.
// Máy soạn, người bấm Duyệt (điều cấm 1). KHÔNG đăng gì ở đây. Worker publish-facebook mới đăng.
export async function queueFacebookPost(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;

  const client = getServerClient();
  const { data: job, error: e0 } = await client
    .from('hr_jobs')
    .select('id, title, location, short_desc, jd_versions, image_hint')
    .eq('id', jobId)
    .single();
  if (e0) throw new Error(e0.message);

  // Vị trí đã có bài Facebook đang chờ hoặc đã đăng thì thôi, tránh trùng.
  const { data: existing } = await client
    .from('hr_job_posts')
    .select('id')
    .eq('job_id', jobId)
    .eq('kenh', 'facebook')
    .in('trang_thai', ['draft', 'scheduled', 'posted']);
  if (existing && existing.length) {
    revalidatePath('/dang-tin');
    return;
  }

  const versions = (job.jd_versions || {}) as Record<string, string>;
  const baseFb = String(versions.facebook || '').trim();

  // Fallback nếu chưa có bản Facebook (JD cũ hoặc Groq chưa chạy).
  const fallbackContent = (() => {
    const dong = [`Công ty SDVICO tuyển ${job.title}${job.location ? ' tại ' + job.location : ''}.`];
    if (job.short_desc) dong.push('', String(job.short_desc).trim());
    const contactEmail = process.env.HR_CONTACT_EMAIL || 'inoudead@gmail.com';
    dong.push('', `Ứng tuyển: gửi CV về ${contactEmail}. Hotline 1900 23 23 49.`);
    return dong.join('\n');
  })();

  // Đọc cài đặt thương hiệu để gắn footer liên hệ và dùng logo khi không có ảnh.
  const { data: brandRow } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand = (brandRow?.value || {}) as { logo_url?: string; hotline?: string; email?: string; website?: string; company_desc?: string };

  // Rewrite bằng Groq để ra bài tuyển dụng đầy đủ — chạy song song với Unsplash.
  // Dùng bản JD chi tiết nhất (website > job_board > facebook) làm đầu vào.
  // Thất bại thì dùng bản gốc, không làm hỏng luồng.
  const richInput = [versions.website, versions.job_board, versions.facebook]
    .map((v) => String(v || '').trim())
    .filter(Boolean)[0] || fallbackContent;

  const [noi_dung_raw, unsplash_url] = await Promise.all([
    groqChat(
      [
        'Bạn là chuyên gia viết tuyển dụng cho Facebook của ngành biển và thủy sản Việt Nam.',
        'Nhiệm vụ: viết bài tuyển dụng đầy đủ thông tin, người đọc hiểu rõ vị trí ngay trên newsfeed.',
        '',
        'Cấu trúc bài (theo đúng thứ tự, không thêm tiêu đề phần):',
        '1. Hook 1-2 câu ngắn khơi gợi cảm xúc hoặc tò mò',
        '2. Vị trí tuyển và địa điểm (ví dụ: Kỹ sư điện — Vũng Tàu)',
        '3. Yêu cầu chính: 3-5 gạch đầu dòng "-", lấy từ bản gốc, ngắn gọn',
        '4. Quyền lợi hoặc điểm nổi bật nếu có trong bản gốc — bỏ qua nếu không có',
        '5. Cách ứng tuyển: gửi CV về email hoặc hotline (lấy từ bản gốc nếu có)',
        '6. 2-3 hashtag tiếng Việt phù hợp ngành',
        '',
        'Quy tắc cứng:',
        '- Không bịa lương, thưởng, phúc lợi, số liệu không có trong bản gốc',
        '- Không bắt đầu bằng tên công ty hay "SDVICO tuyển"',
        '- Câu ngắn, xuống dòng nhiều, viết như người thật nói chuyện',
        '- 1-2 emoji tự nhiên nếu hợp',
        '- Độ dài 150-220 từ',
        '- Trả về nội dung bài đăng, không kèm giải thích',
      ].join('\n'),
      richInput,
      { temperature: 0.75, maxTokens: 600 }
    ).then((r) => r?.trim() || baseFb || fallbackContent),
    fetchUnsplashPhoto(job.title, job.location || undefined, (job as Record<string, unknown>).image_hint as string | null),
  ]);

  // Gắn footer liên hệ thương hiệu vào cuối bài (không ghi đè bởi Groq).
  const footerParts = [
    brand.hotline ? `Hotline: ${brand.hotline}` : null,
    brand.email ? `Email: ${brand.email}` : null,
    brand.website ? brand.website : null,
  ].filter(Boolean);
  const footer = footerParts.length ? '\n\n' + footerParts.join('  |  ') : '';
  const noi_dung = noi_dung_raw + footer;

  // Ghép logo lên ảnh Unsplash nếu cả hai đều có, upload kết quả lên Storage.
  // Không có Unsplash thì dùng logo đơn thuần. Không có logo thì dùng Unsplash gốc.
  let image_url: string | null = null;
  if (unsplash_url && brand.logo_url) {
    try {
      const composited = await overlayLogo(unsplash_url, brand.logo_url, 'southeast');
      const imgPath = `posts/${jobId}/fb-${Date.now()}.jpg`;
      const { error: upErr } = await client.storage
        .from('post-images')
        .upload(imgPath, composited, { contentType: 'image/jpeg', upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(imgPath);
        image_url = publicUrl;
      } else {
        image_url = unsplash_url; // fallback: ảnh gốc không có logo
      }
    } catch {
      image_url = unsplash_url; // fallback khi ghép thất bại
    }
  } else {
    image_url = unsplash_url || brand.logo_url || null;
  }

  const tieu_de = `Tuyển ${job.title}${job.location ? ' - ' + job.location : ''}`;

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .insert({ job_id: jobId, kenh: 'facebook', tieu_de, noi_dung, image_url, trang_thai: 'draft' })
    .select('id')
    .single();
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await client.from('approval_queue').insert({
    kind: 'hr_job_post',
    title: tieu_de,
    payload: { post_id: post.id, job_id: jobId, kenh: 'facebook', dia_diem: job.location || null, body: noi_dung },
    ref_table: 'hr_job_posts',
    ref_id: post.id,
    status: 'pending'
  });
  if (e2) throw new Error(e2.message);

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Sửa nội dung, hình ảnh, giờ đặt đăng trước khi duyệt. Người sửa là người kiểm soát (điều cấm 1).
// Đồng bộ cả bản xem trong hàng đợi để trang Duyệt không lệch với nội dung sẽ đăng.
// Ảnh: file từ máy ưu tiên hơn URL nhập tay. Cả hai đều tuỳ chọn.
export async function editJobPostDraft(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  const noi_dung = String(formData.get('noi_dung') || '');
  const imageUrlInput = String(formData.get('image_url') || '').trim() || null;
  const imageFile = formData.get('image_file') as File | null;
  const scheduledRaw = String(formData.get('scheduled_at') || '').trim();
  const fbPostLink = String(formData.get('fb_post_link') || '').trim();
  const parsedFbPostId = parseFbPostId(fbPostLink);
  if (!postId) return;

  const scheduled_at = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
  const trang_thai = scheduled_at ? 'scheduled' : 'draft';

  const client = getServerClient();

  // Upload ảnh từ máy lên Supabase Storage nếu người dùng chọn file.
  // File ưu tiên hơn URL nhập tay để tránh xung đột. Thất bại thì giữ nguyên URL cũ.
  let image_url = imageUrlInput;
  if (imageFile && imageFile.size > 0) {
    try {
      const bytes = await imageFile.arrayBuffer();
      const rawExt = imageFile.name.split('.').pop() || 'jpg';
      const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const path = `posts/${postId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await client.storage
        .from('post-images')
        .upload(path, bytes, { contentType: imageFile.type, upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(path);
        image_url = publicUrl;
      } else {
        try { await client.from('run_log').insert({ task: 'upload_post_image', status: 'error', detail: { postId, error: uploadErr.message } }); } catch {}
      }
    } catch (err: unknown) {
      try { await client.from('run_log').insert({ task: 'upload_post_image', status: 'error', detail: { postId, error: String(err) } }); } catch {}
    }
  }
  // Lấy trạng thái và fb_post_id hiện tại để xử lý bài đã đăng khác với nháp.
  const { data: cur } = await client.from('hr_job_posts')
    .select('trang_thai, fb_post_id').eq('id', postId).maybeSingle();

  let updateData: Record<string, unknown>;
  if (cur?.trang_thai === 'posted') {
    // Bài đã đăng: chỉ cập nhật nội dung và hình ảnh, giữ nguyên trạng thái và lịch.
    updateData = { noi_dung, image_url };
    if (parsedFbPostId) updateData.fb_post_id = parsedFbPostId;
  } else {
    updateData = { noi_dung, image_url, scheduled_at, trang_thai };
  }

  const { error } = await client.from('hr_job_posts').update(updateData).eq('id', postId);
  if (error) throw new Error(error.message);

  // Đồng bộ lên Facebook nếu bài đã đăng và có fb_post_id (mới nhập hoặc đã có từ trước).
  // Lỗi thì ghi log nhưng không throw — DB đã cập nhật rồi.
  const activeFbPostId = parsedFbPostId || cur?.fb_post_id;
  if (cur?.trang_thai === 'posted' && activeFbPostId) {
    try {
      await callFacebookEditApi(activeFbPostId, noi_dung);
      await client.from('run_log').insert({ task: 'hr.edit_facebook_post', status: 'ok', detail: { postId, fbPostId: activeFbPostId } });
    } catch (err) {
      await client.from('run_log').insert({ task: 'hr.edit_facebook_post', status: 'error', detail: { postId, error: String(err) } });
    }
  }

  // Đồng bộ bản xem trong hàng đợi duyệt — chỉ khi bài chưa đăng (bài đã đăng không cần duyệt lại).
  if (!cur || cur.trang_thai !== 'posted') {
    const { data: rows } = await client
      .from('approval_queue')
      .select('id, payload')
      .eq('ref_id', postId)
      .eq('kind', 'hr_job_post')
      .eq('status', 'pending');
    for (const row of rows || []) {
      const payload = { ...((row.payload || {}) as Record<string, unknown>), body: noi_dung, image_url };
      await client.from('approval_queue').update({ payload }).eq('id', row.id);
    }
  }

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Helper nội bộ: gỡ một bài đã đăng khỏi Facebook qua Graph API.
// Ném lỗi nếu thất bại — người gọi tự quyết có tiếp tục không.
async function callFacebookDeleteApi(fbPostId: string): Promise<void> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!token) throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN trong biến môi trường.');
  const url = `https://graph.facebook.com/${version}/${fbPostId}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'DELETE', cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

// Helper nội bộ: cập nhật nội dung (message) bài đã đăng trên Facebook.
// Chỉ sửa được text — ảnh đã đăng không thay được qua API. Ném lỗi nếu thất bại.
async function callFacebookEditApi(fbPostId: string, message: string): Promise<void> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!token) throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN trong biến môi trường.');
  const res = await fetch(`https://graph.facebook.com/${version}/${fbPostId}`, {
    method: 'POST',
    body: new URLSearchParams({ message, access_token: token }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
}

// Parse URL bài Facebook hoặc ID thô. Hỗ trợ các định dạng link phổ biến.
// Trả về ID dạng {page_id}_{post_id}, post_id, hoặc photo_id — tuỳ link.
function parseFbPostId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+_\d+$/.test(s)) return s;   // page_id_post_id — dùng nguyên
  if (/^\d+$/.test(s)) return s;        // chỉ số — dùng nguyên
  try {
    const url = new URL(s);
    const story = url.searchParams.get('story_fbid');
    const page  = url.searchParams.get('id');
    if (story && page) return `${page}_${story}`;
    if (story) return story;
    const fbid = url.searchParams.get('fbid');
    if (fbid) return fbid;
    const m = url.pathname.match(/\/(?:posts|permalink)\/(\d+)/);
    if (m) return m[1];
  } catch {}
  return null;
}

// Helper nội bộ: gọi Facebook Graph API để đăng bài. Ném lỗi nếu thất bại.
// Trả về fbPostId (string). Không ghi DB, không revalidate — người gọi chịu.
async function callFacebookApi(post: { tieu_de: string; noi_dung: string; image_url: string | null }): Promise<string> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  if (!pageId || !token) throw new Error('Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN trong biến môi trường Vercel.');
  if (!post.noi_dung) throw new Error('Bài chưa có nội dung.');

  const message = [post.tieu_de, '', post.noi_dung].join('\n').trim();

  if (post.image_url) {
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
      method: 'POST', body: new URLSearchParams({ url: post.image_url, caption: message, access_token: token }), cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      throw new Error(msg + (json.error?.code ? ` (mã ${json.error.code})` : ''));
    }
    return json.post_id || json.id;
  } else {
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/feed`, {
      method: 'POST', body: new URLSearchParams({ message, access_token: token }), cache: 'no-store'
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      throw new Error(msg + (json.error?.code ? ` (mã ${json.error.code})` : ''));
    }
    return json.id;
  }
}

// Đăng ngay lên Facebook sau khi đã được duyệt (điều cấm 1: cổng duyệt đã qua).
// Gọi thẳng Graph API từ server, không chờ worker cron. Chỉ hoạt động khi bài đã approved.
// Lỗi Facebook API được bắt và ghi vào run_log + ghi_chu để người dùng biết nguyên nhân.
export async function publishJobPost(formData: FormData) {
  const postId = String(formData.get('post_id') || '');
  if (!postId) return;

  const client = getServerClient();

  // Cổng an toàn: phải có mục approved trong hàng đợi cho bài này.
  const { data: approved } = await client
    .from('approval_queue')
    .select('id')
    .eq('ref_id', postId)
    .eq('kind', 'hr_job_post')
    .eq('status', 'approved')
    .limit(1);
  if (!approved || approved.length === 0) {
    await client.from('hr_job_posts')
      .update({ trang_thai: 'failed', ghi_chu: 'Bài chưa được duyệt trong hàng đợi.' })
      .eq('id', postId);
    revalidatePath('/dang-tin');
    return;
  }

  const { data: post, error: e1 } = await client
    .from('hr_job_posts')
    .select('id, tieu_de, noi_dung, trang_thai, image_url')
    .eq('id', postId)
    .single();
  if (e1 || !post) { revalidatePath('/dang-tin'); return; }
  if (post.trang_thai === 'posted') { revalidatePath('/dang-tin'); return; }

  try {
    const fbPostId = await callFacebookApi(post);
    const externalUrl = `https://www.facebook.com/${fbPostId}`;
    const { data: saved, error: updateErr } = await client.from('hr_job_posts')
      .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl, fb_post_id: fbPostId, ghi_chu: null })
      .eq('id', postId)
      .select('id, trang_thai, fb_post_id')
      .single();
    if (updateErr) throw new Error(`Lưu DB thất bại: ${updateErr.message}`);
    if (!saved?.fb_post_id) throw new Error(`Cột fb_post_id không được ghi — FB trả: ${fbPostId}. Cần chạy migration 20260813010000_hr_job_posts_fb_post_id.sql trong Supabase.`);
    await client.from('run_log').insert({ task: 'hr.publish_facebook_ui', status: 'ok', detail: { postId, fbPostId, externalUrl } });
  } catch (err: unknown) {
    const errStr = err instanceof Error ? err.message : String(err);
    await client.from('hr_job_posts')
      .update({ trang_thai: 'failed', ghi_chu: errStr })
      .eq('id', postId);
    await client.from('run_log').insert({ task: 'hr.publish_facebook_ui', status: 'error', detail: { postId, error: errStr } });
  }

  revalidatePath('/dang-tin');
  revalidatePath('/');
}

// Tạo bản nháp JD từ thông tin người dùng nhập. AI viết bốn phiên bản, lưu nháp để duyệt.
// Máy soạn, người xác nhận (điều cấm 1). Không đăng, không tự mở tuyển.
export async function createJdDraft(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  if (!title) return;
  const job = {
    title,
    department: String(formData.get('department') || '').trim() || undefined,
    location: String(formData.get('location') || '').trim() || undefined,
    short_desc: String(formData.get('short_desc') || '').trim() || undefined,
    requirements: String(formData.get('requirements') || '').trim() || undefined,
    benefits: String(formData.get('benefits') || '').trim() || undefined,
    nhom: String(formData.get('nhom') || '').trim() || undefined
  };
  const image_hint = String(formData.get('image_hint') || '').trim() || null;
  const { versions } = await composeJdVersions(job);

  const client = getServerClient();
  const { error } = await client.from('hr_jobs').insert({
    title: job.title,
    department: job.department || null,
    location: job.location || null,
    short_desc: job.short_desc || null,
    requirements: job.requirements || null,
    jd_versions: versions,
    nhom: job.nhom || null,
    image_hint,
    status: 'draft'
  });
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Lưu cài đặt thương hiệu công ty: logo, hotline, email, website, mô tả ngắn.
// Dùng để gắn footer liên hệ vào bài đăng Facebook và làm ảnh mặc định khi không có ảnh khác.
// Logo: file từ máy ưu tiên hơn URL nhập tay (upload vào post-images/brand/).
export async function saveBrandConfig(formData: FormData) {
  const logoFile = formData.get('logo_file') as File | null;
  let logo_url = String(formData.get('logo_url') || '').trim() || null;

  const client = getServerClient();

  if (logoFile && logoFile.size > 0) {
    try {
      const bytes = await logoFile.arrayBuffer();
      const rawExt = logoFile.name.split('.').pop() || 'png';
      const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
      const { error: uploadErr } = await client.storage
        .from('post-images')
        .upload(`brand/logo.${ext}`, bytes, { contentType: logoFile.type, upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = client.storage.from('post-images').getPublicUrl(`brand/logo.${ext}`);
        logo_url = publicUrl;
      }
    } catch {}
  }

  const config = {
    logo_url,
    hotline: String(formData.get('hotline') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    website: String(formData.get('website') || '').trim() || null,
    company_desc: String(formData.get('company_desc') || '').trim() || null,
  };
  const { error } = await client.from('app_config').upsert(
    { key: 'brand_config', value: config, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
  revalidatePath('/cai-dat');
}

// Sửa một phiên bản JD của một vị trí. Người sửa là người kiểm soát (điều cấm 1).
export async function editJdVersion(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  const key = String(formData.get('key') || '');
  const value = String(formData.get('value') || '');
  if (!jobId || !key) return;
  const client = getServerClient();
  const { data: job, error: e1 } = await client.from('hr_jobs').select('jd_versions').eq('id', jobId).single();
  if (e1) throw new Error(e1.message);
  const versions = { ...((job.jd_versions || {}) as Record<string, string>), [key]: value };
  const { error: e2 } = await client.from('hr_jobs').update({ jd_versions: versions }).eq('id', jobId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Viết lại bốn phiên bản bằng AI từ thông tin đã lưu của vị trí.
export async function regenerateJd(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { data: job, error: e1 } = await client
    .from('hr_jobs')
    .select('title, department, location, short_desc, requirements, nhom')
    .eq('id', jobId)
    .single();
  if (e1) throw new Error(e1.message);
  const { versions } = await composeJdVersions({
    title: job.title,
    department: job.department || undefined,
    location: job.location || undefined,
    short_desc: job.short_desc || undefined,
    requirements: job.requirements || undefined,
    nhom: job.nhom || undefined
  });
  const { error: e2 } = await client.from('hr_jobs').update({ jd_versions: versions }).eq('id', jobId);
  if (e2) throw new Error(e2.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Hoàn thành: đưa vị trí sang trạng thái đang tuyển, sẵn sàng đăng tin. Chỉ đổi bản còn nháp.
export async function finalizeJd(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs').update({ status: 'open' }).eq('id', jobId).eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
  revalidatePath('/dang-tin');
}

// Xóa một bản nháp JD. Chỉ xóa được bản còn nháp, tránh mất vị trí đang tuyển.
export async function deleteJd(formData: FormData) {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return;
  const client = getServerClient();
  const { error } = await client.from('hr_jobs').delete().eq('id', jobId).eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/tao-jd');
}

// Duyệt và đăng ngay lên Facebook trong một bước, không cần chờ worker cron.
// Điều cấm 1: người bấm Duyệt là cổng kiểm soát. Action này chỉ chạy khi người dùng bấm.
export async function approveAndPublish(formData: FormData) {
  const queueId = String(formData.get('queue_id') || '');
  const postId = String(formData.get('post_id') || '');
  if (!queueId || !postId) return;

  const client = getServerClient();

  // Duyệt trong hàng đợi.
  const { error: approveErr } = await client.from('approval_queue')
    .update({ status: 'approved', decided_at: new Date().toISOString() })
    .eq('id', queueId).eq('status', 'pending');
  if (approveErr) throw new Error(approveErr.message);

  // Đọc bài đăng.
  const { data: post, error: e1 } = await client.from('hr_job_posts')
    .select('id, tieu_de, noi_dung, trang_thai, image_url')
    .eq('id', postId).single();
  if (e1 || !post || post.trang_thai === 'posted') {
    revalidatePath('/'); revalidatePath('/dang-tin'); return;
  }

  // Đăng lên Facebook và cập nhật trạng thái.
  try {
    const fbPostId = await callFacebookApi(post);
    const externalUrl = `https://www.facebook.com/${fbPostId}`;
    const { error: updateErr } = await client.from('hr_job_posts')
      .update({ trang_thai: 'posted', posted_at: new Date().toISOString(), url: externalUrl, fb_post_id: fbPostId, ghi_chu: null })
      .eq('id', postId);
    if (updateErr) throw new Error(`Lưu DB thất bại: ${updateErr.message}`);
    await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'ok', detail: { postId, fbPostId, externalUrl } });
  } catch (err: unknown) {
    const errStr = err instanceof Error ? err.message : String(err);
    await client.from('hr_job_posts').update({ trang_thai: 'failed', ghi_chu: errStr }).eq('id', postId);
    await client.from('run_log').insert({ task: 'hr.approve_and_publish', status: 'error', detail: { postId, error: errStr } });
  }

  revalidatePath('/');
  revalidatePath('/dang-tin');
}

// Duyệt và đặt lịch đăng. Worker cron sẽ đăng khi đến giờ (chạy mỗi 5 phút).
// Nhận minutes (X phút sau) hoặc scheduled_at (giờ cụ thể dạng ISO hoặc datetime-local).
export async function approveAndSchedule(formData: FormData) {
  const queueId = String(formData.get('queue_id') || '');
  const postId = String(formData.get('post_id') || '');
  const minutesStr = String(formData.get('minutes') || '');
  const scheduledRaw = String(formData.get('scheduled_at') || '').trim();
  if (!queueId || !postId) return;

  let scheduled_at: string;
  if (scheduledRaw) {
    scheduled_at = new Date(scheduledRaw).toISOString();
  } else {
    const minutes = Math.max(1, parseInt(minutesStr, 10) || 30);
    scheduled_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }

  const client = getServerClient();

  await client.from('approval_queue')
    .update({ status: 'approved', decided_at: new Date().toISOString() })
    .eq('id', queueId).eq('status', 'pending');

  await client.from('hr_job_posts')
    .update({ scheduled_at, trang_thai: 'scheduled' })
    .eq('id', postId).neq('trang_thai', 'posted');

  revalidatePath('/');
  revalidatePath('/dang-tin');
}
