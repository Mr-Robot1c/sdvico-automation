// Điểm vào của packages/core. Viết một lần, cả phần Tuyển dụng và Marketing dùng chung.
export { getEnv } from './env.js';
export { getServiceClient } from './supabase.js';
export { logRun } from './run-log.js';
export { pushApproval, decideApproval } from './approval.js';
export { getCounter, incrementDailyCounter, todayVN } from './quota.js';
export { isStopped, assertNotStopped, setEmergencyStop } from './emergency-stop.js';
export { runBrowserFlow, humanType, randomDelay, BarrierError } from './browser-runner.js';
