import crypto from 'crypto';

export function generateJobId() {
  return `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function generateRowId() {
  return crypto.randomUUID();
}
