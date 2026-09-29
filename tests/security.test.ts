import { describe, it, expect } from "vitest";
import worker from "../worker/index";
import {
  acceptRecipient,
  allowLocal,
  escapeHtml,
  recordSchema,
  signature,
} from "../worker/validation";
import { nextDue } from "../src/lib";
import { defaultSettings, signatureTextFor } from "../src/types";
import { themePresets, themeStyle } from "../src/theme";
import { translate } from "../src/i18n";
describe("private-by-default access", () => {
  it("does not cache the app shell after a deployment", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/"),
      {
        LOCAL_DEVELOPMENT: "true",
        ASSETS: {
          fetch: async () =>
            new Response("<!doctype html>", {
              headers: { "Content-Type": "text/html" },
            }),
        },
      } as never,
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
  });
  it("protects static assets and the signature logo without public exceptions", async () => {
    for (const path of [
      "/",
      "/logo.svg",
      "/app-icon.svg",
      "/api/mail/a/attachments/b",
      "/api/app-icon/512",
      "/api/site.webmanifest",
      "/api/vault",
    ]) {
      const response = await worker.fetch(
        new Request(`https://erp.example.com${path}`),
        {
          ASSETS: {
            fetch: () => {
              throw new Error("Assets must not bypass authentication");
            },
          },
        } as never,
        {} as never,
      );
      expect(response.status).toBe(503);
    }
  });
  it("fails closed when production access is not configured", async () => {
    const response = await worker.fetch(
      new Request("https://erp.example.com/api/records"),
      {} as never,
      {} as never,
    );
    expect(response.status).toBe(503);
  });
  it("never bypasses production auth with a local flag", () => {
    expect(
      allowLocal(new Request("https://erp.example.com/api/mail"), "true"),
    ).toBe(false);
    expect(allowLocal(new Request("http://localhost/api/mail"), "true")).toBe(
      true,
    );
    expect(allowLocal(new Request("http://localhost/api/mail"))).toBe(false);
  });
  it("rejects cross-origin writes even locally", async () => {
    const response = await worker.fetch(
      new Request("http://127.0.0.1/api/records/a", {
        method: "PUT",
        headers: { Origin: "https://evil.example" },
        body: "{}",
      }),
      {
        LOCAL_DEVELOPMENT: "true",
        APP_ORIGIN: "http://127.0.0.1:5173",
      } as never,
      {} as never,
    );
    expect(response.status).toBe(403);
  });
  it("requires a valid token rather than trusting an email header", async () => {
    const response = await worker.fetch(
      new Request("https://erp.example.com/api/mail", {
        headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
      }),
      {
        ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
        ACCESS_AUD: "private-app",
        OWNER_EMAIL: "owner@example.com",
      } as never,
      {} as never,
    );
    expect(response.status).toBe(401);
  });
});
describe("mail boundaries", () => {
  it("embeds the signature logo without a public ERP URL", () => {
    const html = signature("Meu nome", "cid:erp-logo");
    expect(html).toContain('src="cid:erp-logo"');
    expect(html).not.toContain("erp.example.com");
  });
  it("uses the edited signature in HTML and supports hiding the logo", () => {
    const text = "Ana\nMeu site: exemplo.com";
    const html = signature(text);
    expect(html).toContain("Ana<br>Meu site: <a");
    expect(html).toContain('href="https://exemplo.com"');
    expect(html).not.toContain("<img");
    expect(signatureTextFor({ signatureText: text })).toBe(text);
    expect(signatureTextFor({ signatureName: "Ana" })).toBe("Ana");
  });
  it("only accepts the designated inbox", () => {
    expect(acceptRecipient("contact@example.com", "example.com")).toBe(true);
    expect(acceptRecipient("no-reply@example.com", "example.com")).toBe(false);
    expect(acceptRecipient("contact+alias@example.com", "example.com")).toBe(false);
    expect(acceptRecipient("unknown@example.com", "example.com")).toBe(false);
    expect(acceptRecipient("contact@example.com")).toBe(false);
    expect(acceptRecipient("contact@example.com", "example..com")).toBe(false);
  });
  it("escapes user content and signature names", () => {
    expect(escapeHtml("<img src=x onerror=alert(1)>")).not.toContain("<img");
    expect(signature("<script>", "https://erp.example.com")).not.toContain(
      "<script>",
    );
  });
  it("cannot send mail in local development", async () => {
    const response = await worker.fetch(
      new Request("http://127.0.0.1/api/mail/a/send", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:5173" },
      }),
      {
        LOCAL_DEVELOPMENT: "true",
        APP_ORIGIN: "http://127.0.0.1:5173",
        MAIL_ENABLED: "true",
        RESEND_API_KEY: "test-not-real",
      } as never,
      {} as never,
    );
    expect(response.status).toBe(409);
  });
  it("rejects no-reply before parsing or persisting a message", async () => {
    let reason = "";
    await worker.email(
      {
        to: "no-reply@example.com",
        setReject: (v: string) => (reason = v),
      } as never,
      { MAIL_DOMAIN: "example.com" } as never,
    );
    expect(reason).toContain("does not receive");
  });
});
describe("organization data", () => {
  it("validates saved themes and private branding URLs", () => {
    const valid = {
      ...defaultSettings,
      language: "es",
      theme: "mine",
      customThemes: [{ id: "mine", name: "Mine", colors: themePresets.dark }],
      iconUrl: "/api/branding/icon/00000000-0000-0000-0000-000000000000",
    };
    expect(recordSchema.safeParse(valid).success).toBe(true);
    expect(
      recordSchema.safeParse({
        ...valid,
        iconUrl: "https://evil.example/icon.png",
      }).success,
    ).toBe(false);
    expect(
      recordSchema.safeParse({
        ...valid,
        customThemes: [
          {
            ...valid.customThemes[0],
            colors: { ...themePresets.dark, accent: "red" },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("keeps the original palette and translates interface labels without changing saved content", () => {
    expect(themeStyle(defaultSettings)).toEqual({});
    expect(themeStyle({ ...defaultSettings, theme: "light" })).toHaveProperty(
      "--bg",
      themePresets.light.background,
    );
    expect(translate("Tarefas", "en")).toBe("Tasks");
    expect(translate("Tarefas", "es")).toBe("Tareas");
    expect(translate("Minha tarefa pessoal", "en")).toBe(
      "Minha tarefa pessoal",
    );
  });
  it("clamps monthly recurrence at the last day", () => {
    expect(nextDue("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDue("2028-01-31", "monthly")).toBe("2028-02-29");
    expect(nextDue("2026-12-31", "daily")).toBe("2027-01-01");
    expect(nextDue("2026-09-16", "weekly")).toBe("2026-09-23");
  });
  it("rejects duplicate board stages", () => {
    expect(
      recordSchema.safeParse({
        id: "p",
        kind: "project",
        title: "Project",
        description: "",
        color: "#ffffff",
        columns: ["A", "A"],
      }).success,
    ).toBe(false);
  });
  it("rejects events ending before their start", () => {
    expect(
      recordSchema.safeParse({
        id: "e",
        kind: "event",
        title: "Event",
        date: "2026-09-16",
        time: "15:00",
        endTime: "14:00",
        description: "",
      }).success,
    ).toBe(false);
  });
});
