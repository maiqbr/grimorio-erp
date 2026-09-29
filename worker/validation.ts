import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1, "Informe um título.").max(200);
const date = z
  .string()
  .refine(
    (v) =>
      !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))),
    "Data inválida",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const recordSchema = z.discriminatedUnion("kind", [
  z.object({
    id,
    kind: z.literal("task"),
    title,
    description: z.string().max(20000),
    projectId: z.string().max(100),
    status: z.string().min(1).max(80),
    priority: z.enum(["low", "medium", "high"]),
    due: date,
    time: z
      .string()
      .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    tags: z.string().max(500),
    checklist: z
      .array(
        z.object({ id, text: z.string().min(1).max(500), done: z.boolean() }),
      )
      .max(100),
    repeat: z.enum(["none", "daily", "weekly", "monthly"]),
    mailId: id.optional(),
    position: z.number().finite().optional(),
  }),
  z.object({
    id,
    kind: z.literal("project"),
    title,
    description: z.string().max(20000),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    columns: z
      .array(z.string().trim().min(1).max(80))
      .min(2)
      .max(10)
      .refine(
        (c) => new Set(c).size === c.length,
        "As etapas precisam ter nomes diferentes.",
      ),
  }),
  z
    .object({
      id,
      kind: z.literal("event"),
      title,
      date: date.refine(Boolean),
      time,
      endTime: time,
      description: z.string().max(20000),
    })
    .refine((v) => v.endTime > v.time, "O término deve ser depois do início."),
  z.object({
    id,
    kind: z.literal("note"),
    title,
    body: z.string().max(50000),
    projectId: z.string().max(100),
  }),
  z.object({
    id: z.literal("preferences"),
    kind: z.literal("settings"),
    name: title,
    accent: z.enum(["violet", "gold"]),
    compact: z.boolean(),
    showCompleted: z.boolean(),
    signatureName: title.optional(),
    signatureText: z.string().trim().min(1).max(5000).optional(),
    signatureShowLogo: z.boolean().optional(),
    language: z.enum(["pt-BR", "en", "es"]).optional(),
    theme: z.string().max(100).optional(),
    customThemes: z
      .array(
        z.object({
          id: id,
          name: title,
          colors: z.object(
            Object.fromEntries(
              [
                "background",
                "sidebar",
                "surface",
                "surfaceRaised",
                "field",
                "border",
                "text",
                "muted",
                "accent",
                "accentText",
                "button",
                "buttonText",
              ].map((key) => [key, z.string().regex(/^#[0-9a-f]{6}$/i)]),
            ) as Record<string, z.ZodString>,
          ),
        }),
      )
      .max(20)
      .optional(),
    iconUrl: z
      .string()
      .regex(/^\/api\/branding\/icon\/[a-f0-9-]+$/)
      .optional(),
    logoUrl: z
      .string()
      .regex(/^\/api\/branding\/logo\/[a-f0-9-]+$/)
      .optional(),
    avatarUrl: z
      .string()
      .regex(/^\/api\/branding\/avatar\/[a-f0-9-]+$/)
      .optional(),
  }),
]);
export const vaultInputSchema = z.object({
  kind: z.enum(["password", "key"]),
  name: title,
  value: z.string().min(1, "Informe a senha ou chave.").max(10000),
  username: z.string().max(320),
  website: z.string().max(2000),
  notes: z.string().max(20000),
  favorite: z.boolean(),
});
export const vaultItemSchema = vaultInputSchema.extend({
  id: z.string().regex(/^vault_[a-f0-9-]{36}$/),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const vaultStoredSchema = z.object({
  id: z.string().regex(/^vault_[a-f0-9-]{36}$/),
  kind: z.literal("vault"),
  version: z.literal(1),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
  ciphertext: z
    .string()
    .min(24)
    .max(80000)
    .regex(/^[A-Za-z0-9+/]+=*$/),
});
export const backupRecordSchema = z.union([recordSchema, vaultStoredSchema]);
export const draftSchema = z.object({
  id,
  sender: z.email().max(320),
  recipient: z.string().max(320),
  subject: z.string().max(200),
  body: z.string().max(100000),
  reply_to: z.string().max(998).optional(),
});
export const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function signature(text: string, logoUrl?: string) {
  const links =
    /https?:\/\/[^\s<>"']+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi;
  let content = "";
  let cursor = 0;
  for (const match of text.matchAll(links)) {
    const index = match.index ?? 0;
    content += escapeHtml(text.slice(cursor, index)).replace(/\n/g, "<br>");
    const label = match[0];
    const href = /^https?:\/\//i.test(label) ? label : `https://${label}`;
    content += `<a style="color:#d6aa60" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    cursor = index + label.length;
  }
  content += escapeHtml(text.slice(cursor)).replace(/\n/g, "<br>");
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="120" alt="Logo" style="display:block;max-width:120px;margin-bottom:14px"/>`
    : "";
  return `<table role="presentation" style="margin-top:28px;background:#181411;border:1px solid #493a29;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;color:#f1e3c4"><tr><td style="padding:20px">${logo}<div style="line-height:1.6">${content}</div></td></tr></table>`;
}
export function allowLocal(request: Request, enabled?: string) {
  return (
    enabled === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  );
}
export function mailAddresses(domain?: string) {
  const normalized = domain?.toLowerCase();
  const valid = normalized && normalized.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(normalized);
  return valid
    ? { inbox: `contact@${normalized}`, noReply: `no-reply@${normalized}` }
    : { inbox: "", noReply: "" };
}
export function acceptRecipient(recipient: string, domain?: string) {
  const { inbox } = mailAddresses(domain);
  return !!inbox && recipient.toLowerCase() === inbox;
}
