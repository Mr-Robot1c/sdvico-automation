-- 27/8 dot 2 redesign (docx "redesign web" cua sep): AI DATA 2 cham diem tri thuc public
-- theo TIER S/A/B/C nhu Trending Digest cua ForLife:
--   score            0-100 (do dung duoc cho content marketing ngu dan)
--   tier             'S' >= 80 | 'A' >= 60 | 'B' >= 40 | 'C' < 40
--   angle            goc tiep can goi y + diem, vd "specific_story (9/10)"
--   key_message      1 cau thong diep chinh de viet bai
--   keywords         jsonb array 3-5 tu khoa tieng Viet
--   plan_suggestions jsonb array [{time:"HH:MM", kind:"article|seed|video_short|blog", title}]
-- Cot nullable — dong cu chua cham diem tier IS NULL, cron cham dan moi luot.

alter table public.mkt_knowledge_public
  add column if not exists score int,
  add column if not exists tier text,
  add column if not exists angle text,
  add column if not exists key_message text,
  add column if not exists keywords jsonb,
  add column if not exists plan_suggestions jsonb;

create index if not exists mkt_knowledge_public_tier_idx
  on public.mkt_knowledge_public (tier, created_at desc);
