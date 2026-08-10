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
export { getMailConfig, withMailbox, fetchUnseenCvMessages, markSeen } from './intake/mailbox.js';
