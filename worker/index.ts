import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import PostalMime from "postal-mime";
import { z } from "zod";
import {
  acceptRecipient,
  mailAddresses,
  allowLocal,
  backupRecordSchema,
  draftSchema,
  escapeHtml,
  recordSchema,
  signature,
  vaultInputSchema,
} from "./validation";
import { decryptVaultItem, encryptVaultItem, importVaultKey } from "./vault";
import { nextDue } from "../src/lib";
import {
  defaultColumns,
  signatureTextFor,
  type Task,
  type Project,
  type Settings,
  type VaultItem,
} from "../src/types";
type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  LOCAL_DEVELOPMENT?: string;
  APP_ORIGIN: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  MAIL_ENABLED?: string;
  MAIL_DOMAIN?: string;
  OUTLOOK_ICS_URL?: string;
  VAULT_ENCRYPTION_KEY?: string;
};
type MailRow = {
  id: string;
  folder: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  received_at: string;
  unread: number;
  message_id: string | null;
  reply_to: string | null;
  attachments: string;
  provider_id: string | null;
  send_state: string;
  send_payload: string | null;
};
type FileMeta = {
  id: string;
  filename: string;
  size: number;
  contentType: string;
};
const app = new Hono<{ Bindings: Env }>();
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!allowLocal(c.req.raw, c.env.LOCAL_DEVELOPMENT)) {
    const domain = c.env.ACCESS_TEAM_DOMAIN;
    if (!domain || !c.env.ACCESS_AUD || !c.env.OWNER_EMAIL)
      return c.json({ error: "Acesso privado ainda não configurado." }, 503);
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain))
      return c.json({ error: "Configuração de acesso inválida." }, 503);
    try {
      if (!keys.has(domain))
        keys.set(
          domain,
          createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`)),
        );
      const { payload } = await jwtVerify(
        c.req.header("Cf-Access-Jwt-Assertion") || "",
        keys.get(domain)!,
        { issuer: `https://${domain}`, audience: c.env.ACCESS_AUD },
      );
      if (
        typeof payload.email !== "string" ||
        payload.email.toLowerCase() !== c.env.OWNER_EMAIL.toLowerCase()
      )
        return c.json({ error: "Acesso não autorizado." }, 403);
    } catch {
      return c.json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }
  }
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("Origin") !== c.env.APP_ORIGIN
  )
    return c.json({ error: "Origem não autorizada." }, 403);
  if (Number(c.req.header("Content-Length") || 0) > 8 * 1024 * 1024)
    return c.json({ error: "Arquivo muito grande." }, 413);
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  if (path.startsWith("/api/")) c.header("Cache-Control", "no-store");
});
app.onError((error, c) => {
  if (error instanceof z.ZodError)
    return c.json(
      { error: error.issues[0]?.message || "Dados inválidos." },
      400,
    );
  return c.json({ error: "Não foi possível concluir. Tente novamente." }, 500);
});
app.get("/api/status", async (c) => {
  let outlookLastSyncedAt = "";
  try {
    const saved = await c.env.DB.prepare(
      "SELECT data FROM integrations WHERE provider = 'outlook_ics'",
    ).first<{ data: string }>();
    outlookLastSyncedAt = saved ? JSON.parse(saved.data).syncedAt || "" : "";
  } catch {}
  return c.json({
    local: allowLocal(c.req.raw, c.env.LOCAL_DEVELOPMENT),
    mailAddresses: mailAddresses(c.env.MAIL_DOMAIN),
    mailEnabled:
      c.env.MAIL_ENABLED === "true" &&
      !!mailAddresses(c.env.MAIL_DOMAIN).inbox &&
      !!c.env.RESEND_API_KEY &&
      !allowLocal(c.req.raw, c.env.LOCAL_DEVELOPMENT),
    outlookLastSyncedAt,
  });
});
type OutlookEvent = {
  id: string;
  kind: "event";
  title: string;
  date: string;
  time: string;
  endTime: string;
  description: string;
};
const outlookParserVersion = 3;
function shortId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function icsDate(raw: string) {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
}
function eventDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
function recurringDates(
  start: Date,
  rrule: string | undefined,
  from: Date,
  until: Date,
) {
  if (!rrule) return [start];
  const rule = Object.fromEntries(
    rrule.split(";").map((part) => part.split("=", 2)),
  );
  const frequency = rule.FREQ;
  if (
    !frequency ||
    !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(frequency)
  )
    return [start];
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const countLimit = Number(rule.COUNT) || Number.MAX_SAFE_INTEGER;
  const ruleUntil = rule.UNTIL ? icsDate(rule.UNTIL) : null;
  const end = ruleUntil && ruleUntil < until ? ruleUntil : until;
  const dates: Date[] = [];
  const weekdayIndex: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };
  const weekdays = (rule.BYDAY || "")
    .split(",")
    .filter(Boolean)
    .flatMap((day: string) => {
      const index = weekdayIndex[day.slice(-2)];
      return index === undefined ? [] : [index];
    });
  let occurrence = 0;
  let cursor = new Date(start);
  const push = (date: Date) => {
    occurrence += 1;
    if (occurrence <= countLimit && date >= from && date <= end)
      dates.push(new Date(date));
  };
  if (frequency === "DAILY" || frequency === "WEEKLY") {
    while (cursor <= end && occurrence < countLimit) {
      const daysSinceStart = Math.floor(
        (cursor.getTime() - start.getTime()) / 86_400_000,
      );
      const weeklyMatch =
        frequency !== "WEEKLY" ||
        (Math.floor(daysSinceStart / 7) % interval === 0 &&
          (weekdays.length
            ? weekdays.includes(cursor.getDay())
            : cursor.getDay() === start.getDay()));
      if (
        (frequency === "DAILY" && daysSinceStart % interval === 0) ||
        weeklyMatch
      )
        push(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }
  while (cursor <= end && occurrence < countLimit) {
    push(cursor);
    if (frequency === "MONTHLY") cursor.setMonth(cursor.getMonth() + interval);
    else cursor.setFullYear(cursor.getFullYear() + interval);
  }
  return dates;
}
async function syncOutlook(env: Env) {
  const url = env.OUTLOOK_ICS_URL;
  if (!url) throw new Error("Calendário ICS não configurado.");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS integrations (provider TEXT PRIMARY KEY, data TEXT NOT NULL)",
  ).run();
  const saved = await env.DB.prepare(
    "SELECT data FROM integrations WHERE provider = 'outlook_ics'",
  ).first<{ data: string }>();
  let savedData: {
    etag?: string | null;
    syncedAt?: string;
    parserVersion?: number;
  } = {};
  try {
    savedData = saved ? JSON.parse(saved.data) : {};
  } catch {}
  const etag =
    savedData.parserVersion === outlookParserVersion
      ? savedData.etag || undefined
      : undefined;
  const response = await fetch(url, {
    headers: {
      Accept: "text/calendar",
      ...(etag ? { "If-None-Match": etag } : {}),
    },
  });
  const syncedAt = new Date().toISOString();
  if (response.status === 304) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO integrations (provider,data) VALUES ('outlook_ics',?)",
    )
      .bind(
        JSON.stringify({
          ...savedData,
          parserVersion: outlookParserVersion,
          syncedAt,
        }),
      )
      .run();
    return { count: 0, unchanged: true, syncedAt };
  }
  if (!response.ok) throw new Error("Não foi possível ler o calendário.");
  const text = (await response.text()).replace(/\r?\n[ \t]/g, "");
  const now = new Date();
  const rangeStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 30,
  );
  const rangeEnd = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate(),
    23,
    59,
  );
  const blocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const events = blocks.flatMap((block) => {
    const value = (key: string) =>
      block
        .match(new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "m"))?.[1]
        ?.replace(/\\n/g, " ")
        .trim();
    const uid = value("UID"),
      start = value("DTSTART"),
      end = value("DTEND"),
      title = value("SUMMARY");
    if (!uid || !start || !title) return [];
    const firstOccurrence = icsDate(start);
    if (!firstOccurrence) return [];
    const excluded = new Set(
      [...block.matchAll(/^EXDATE(?:;[^:]*)?:(.*)$/gm)].flatMap((match) =>
        match[1]
          .split(",")
          .map(
            (date) =>
              eventDate(icsDate(date) || firstOccurrence).date +
              eventDate(icsDate(date) || firstOccurrence).time,
          ),
      ),
    );
    const endTime =
      end && icsDate(end)
        ? eventDate(icsDate(end)!).time
        : eventDate(firstOccurrence).time;
    return recurringDates(firstOccurrence, value("RRULE"), rangeStart, rangeEnd)
      .filter(
        (occurrence) =>
          !excluded.has(
            eventDate(occurrence).date + eventDate(occurrence).time,
          ),
      )
      .map((occurrence): OutlookEvent => {
        const dateTime = eventDate(occurrence);
        const occurrenceId = `${shortId(uid)}_${dateTime.date.replaceAll("-", "")}_${dateTime.time.replace(":", "")}`;
        return {
          id: `outlook_${occurrenceId}`,
          kind: "event",
          title,
          date: dateTime.date,
          time: dateTime.time,
          endTime,
          description: value("DESCRIPTION") || "Outlook · somente leitura",
        };
      });
  });
  const uniqueEvents = Array.from(
    new Map(events.map((event) => [event.id, event])).values(),
  )
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 750);
  const { results } = await env.DB.prepare(
    "SELECT id, data FROM records WHERE id LIKE 'outlook_%'",
  ).all<{ id: string; data: string }>();
  const existing = new Map(results.map((row) => [row.id, row.data]));
  const statements: D1PreparedStatement[] = [];
  for (const event of uniqueEvents) {
    const data = JSON.stringify(event);
    if (existing.get(event.id) !== data)
      statements.push(
        env.DB.prepare(
          "INSERT OR REPLACE INTO records (id,kind,data) VALUES (?, 'event', ?)",
        ).bind(event.id, data),
      );
    existing.delete(event.id);
  }
  for (const id of existing.keys())
    statements.push(
      env.DB.prepare("DELETE FROM records WHERE id = ?").bind(id),
    );
  statements.push(
    env.DB.prepare(
      "INSERT OR REPLACE INTO integrations (provider,data) VALUES ('outlook_ics',?)",
    ).bind(
      JSON.stringify({
        etag: response.headers.get("etag") || null,
        parserVersion: outlookParserVersion,
        syncedAt,
      }),
    ),
  );
  if (statements.length) await env.DB.batch(statements);
  return {
    count: uniqueEvents.length,
    changed: statements.length - 1,
    syncedAt,
  };
}
type BackupSnapshot = {
  version: 1;
  createdAt: string;
  records: unknown[];
  mail: MailRow[];
  integrations: { provider: string; data: string }[];
};
function backupKey(prefix: "daily" | "pre-restore") {
  if (prefix === "daily") return "backups/daily-current.json";
  return `backups/${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}
async function createBackup(env: Env, prefix: "daily" | "pre-restore") {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS integrations (provider TEXT PRIMARY KEY, data TEXT NOT NULL)",
  ).run();
  const [records, mail, integrations] = await Promise.all([
    env.DB.prepare("SELECT data FROM records").all<{ data: string }>(),
    env.DB.prepare("SELECT * FROM mail").all<MailRow>(),
    env.DB.prepare("SELECT provider,data FROM integrations").all<{
      provider: string;
      data: string;
    }>(),
  ]);
  const createdAt = new Date().toISOString();
  const snapshot: BackupSnapshot = {
    version: 1,
    createdAt,
    records: records.results.map((row) => JSON.parse(row.data)),
    mail: mail.results,
    integrations: integrations.results,
  };
  const key = backupKey(prefix);
  await env.FILES.put(key, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { createdAt, kind: prefix },
  });
  return {
    key,
    createdAt,
    records: snapshot.records.length,
    mail: snapshot.mail.length,
  };
}
async function listBackups(env: Env) {
  const { objects } = await env.FILES.list({ prefix: "backups/" });
  return objects
    .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
    .slice(0, 15)
    .map((object) => ({
      key: object.key,
      createdAt:
        object.customMetadata?.createdAt || object.uploaded.toISOString(),
      size: object.size,
    }));
}
async function restoreBackup(env: Env, key: string) {
  if (
    !/^backups\/(daily-current|(?:weekly|manual|pre-restore)-[\w.-]+)\.json$/.test(
      key,
    )
  )
    throw new Error("Backup inválido.");
  const stored = await env.FILES.get(key);
  if (!stored) throw new Error("Backup não encontrado.");
  const snapshot = await stored.json<BackupSnapshot>();
  if (
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.records) ||
    !Array.isArray(snapshot.mail)
  )
    throw new Error("Arquivo de backup inválido.");
  const validatedRecords = snapshot.records.map((item) =>
    backupRecordSchema.parse(item),
  );
  await createBackup(env, "pre-restore");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS integrations (provider TEXT PRIMARY KEY, data TEXT NOT NULL)",
  ).run();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM records"),
    env.DB.prepare("DELETE FROM mail"),
    env.DB.prepare("DELETE FROM integrations"),
  ]);
  const statements: D1PreparedStatement[] = [
    ...validatedRecords.map((item) =>
      env.DB.prepare("INSERT INTO records (id,kind,data) VALUES (?,?,?)").bind(
        item.id,
        item.kind,
        JSON.stringify(item),
      ),
    ),
    ...snapshot.mail.map((row) =>
      env.DB.prepare(
        "INSERT INTO mail (id,folder,sender,recipient,subject,body,received_at,unread,message_id,reply_to,attachments,provider_id,send_state,send_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        row.id,
        row.folder,
        row.sender,
        row.recipient,
        row.subject,
        row.body,
        row.received_at,
        row.unread,
        row.message_id,
        row.reply_to,
        row.attachments,
        row.provider_id,
        row.send_state,
        row.send_payload,
      ),
    ),
    ...(snapshot.integrations || []).map((row) =>
      env.DB.prepare(
        "INSERT INTO integrations (provider,data) VALUES (?,?)",
      ).bind(row.provider, row.data),
    ),
  ];
  for (let index = 0; index < statements.length; index += 80)
    await env.DB.batch(statements.slice(index, index + 80));
  return { records: validatedRecords.length, mail: snapshot.mail.length };
}
app.post("/api/integrations/outlook/sync", async (c) =>
  c.json(await syncOutlook(c.env)),
);
app.get("/api/backups", async (c) => c.json(await listBackups(c.env)));
app.post("/api/backups", async (c) =>
  c.json(await createBackup(c.env, "daily")),
);
app.post("/api/backups/restore", async (c) => {
  const { key } = z
    .object({ key: z.string().max(200) })
    .parse(await c.req.json());
  return c.json(await restoreBackup(c.env, key));
});
app.get("/api/vault", async (c) => {
  const key = await importVaultKey(c.env.VAULT_ENCRYPTION_KEY);
  if (!key) return c.json({ error: "Armazenamento seguro indisponível." }, 503);
  const { results } = await c.env.DB.prepare(
    "SELECT data FROM records WHERE kind='vault' ORDER BY updated_at DESC",
  ).all<{ data: string }>();
  const items = await Promise.all(
    results.map((row) => decryptVaultItem(JSON.parse(row.data), key)),
  );
  return c.json(items);
});
app.post("/api/vault", async (c) => {
  const key = await importVaultKey(c.env.VAULT_ENCRYPTION_KEY);
  if (!key) return c.json({ error: "Armazenamento seguro indisponível." }, 503);
  const input = vaultInputSchema.parse(await c.req.json());
  const now = new Date().toISOString();
  const item: VaultItem = {
    ...input,
    id: `vault_${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  const stored = await encryptVaultItem(item, key);
  await c.env.DB.prepare(
    "INSERT INTO records(id,kind,data) VALUES(?,'vault',?)",
  )
    .bind(item.id, JSON.stringify(stored))
    .run();
  return c.json(item, 201);
});
app.put("/api/vault/:id", async (c) => {
  const key = await importVaultKey(c.env.VAULT_ENCRYPTION_KEY);
  if (!key) return c.json({ error: "Armazenamento seguro indisponível." }, 503);
  const input = vaultInputSchema.parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "SELECT data FROM records WHERE id=? AND kind='vault'",
  )
    .bind(c.req.param("id"))
    .first<{ data: string }>();
  if (!row) return c.notFound();
  const previous = await decryptVaultItem(JSON.parse(row.data), key);
  const item: VaultItem = {
    ...input,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const stored = await encryptVaultItem(item, key);
  await c.env.DB.prepare(
    "UPDATE records SET data=?,updated_at=? WHERE id=? AND kind='vault'",
  )
    .bind(JSON.stringify(stored), item.updatedAt, item.id)
    .run();
  return c.json(item);
});
app.delete("/api/vault/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^vault_[a-f0-9-]{36}$/.test(id)) return c.notFound();
  await c.env.DB.prepare("DELETE FROM records WHERE id=? AND kind='vault'")
    .bind(id)
    .run();
  return c.json({ ok: true });
});
app.get("/api/records", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT data FROM records WHERE kind!='vault' ORDER BY updated_at DESC",
  ).all<{ data: string }>();
  return c.json(results.map((r) => JSON.parse(r.data)));
});
const brandingKinds = ["icon", "logo", "avatar"] as const;
async function preferences(env: Env): Promise<Partial<Settings>> {
  const row = await env.DB.prepare(
    "SELECT data FROM records WHERE id='preferences'",
  ).first<{ data: string }>();
  return row ? JSON.parse(row.data) : {};
}
app.post("/api/branding/:kind", async (c) => {
  const kind = c.req.param("kind");
  if (!brandingKinds.includes(kind as (typeof brandingKinds)[number]))
    return c.notFound();
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return c.json({ error: "Selecione uma imagem." }, 400);
  if (!file.size || file.size > 2 * 1024 * 1024)
    return c.json({ error: "A imagem deve ter até 2 MB." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png =
    bytes.length > 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpeg =
    bytes.length > 12 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const webp =
    bytes.length > 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (!png && !jpeg && !webp)
    return c.json({ error: "Use uma imagem PNG, JPEG ou WebP." }, 400);
  if (kind === "icon" && !png)
    return c.json({ error: "O ícone deve ser PNG." }, 400);
  const small = form.get("small");
  let smallBytes: Uint8Array | undefined;
  if (kind === "icon" && small instanceof File && small.size <= 512 * 1024) {
    smallBytes = new Uint8Array(await small.arrayBuffer());
    if (
      ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => smallBytes![i] === n)
    )
      return c.json({ error: "Miniatura inválida." }, 400);
  }
  const id = crypto.randomUUID();
  const url = `/api/branding/${kind}/${id}`;
  await c.env.FILES.put(`branding/${kind}/${id}`, bytes, {
    httpMetadata: {
      contentType: png ? "image/png" : jpeg ? "image/jpeg" : "image/webp",
    },
  });
  if (smallBytes)
    await c.env.FILES.put(`branding/icon/${id}/192`, smallBytes, {
      httpMetadata: { contentType: "image/png" },
    });
  return c.json({ url });
});
app.get("/api/branding/:kind/:id", async (c) => {
  const { kind, id } = c.req.param();
  if (
    !brandingKinds.includes(kind as (typeof brandingKinds)[number]) ||
    !/^[a-f0-9-]{36}$/.test(id)
  )
    return c.notFound();
  const item = await c.env.FILES.get(`branding/${kind}/${id}`);
  if (!item) return c.notFound();
  return new Response(item.body, {
    headers: {
      "Content-Type":
        item.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
app.get("/api/app-icon/:size", async (c) => {
  const size = c.req.param("size");
  if (!["192", "512"].includes(size)) return c.notFound();
  const settings = await preferences(c.env);
  if (settings.iconUrl) {
    const id = settings.iconUrl.split("/").at(-1);
    const icon =
      (await c.env.FILES.get(
        `branding/icon/${id}${size === "192" ? "/192" : ""}`,
      )) || (await c.env.FILES.get(`branding/icon/${id}`));
    if (icon)
      return new Response(icon.body, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
        },
      });
  }
  return c.redirect(
    "/app-icon.svg",
    302,
  );
});
app.get("/api/site.webmanifest", async (c) => {
  const settings = await preferences(c.env);
  const bg =
    settings.customThemes?.find((item) => item.id === settings.theme)?.colors
      .background ||
    (settings.theme === "dark"
      ? "#000000"
      : settings.theme === "night"
        ? "#20242c"
        : settings.theme === "light"
          ? "#f7f5f1"
          : "#151210");
  return c.body(
    JSON.stringify({
      name: "Grimório",
      short_name: "Grimório",
      start_url: "/",
      display: "standalone",
      background_color: bg,
      theme_color: bg,
      icons: [
        { src: "/api/app-icon/192", sizes: settings.iconUrl ? "192x192" : "any", type: settings.iconUrl ? "image/png" : "image/svg+xml" },
        {
          src: "/api/app-icon/512",
          sizes: settings.iconUrl ? "512x512" : "any",
          type: settings.iconUrl ? "image/png" : "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    }),
    200,
    { "Content-Type": "application/manifest+json" },
  );
});
app.post("/api/tasks/:id/complete", async (c) => {
  const input = z
    .object({
      complete: z.boolean(),
      today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "SELECT data FROM records WHERE id=? AND kind='task'",
  )
    .bind(c.req.param("id"))
    .first<{ data: string }>();
  if (!row) return c.notFound();
  const task: Task = JSON.parse(row.data);
  const project = task.projectId
    ? await c.env.DB.prepare(
        "SELECT data FROM records WHERE id=? AND kind='project'",
      )
        .bind(task.projectId)
        .first<{ data: string }>()
    : null;
  const columns = project
    ? (JSON.parse(project.data) as Project).columns
    : defaultColumns;
  const wasDone = task.status === columns.at(-1);
  const updated = {
    ...task,
    status: input.complete ? columns.at(-1)! : columns[0],
  };
  const output: Task[] = [updated];
  const statements = [
    c.env.DB.prepare("UPDATE records SET data=?,updated_at=? WHERE id=?").bind(
      JSON.stringify(updated),
      new Date().toISOString(),
      task.id,
    ),
  ];
  if (input.complete && !wasDone && task.repeat !== "none") {
    // Stable successor identity prevents duplicate recurring tasks after retries/reopening.
    const successorId = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(`repeat:${task.id}`),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const successor: Task = {
      ...task,
      id: successorId,
      status: columns[0],
      due: nextDue(task.due || input.today, task.repeat),
      checklist: task.checklist.map((c) => ({ ...c, done: false })),
    };
    statements.push(
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,'task',?)",
      ).bind(successorId, JSON.stringify(successor)),
    );
    await c.env.DB.batch(statements);
    const stored = await c.env.DB.prepare("SELECT data FROM records WHERE id=?")
      .bind(successorId)
      .first<{ data: string }>();
    if (stored) output.push(JSON.parse(stored.data));
  } else await c.env.DB.batch(statements);
  return c.json(output);
});
app.put("/api/records/:id", async (c) => {
  if (c.req.param("id").startsWith("vault_")) return c.notFound();
  const record = recordSchema.parse(await c.req.json());
  if (record.id !== c.req.param("id"))
    return c.json({ error: "Identificador inválido." }, 400);
  if ("projectId" in record && record.projectId) {
    const p = await c.env.DB.prepare(
      "SELECT data FROM records WHERE id=? AND kind='project'",
    )
      .bind(record.projectId)
      .first<{ data: string }>();
    if (!p) return c.json({ error: "Projeto não encontrado." }, 400);
    if (
      record.kind === "task" &&
      !JSON.parse(p.data).columns.includes(record.status)
    )
      return c.json({ error: "Etapa inválida para este projeto." }, 400);
  }
  if (record.kind === "project") {
    const { results } = await c.env.DB.prepare(
      "SELECT data FROM records WHERE kind='task' AND json_extract(data,'$.projectId')=?",
    )
      .bind(record.id)
      .all<{ data: string }>();
    if (
      results.some((r) => !record.columns.includes(JSON.parse(r.data).status))
    )
      return c.json(
        {
          error:
            "Mova as tarefas antes de remover ou renomear uma etapa em uso.",
        },
        400,
      );
  }
  await c.env.DB.prepare(
    "INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  )
    .bind(record.id, record.kind, JSON.stringify(record))
    .run();
  return c.json(record);
});
app.delete("/api/records/:id", async (c) => {
  const id = c.req.param("id");
  if (id.startsWith("vault_")) return c.notFound();
  const dependencies = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM records WHERE json_extract(data,'$.projectId')=?",
  )
    .bind(id)
    .first<{ n: number }>();
  if (dependencies?.n)
    return c.json(
      {
        error:
          "Remova ou transfira as tarefas e notas deste projeto antes de excluí-lo.",
      },
      409,
    );
  await c.env.DB.prepare("DELETE FROM records WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});
app.get("/api/mail", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM mail ORDER BY received_at DESC LIMIT 500",
  ).all<MailRow>();
  return c.json(
    results.map(({ send_payload, ...r }) => ({
      ...r,
      attachments: JSON.parse(r.attachments),
    })),
  );
});
app.put("/api/mail/:id", async (c) => {
  const d = draftSchema.parse(await c.req.json());
  const addresses = mailAddresses(c.env.MAIL_DOMAIN);
  if (!addresses.inbox || ![addresses.inbox, addresses.noReply].includes(d.sender))
    return c.json({ error: "Remetente inválido ou domínio de e-mail não configurado." }, 400);
  if (d.id !== c.req.param("id"))
    return c.json({ error: "Identificador inválido." }, 400);
  const result = await c.env.DB.prepare(
    "INSERT INTO mail(id,folder,sender,recipient,subject,body,received_at,reply_to) VALUES(?,'drafts',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sender=excluded.sender,recipient=excluded.recipient,subject=excluded.subject,body=excluded.body,reply_to=excluded.reply_to WHERE mail.send_state IN ('draft','failed') AND mail.folder='drafts'",
  )
    .bind(
      d.id,
      d.sender,
      d.recipient,
      d.subject,
      d.body,
      new Date().toISOString(),
      d.reply_to || null,
    )
    .run();
  if (!result.meta.changes)
    return c.json(
      { error: "Este e-mail já foi enviado ou está em processamento." },
      409,
    );
  return c.json({ ok: true });
});
app.patch("/api/mail/:id", async (c) => {
  const d = z
    .object({
      folder: z.enum(["inbox", "archive", "trash"]).optional(),
      unread: z.boolean().optional(),
    })
    .parse(await c.req.json());
  if (d.folder)
    await c.env.DB.prepare(
      "UPDATE mail SET folder=? WHERE id=? AND send_state!='pending'",
    )
      .bind(d.folder, c.req.param("id"))
      .run();
  if (d.unread !== undefined)
    await c.env.DB.prepare("UPDATE mail SET unread=? WHERE id=?")
      .bind(d.unread ? 1 : 0, c.req.param("id"))
      .run();
  return c.json({ ok: true });
});
app.post("/api/mail/:id/attachments", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT * FROM mail WHERE id=? AND folder='drafts' AND send_state='draft'",
  )
    .bind(c.req.param("id"))
    .first<MailRow>();
  if (!row) return c.json({ error: "Salve o rascunho antes de anexar." }, 409);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string")
    return c.json({ error: "Selecione um arquivo." }, 400);
  const list: FileMeta[] = JSON.parse(row.attachments);
  if (
    list.length >= 5 ||
    list.reduce((s, f) => s + f.size, 0) + file.size > 5 * 1024 * 1024
  )
    return c.json({ error: "Limite de 5 anexos e 5 MB por mensagem." }, 400);
  const id = crypto.randomUUID();
  await c.env.FILES.put(`mail/${row.id}/${id}`, await file.arrayBuffer(), {
    httpMetadata: { contentType: "application/octet-stream" },
  });
  list.push({
    id,
    filename: file.name.slice(0, 200),
    size: file.size,
    contentType: file.type,
  });
  await c.env.DB.prepare("UPDATE mail SET attachments=? WHERE id=?")
    .bind(JSON.stringify(list), row.id)
    .run();
  return c.json(list);
});
app.get("/api/mail/:id/attachments/:file", async (c) => {
  const row = await c.env.DB.prepare("SELECT attachments FROM mail WHERE id=?")
    .bind(c.req.param("id"))
    .first<{ attachments: string }>();
  const meta: FileMeta | undefined =
    row &&
    JSON.parse(row.attachments).find(
      (f: FileMeta) => f.id === c.req.param("file"),
    );
  if (!meta) return c.notFound();
  const file = await c.env.FILES.get(`mail/${c.req.param("id")}/${meta.id}`);
  if (!file) return c.notFound();
  return new Response(file.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
});
app.post("/api/mail/:id/send", async (c) => {
  if (
    allowLocal(c.req.raw, c.env.LOCAL_DEVELOPMENT) ||
    c.env.MAIL_ENABLED !== "true" ||
    !c.env.RESEND_API_KEY
  )
    return c.json(
      { error: "Envio ainda não ativado. Seu rascunho está salvo." },
      409,
    );
  let row = await c.env.DB.prepare("SELECT * FROM mail WHERE id=?")
    .bind(c.req.param("id"))
    .first<MailRow>();
  if (!row) return c.notFound();
  if (row.send_state === "sent") return c.json({ ok: true });
  if (row.send_state === "pending")
    return c.json(
      {
        error:
          "Envio aguardando confirmação. Confira o registro no Resend antes de qualquer nova tentativa.",
      },
      409,
    );
  if (row.folder !== "drafts")
    return c.json({ error: "Somente rascunhos podem ser enviados." }, 409);
  z.email().parse(row.recipient);
  if (!row.subject.trim() || !row.body.trim())
    return c.json({ error: "Preencha assunto e mensagem." }, 400);
  const addresses = mailAddresses(c.env.MAIL_DOMAIN);
  if (!addresses.inbox || ![addresses.inbox, addresses.noReply].includes(row.sender))
    return c.json({ error: "Remetente inválido." }, 400);
  if (!row.send_payload) {
    const settings = await c.env.DB.prepare(
      "SELECT data FROM records WHERE id='preferences'",
    ).first<{ data: string }>();
    const preference = settings
      ? (JSON.parse(settings.data) as Partial<Settings>)
      : {};
    const signatureText = signatureTextFor(preference);
    const showSignatureLogo = preference.signatureShowLogo !== false;
    const attachments: {
      filename: string;
      content: string;
      content_id?: string;
      content_type?: string;
    }[] = [];
    for (const meta of JSON.parse(row.attachments) as FileMeta[]) {
      const file = await c.env.FILES.get(`mail/${row.id}/${meta.id}`);
      if (!file) return c.json({ error: "Anexo indisponível." }, 409);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      attachments.push({ filename: meta.filename, content: btoa(binary) });
    }
    if (showSignatureLogo) {
      // Embed the brand image inline; no public Access bypass is necessary.
      const uploadedLogo = preference.logoUrl
        ? await c.env.FILES.get(
            `branding/logo/${preference.logoUrl.split("/").at(-1)}`,
          )
        : null;
      const logo = uploadedLogo
        ? new Response(uploadedLogo.body, {
            headers: {
              "content-type":
                uploadedLogo.httpMetadata?.contentType || "image/png",
            },
          })
        : await c.env.ASSETS.fetch(
            new Request(`${c.env.APP_ORIGIN}/logo.svg`),
          );
      if (!logo.ok || !logo.headers.get("content-type")?.startsWith("image/")) {
        return c.json(
          {
            error: "Logo da assinatura indisponível. O e-mail não foi enviado.",
          },
          503,
        );
      }
      const logoBytes = new Uint8Array(await logo.arrayBuffer());
      let logoBinary = "";
      for (let i = 0; i < logoBytes.length; i += 8192)
        logoBinary += String.fromCharCode(...logoBytes.subarray(i, i + 8192));
      const logoType = logo.headers.get("content-type") || "image/png";
      attachments.push({
        filename: `assinatura.${logoType === "image/jpeg" ? "jpg" : logoType === "image/webp" ? "webp" : logoType === "image/svg+xml" ? "svg" : "png"}`,
        content: btoa(logoBinary),
        content_id: "erp-logo",
        content_type: logoType,
      });
    }
    const text = `${row.body}\n\n${signatureText}`;
    const payload = JSON.stringify({
      from: `Grimório <${row.sender}>`,
      to: [row.recipient],
      subject: row.subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(row.body).replace(/\n/g, "<br>")}</div>${signature(signatureText, showSignatureLogo ? "cid:erp-logo" : undefined)}`,
      attachments,
      ...(row.reply_to
        ? { headers: { "In-Reply-To": row.reply_to, References: row.reply_to } }
        : {}),
    });
    const payloadKey = `outbox/${row.id}/${crypto.randomUUID()}`;
    await c.env.FILES.put(payloadKey, payload);
    const claim = await c.env.DB.prepare(
      "UPDATE mail SET send_state='pending',send_payload=? WHERE id=? AND send_payload IS NULL",
    )
      .bind(payloadKey, row.id)
      .run();
    if (!claim.meta.changes) {
      await c.env.FILES.delete(payloadKey);
      return c.json({ error: "Este e-mail já está sendo enviado." }, 409);
    }
    row = (await c.env.DB.prepare("SELECT * FROM mail WHERE id=?")
      .bind(row.id)
      .first<MailRow>())!;
  }
  // Retries reuse the exact same payload and key. Never silently fall back to another sender.
  const payloadFile = await c.env.FILES.get(row.send_payload!);
  if (!payloadFile)
    return c.json({ error: "Conteúdo de envio indisponível." }, 409);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `erp-${row.id}`,
      },
      body: await payloadFile.text(),
    });
  } catch {
    return c.json(
      {
        error:
          "Não foi possível confirmar o envio. Consulte o Resend antes de tentar novamente.",
      },
      502,
    );
  }
  if (!response.ok)
    return c.json(
      {
        error:
          "O Resend não confirmou o envio. Verifique domínio, limites e registro de envios no provedor.",
      },
      502,
    );
  const data = (await response.json()) as { id: string };
  await c.env.DB.prepare(
    "UPDATE mail SET folder='sent',send_state='sent',provider_id=?,received_at=?,send_payload=NULL WHERE id=?",
  )
    .bind(data.id, new Date().toISOString(), row.id)
    .run();
  await c.env.FILES.delete(row.send_payload!);
  return c.json({ ok: true });
});
app.all("/api/*", (c) => c.json({ error: "Rota não encontrada." }, 404));
app.all("*", async (c) => {
  if (!c.env.ASSETS) return c.text("Grimório API local");
  const response = await c.env.ASSETS.fetch(c.req.raw);
  if (!response.headers.get("Content-Type")?.includes("text/html"))
    return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
export default {
  fetch: app.fetch,
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === "0 3 * * *") ctx.waitUntil(createBackup(env, "daily"));
    else if (env.OUTLOOK_ICS_URL) ctx.waitUntil(syncOutlook(env));
  },
  async email(message: ForwardableEmailMessage, env: Env) {
    if (!acceptRecipient(message.to, env.MAIL_DOMAIN)) {
      message.setReject("This address does not receive email.");
      return;
    }
    if (message.rawSize > 10 * 1024 * 1024) {
      message.setReject("Maximum message size is 10 MB.");
      return;
    }
    const raw = await new Response(message.raw).arrayBuffer();
    const mail = await PostalMime.parse(raw);
    const id = crypto.randomUUID();
    if (mail.messageId) {
      const previous = await env.DB.prepare(
        "SELECT id FROM mail WHERE message_id=?",
      )
        .bind(mail.messageId)
        .first();
      if (previous) return;
    }
    const attachments: FileMeta[] = [];
    for (const f of mail.attachments) {
      const fid = crypto.randomUUID();
      const content =
        typeof f.content === "string"
          ? new TextEncoder().encode(f.content)
          : f.content;
      await env.FILES.put(`mail/${id}/${fid}`, content);
      attachments.push({
        id: fid,
        filename: f.filename || "anexo",
        size: content.byteLength,
        contentType: f.mimeType,
      });
    }
    // Plain text only: inbound HTML never executes scripts, loads tracking pixels or submits forms.
    const body =
      mail.text ||
      mail.html
        ?.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ") ||
      "";
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mail(id,folder,sender,recipient,subject,body,received_at,unread,message_id,attachments,send_state) VALUES(?,'inbox',?,?,?,?,?,1,?,?,'sent')",
    )
      .bind(
        id,
        mail.from?.address || message.from,
        message.to,
        mail.subject || "(sem assunto)",
        body,
        new Date().toISOString(),
        mail.messageId || null,
        JSON.stringify(attachments),
      )
      .run();
  },
};
