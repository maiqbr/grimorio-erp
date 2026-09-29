import type { VaultItem } from "../src/types";
import { vaultItemSchema, vaultStoredSchema } from "./validation";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function importVaultKey(secret: string | undefined) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(32));
  for (let index = 0; index < 32; index += 1)
    bytes[index] = Number.parseInt(secret.slice(index * 2, index * 2 + 2), 16);
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptVaultItem(item: VaultItem, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(item.id) },
    key,
    encoder.encode(JSON.stringify(item)),
  );
  return vaultStoredSchema.parse({
    id: item.id,
    kind: "vault",
    version: 1,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptVaultItem(raw: unknown, key: CryptoKey) {
  const stored = vaultStoredSchema.parse(raw);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(stored.iv),
      additionalData: encoder.encode(stored.id),
    },
    key,
    fromBase64(stored.ciphertext),
  );
  const item = vaultItemSchema.parse(JSON.parse(decoder.decode(plaintext)));
  if (item.id !== stored.id) throw new Error("Credencial inválida.");
  return item;
}
