export type Task = {
  id: string;
  kind: "task";
  title: string;
  description: string;
  projectId: string;
  status: string;
  priority: "low" | "medium" | "high";
  due: string;
  time?: string;
  tags: string;
  checklist: { id: string; text: string; done: boolean }[];
  repeat: "none" | "daily" | "weekly" | "monthly";
  mailId?: string;
  position?: number;
};
export type Project = {
  id: string;
  kind: "project";
  title: string;
  description: string;
  color: string;
  columns: string[];
};
export type Event = {
  id: string;
  kind: "event";
  title: string;
  date: string;
  time: string;
  endTime: string;
  description: string;
};
export type Note = {
  id: string;
  kind: "note";
  title: string;
  body: string;
  projectId: string;
};
export type VaultItem = {
  id: string;
  kind: "password" | "key";
  name: string;
  value: string;
  username: string;
  website: string;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Settings = {
  id: "preferences";
  kind: "settings";
  name: string;
  accent: "violet" | "gold";
  compact: boolean;
  showCompleted: boolean;
  signatureName?: string;
  signatureText?: string;
  signatureShowLogo?: boolean;
  language?: "pt-BR" | "en" | "es";
  theme?: "original" | "light" | "night" | "dark" | string;
  customThemes?: { id: string; name: string; colors: ThemeColors }[];
  iconUrl?: string;
  logoUrl?: string;
  avatarUrl?: string;
};
export type ThemeColors = {
  background: string;
  sidebar: string;
  surface: string;
  surfaceRaised: string;
  field: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  button: string;
  buttonText: string;
};
export type RecordItem = Task | Project | Event | Note | Settings;
export type Attachment = {
  id: string;
  filename: string;
  size: number;
  contentType: string;
};
export type Mail = {
  id: string;
  folder: "inbox" | "sent" | "drafts" | "archive" | "trash";
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  received_at: string;
  unread: number;
  message_id?: string;
  reply_to?: string;
  attachments: Attachment[];
  send_state: string;
};
export const defaultSignatureText = "Seu nome";
export const defaultSettings: Settings = {
  id: "preferences",
  kind: "settings",
  name: "Seu nome",
  accent: "violet",
  compact: false,
  showCompleted: false,
  signatureText: defaultSignatureText,
  signatureShowLogo: false,
  language: "pt-BR",
  theme: "original",
  customThemes: [],
};
export function signatureTextFor(settings: Partial<Settings>) {
  return (
    settings.signatureText ??
    (settings.signatureName || "Seu nome")
  );
}
export const defaultColumns = [
  "A fazer",
  "Em andamento",
  "Em revisão",
  "Concluído",
];
