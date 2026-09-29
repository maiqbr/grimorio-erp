import { describe, expect, it } from "vitest";
import {
  decryptVaultItem,
  encryptVaultItem,
  importVaultKey,
} from "../worker/vault";
import { backupRecordSchema } from "../worker/validation";
import type { VaultItem } from "../src/types";

const item: VaultItem = {
  id: "vault_11111111-1111-4111-8111-111111111111",
  kind: "password",
  name: "Conta principal",
  value: "segredo-muito-sensivel",
  username: "pessoa@example.com",
  website: "example.com",
  notes: "Nota privada",
  favorite: true,
  createdAt: "2026-09-25T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
};

describe("encrypted credentials", () => {
  it("stores only ciphertext and restores through the backup schema", async () => {
    const key = await importVaultKey("ab".repeat(32));
    expect(key).not.toBeNull();
    const stored = await encryptVaultItem(item, key!);
    const data = JSON.stringify(stored);
    expect(data).not.toContain(item.value);
    expect(data).not.toContain(item.username);
    expect(data).not.toContain(item.notes);
    expect(backupRecordSchema.parse(stored)).toEqual(stored);
    expect(await decryptVaultItem(stored, key!)).toEqual(item);
  });

  it("rejects a wrong key or modified ciphertext", async () => {
    const key = (await importVaultKey("ab".repeat(32)))!;
    const other = (await importVaultKey("cd".repeat(32)))!;
    const stored = await encryptVaultItem(item, key);
    await expect(decryptVaultItem(stored, other)).rejects.toThrow();
    await expect(
      decryptVaultItem(
        { ...stored, id: "vault_22222222-2222-4222-8222-222222222222" },
        key,
      ),
    ).rejects.toThrow();
  });

  it("rejects a missing or malformed encryption secret", async () => {
    expect(await importVaultKey(undefined)).toBeNull();
    expect(await importVaultKey("short")).toBeNull();
  });
});
