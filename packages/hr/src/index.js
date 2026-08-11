// Điểm vào của packages/hr. Gom các hàm dùng lại cho phần Tuyển dụng.
export { JD_CHANNELS, JD_CHANNEL_KEYS, validateJdVersions } from './jd/channels.js';
export {
  normalizeCv,
  normalizeEmail,
  normalizePhone,
  findEmail,
  findPhone,
  guessName,
  buildDedupKey
} from './intake/normalize.js';
export { detectKind, extractText } from './intake/extract.js';
export { upsertCandidate, ensureApplication } from './intake/candidates.js';
export { ensureBucket, uploadCv, CV_BUCKET } from './intake/storage.js';
export { getMailConfig, withMailbox, fetchRecentCvMessages, fetchUnseenCvMessages, markSeen } from './intake/mailbox.js';
export { loadProcessed, saveProcessed } from './intake/seen.js';
// Chấm CV
export { DEFAULT_RUBRIC, pickRubric, weightedScore, totalWeight } from './screen/rubric.js';
export { anonymizeCv } from './screen/anonymize.js';
export { scoreCv } from './screen/score.js';
export { fetchUnscored, saveScore } from './screen/applications.js';
// Phỏng vấn và thư mời
export { proposeSlots } from './interview/slots.js';
export { WORK_TIMES, buildGrid, allocateSlots, loadTakenSlots } from './interview/schedule.js';
export { generateInterview } from './interview/generate.js';
export { composeLetter, composeTakeHome, numberList } from './interview/compose.js';
export { fetchForInterview } from './interview/applications.js';
