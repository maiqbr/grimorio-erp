import type { Task } from "./types";
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function nextDue(date: string, repeat: Task["repeat"]) {
  const d = new Date(`${date}T12:00:00`);
  if (repeat === "monthly") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  } else d.setDate(d.getDate() + (repeat === "weekly" ? 7 : 1));
  return localDate(d);
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({
      error: "Serviço indisponível. Verifique a conexão.",
    }))) as { error?: string };
    throw new Error(data.error || "Não foi possível concluir.");
  }
  return response.json();
}
export const uid = () => crypto.randomUUID();
export const dateLabel = (date: string, locale = "pt-BR") =>
  date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
      })
    : "Sem prazo";
