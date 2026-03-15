import crypto from 'crypto';
import { config } from '../core/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

function getEncryptionKey(): Buffer {
  const key = Buffer.from(config.encryption.key, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex chars (${KEY_LENGTH} bytes)`);
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a colon-delimited string: iv:tag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypts a string produced by encrypt().
 * Input format: iv:tag:ciphertext (hex-encoded, colon-delimited).
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  const [ivHex, tagHex, ciphertextHex] = parts as [string, string, string];

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('Invalid encrypted data: wrong IV or tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

/**
 * Generates a cryptographically secure API key with a prefix.
 * Returns { key, hash } where key is shown once and hash is stored.
 */
export function generateApiKey(prefix = 'voa'): { key: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const key = `${prefix}_${raw}`;
  const hash = hashApiKey(key);
  return { key, hash };
}

/**
 * Hashes an API key for secure storage using HMAC-SHA256.
 */
export function hashApiKey(key: string): string {
  return crypto.createHmac('sha256', config.apiKey.salt).update(key).digest('hex');
}
