import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function getKey() {
  const encodedKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be configured.");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const bytes = Buffer.from(payload, "base64");
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const encrypted = bytes.subarray(28);
  const decipher = createDecipheriv(algorithm, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
