import { HttpError, productEnv } from "./runtime";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function encryptionKey() {
  const encoded = productEnv().APP_ENCRYPTION_KEY;
  if (!encoded) throw new HttpError(503, "Model credential storage is not configured.");
  const bytes = fromBase64(encoded);
  if (bytes.byteLength !== 32) throw new HttpError(503, "Model credential key is invalid.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new HttpError(500, "Stored model credential is unreadable.");
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivText) },
      await encryptionKey(),
      fromBase64(cipherText),
    );
    return decoder.decode(decrypted);
  } catch {
    throw new HttpError(500, "Stored model credential cannot be decrypted.");
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
