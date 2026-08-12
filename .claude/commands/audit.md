---
description: Tự audit project theo 13 nguyên tắc ai-simple-product-dev → điểm theo applicability + backlog tối ưu xếp hạng (chạy mỗi quý hoặc khi nghi hệ docs đang mục)
argument-hint: [trống = full audit | tên nguyên tắc để audit riêng, vd "06" hoặc "ops"]
---

Bạn là auditor READ-ONLY (không edit, không commit). Audit project này theo phương pháp ai-simple-product-dev, scope: $ARGUMENTS (trống = full).

## Bước 0 — Applicability trước, điểm sau

Với mỗi nguyên tắc, xác định trước: **APPLICABLE** (project có trigger tương ứng — chấm bình thường) / **NOT_APPLICABLE** (vd không đa-repo → 10 N/A, không process nền → 11 N/A, không session song song → 13 N/A; KHÔNG trừ điểm oan) / **DEFERRED** (nguyên tắc applicable nhưng cơ chế chưa build — vd 13 khi CLI parallel chưa tồn tại, vòng B/C của 12 khi chưa có dữ liệu learning event — ghi DEFERRED, KHÔNG chấm vòng lặp không tồn tại). Điểm cuối = `earned / applicable_max × 100` — không dùng mẫu số cố định.

## Bước 1 — Chấm các nguyên tắc APPLICABLE bằng SỐ ĐO, không cảm tính

Với mỗi nguyên tắc, chấm 0–10 **neo vào sub-metric deterministic** (lệnh + kết quả phải ghi kèm; metric nào không đo được thì ghi N/A — KHÔNG chấm cảm tính bù vào). Lý do: điểm LLM dao động giữa các lần chạy; chỉ số đo mới so sánh được giữa các quý.

| # | Nguyên tắc | Đo bằng |
|---|---|---|
| 01 | Hierarchical context | `wc -c CLAUDE.md` vs budget 24000; đếm module > 5 file thiếu CLAUDE.md |
| 02 | App-map | đếm file app-map (> 20 → cần domain hóa?); file > 1500 dòng; thiếu "Load khi"/last-updated |
| 03 | Context routing | `.claude/commands` + `agents` tồn tại; keyword map còn khớp domain thật? |
| 04 | Doc+Test sync | doc-lag từ `doc-health-report` (số doc SUSPECT + max lag ngày); escaped-drift: đếm dòng mới trong `docs/.escaped-drift.log` kỳ này — mỗi dòng phải đã thành pattern hook; spot-check 3 commit `re-verify(...)` gần nhất: message có ghi claims thật không (bump không claims = red flag rubber-stamp) |
| 05 | LOGIC vs REQUEST | rule có trong CLAUDE.md/memory không |
| 06 | Risk tiers | CLAUDE.md có bảng tier chưa; còn rule "confirm mọi thứ" sót lại không |
| 07 | Memory | memory files có entry nào stale/sai so với code hiện tại |
| 08 | Enforcement | hook cài versioned chưa (`git config core.hooksPath`); `--self-test` pass? |
| 09 | Generated docs | `_generated/` tồn tại? cũ hơn migrations? (`git log -1 --format=%ct`) |
| 10 | Contracts | mọi schema chia sẻ liên repo có contract? consumers list còn đúng? |
| 11 | Ops | mọi process chạy nền có runbook? fire-drill: CHỈ chạy lệnh trong mục "Health check" của runbook, BỎ QUA mọi lệnh có side effect (ghi state, mutate, gọi API tốn quota) — ghi kết quả từng lệnh |
| 12 | Self-optimization | **Vòng A**: `docs/audit-history.md` có entry kỳ trước? backlog kỳ trước đã xử lý chưa? `docs/.fl-routing-log` đang được append? Doc MỒ CÔI (→ RETIRE)? Doc lạnh 90 ngày mà chủ thể còn sống → check router keyword map, KHÔNG đề xuất xóa. **Vòng B/C (v3)** — nguồn: `docs/learning/events.jsonl` (không có file → DEFERRED): (a) **survival** per event đủ tuổi N (mặc định 5 session/14 ngày VÀ ≥ 2 session hoạt động trong khoảng đó — đếm session qua timestamp `docs/.fl-routing-log` hoặc `events.jsonl`; repo im ắng → survival KHÔNG tính): `git log --oneline <accepted_sha>.. -- <changed_paths>` — rỗng = sống sót; (b) correction rate = số commit user sửa ngược vùng của rule active; (c) **spot-check 3 event gần nhất**: `git cat-file -e <sha>` từng SHA + `git diff --name-only <base>..<accepted>` khớp `changed_paths` — SHA ma/paths lệch = event bịa, finding nghiêm trọng; NGOẠI LỆ event parallel: chỉ spot-check SHA cấp run (đã remap) — trường `lot_sha_pre_rebase` có thể đã bị gc sau rebase, KHÔNG phải bằng chứng bịa; (d) active learned rules có `last_verified` + rollback condition không |
| 13 | Parallel sessions | CLI `ai-simple parallel` tồn tại chưa? CHƯA → DEFERRED (chỉ check phần ACTIVE: có vi phạm tầng-0 nào ghi nhận không — stash/reset đè dirty work). CÓ → claims STALE/orphan (branch không còn), worker có commit global generated/lockfile không (`git log` trên `_generated/`+lockfile từ branch `lot/*`), integration branch cũ đã dọn chưa |

### Rubric neo điểm (điểm = TÍNH từ metric, LLM chỉ điều chỉnh ±1 kèm lý do ghi rõ)

| Metric trạng thái | Điểm nguyên tắc liên quan |
|---|---|
| Xanh hoàn toàn (vd doc-lag 0, hook self-test PASS, budget < 80%) | 9–10 |
| Có vấn đề nhỏ trong ngưỡng (lag ≤ 7d, 1-2 lint WARN) | 6–8 |
| Vượt ngưỡng (lag > 7d, ORPHANED > 0, budget vượt, self-test FAIL) | 3–5 |
| Cơ chế không tồn tại / không đo được dù phải có | 0–2 |

## Bước 2 — Semantic verify (doc nói có khớp code không)

Chọn 3 doc theo **hotspot = tần suất được route (đếm trong `docs/.fl-routing-log`) × tần suất code trong `covers` đổi (git log)** — doc nóng trên code động là nơi sai gây hại nhất. Lưu ý: doc có covers đã được cổng ghi/đọc bảo vệ theo sự kiện; bước này ưu tiên doc KHÔNG có covers (decision/vision) + top hotspot. Với mỗi doc:
- Trích 5–10 KHẲNG ĐỊNH kiểm chứng được (vd "bảng X có RLS owner-only", "route /admin chỉ role admin")
- Đối chiếu từng khẳng định với `_generated/schema.md` + source code thật
- Liệt kê: ĐÚNG / SAI / KHÔNG KIỂM ĐƯỢC — khẳng định SAI là phát hiện nghiêm trọng nhất của audit

## Bước 3 — Đối chiếu bảng tín hiệu→hành động (nguyên tắc 12)

Duyệt bảng tín hiệu trong `methodology/12-self-optimization.md` (hoặc bản project): tín hiệu nào ĐANG bắn mà chưa có hành động.

## Bước 4 — Output (format BẮT BUỘC)

```markdown
## Audit <project> — <YYYY-MM-DD>
Điểm: NN/100 = earned <e> / applicable_max <m> × 100 (kỳ trước: NN — trend ↑/↓)
Applicability: <k> APPLICABLE, <k> NOT_APPLICABLE (<số hiệu>), <k> DEFERRED (<số hiệu>)
Metric deterministic: doc-lag <n/max>, ORPHANED <n>, covers-coverage <x%>, budget <chars>, hook self-test <pass/fail>
(Kết luận "hệ đang mục" CHỈ khi metric deterministic cũng xấu đi — điểm LLM đơn lẻ không đủ làm trend)

### Điểm theo nguyên tắc
| # | Điểm | Bằng chứng 1 dòng |

### Khẳng định SAI trong docs (semantic verify)
- <doc>: "<khẳng định>" — thực tế: <code nói gì> → REBUILD/UPDATE?

### Backlog tối ưu (xếp theo tác động/effort)
| Ưu tiên | Việc | Loại (UPDATE/REFACTOR/REBUILD/RETIRE) | Effort | Deadline đề xuất |

### 1 việc đáng làm NGAY
<việc có tác động/effort tốt nhất, kèm lệnh/file cụ thể>
```

Cuối cùng: append 1 dòng tóm tắt `<date> | <score>/100 (applicable: <k>) | <top issue>` vào `docs/audit-history.md` (file DUY NHẤT audit được phép ghi — log append-only, cố ý nằm ngoài `_generated/` vì không regenerate được từ source).
