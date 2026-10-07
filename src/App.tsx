import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Archive,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Eye,
  FileText,
  Flag,
  FolderKanban,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Mail as MailIcon,
  Menu,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  RefreshCw,
  ImagePlus,
  Palette,
  Languages,
  X,
} from "lucide-react";
import { api, dateLabel as formatDateLabel, localDate, uid } from "./lib";
import {
  activeTheme,
  themeColorLabels,
  themePresets,
  themeStyle,
} from "./theme";
import { translate } from "./i18n";
import PasswordsPage from "./PasswordsPage";
import {
  DateField,
  ResizableTextarea,
  SegmentedControl,
  SelectField,
  TimeField,
} from "./FormControls";
import {
  defaultColumns,
  defaultSettings,
  defaultSignatureText,
  signatureTextFor,
  type Event,
  type Mail,
  type Note,
  type Project,
  type RecordItem,
  type Settings,
  type Task,
  type ThemeColors,
} from "./types";
type Page =
  | "today"
  | "tasks"
  | "calendar"
  | "projects"
  | "notes"
  | "passwords"
  | "mail"
  | "settings";
type BackupInfo = { key: string; createdAt: string; size: number };
const navigation: { id: Page; label: string; icon: typeof Inbox }[] = [
  { id: "today", label: "Meu dia", icon: LayoutDashboard },
  { id: "tasks", label: "Tarefas", icon: ListTodo },
  { id: "calendar", label: "Calendário", icon: CalendarDays },
  { id: "projects", label: "Projetos", icon: FolderKanban },
  { id: "notes", label: "Notas", icon: FileText },
  { id: "passwords", label: "Senhas", icon: KeyRound },
  { id: "mail", label: "E-mail", icon: MailIcon },
];
const priorities = { low: "Baixa", medium: "Normal", high: "Alta" };
const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
const sortByPriority = (items: Task[]) =>
  [...items].sort(
    (a, b) =>
      priorityWeight[a.priority] - priorityWeight[b.priority] ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31") ||
      (a.time || "99:99").localeCompare(b.time || "99:99"),
  );
const sortForKanban = (items: Task[]) =>
  [...items].sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) -
        (b.position ?? Number.MAX_SAFE_INTEGER) ||
      priorityWeight[a.priority] - priorityWeight[b.priority] ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31"),
  );
const blankTask = (): Task => ({
  id: uid(),
  kind: "task",
  title: "",
  description: "",
  projectId: "",
  status: defaultColumns[0],
  priority: "medium",
  due: localDate(),
  time: "",
  tags: "",
  checklist: [],
  repeat: "none",
});
function Empty({
  icon: Icon = Sparkles,
  title,
  detail,
  action,
}: {
  icon?: typeof Inbox;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
function SignaturePreview({
  settings,
  text,
  showLogo,
  small = false,
}: {
  settings: Settings;
  text: string;
  showLogo: boolean;
  small?: boolean;
}) {
  return (
    <div className={`signature-preview${small ? " small" : ""}`}>
      {showLogo && (
        <img src={settings.logoUrl || "/logo.svg"} alt="Grimório" />
      )}
      <div className="signature-text">{text}</div>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current!;
    const first =
      el.querySelector<HTMLElement>(
        "input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
      ) || el.querySelector<HTMLElement>("button");
    first?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const all = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
          ),
        );
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={translate(
              "Fechar",
              document.documentElement.lang as Settings["language"],
            )}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState<Page>("today"),
    [records, setRecords] = useState<RecordItem[]>([]),
    [mails, setMails] = useState<Mail[]>([]),
    [status, setStatus] = useState({
      local: true,
      mailEnabled: false,
      mailAddresses: { inbox: "", noReply: "" },
      outlookLastSyncedAt: "",
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [completingTaskId, setCompletingTaskId] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [projectFilter, setProjectFilter] = useState(""),
    [taskFilter, setTaskFilter] = useState("open"),
    [editor, setEditor] = useState<RecordItem | null>(null),
    [deleteItem, setDeleteItem] = useState<RecordItem | null>(null),
    [taskPreview, setTaskPreview] = useState<Task | null>(null),
    [backups, setBackups] = useState<BackupInfo[]>([]),
    [backupToRestore, setBackupToRestore] = useState<BackupInfo | null>(null),
    [quick, setQuick] = useState(""),
    [quickNote, setQuickNote] = useState(""),
    [quickNoteSaving, setQuickNoteSaving] = useState(false),
    [signatureDraft, setSignatureDraft] = useState(defaultSignatureText),
    [signatureLogoDraft, setSignatureLogoDraft] = useState(true),
    [selectedDate, setSelectedDate] = useState(localDate()),
    [calendarDay, setCalendarDay] = useState<string | null>(null),
    [month, setMonth] = useState(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [calendarMode, setCalendarMode] = useState<"month" | "week" | "day">(
      "month",
    ),
    [folder, setFolder] = useState<Mail["folder"]>("inbox"),
    [selectedMail, setSelectedMail] = useState<Mail | null>(null),
    [compose, setCompose] = useState<Mail | null>(null),
    [composeDirty, setComposeDirty] = useState(false);
  const [themeEditor, setThemeEditor] = useState<{
    id: string;
    name: string;
    colors: ThemeColors;
  } | null>(null);
  const [identityBusy, setIdentityBusy] = useState<
    "icon" | "logo" | "avatar" | null
  >(null);
  const tasks = records.filter((r): r is Task => r.kind === "task"),
    projects = records.filter((r): r is Project => r.kind === "project"),
    notes = records.filter(
      (r): r is Note => r.kind === "note" && r.id !== "quick-note",
    ),
    events = records.filter((r): r is Event => r.kind === "event"),
    settings =
      records.find((r): r is Settings => r.kind === "settings") ||
      defaultSettings;
  const tr = (value: string) => translate(value, settings.language);
  useEffect(() => {
    setSignatureDraft(signatureTextFor(settings));
    setSignatureLogoDraft(settings.signatureShowLogo !== false);
  }, [
    settings.signatureText,
    settings.signatureName,
    settings.signatureShowLogo,
  ]);
  const dateLabel = (date: string) =>
    tr(formatDateLabel(date, settings.language));
  const today = localDate(),
    activeProject = projects.find((p) => p.id === projectFilter),
    columns = activeProject?.columns || defaultColumns;
  useEffect(() => {
    const lang = settings.language || "pt-BR";
    document.documentElement.lang = lang;
    document.title = `Grimório · ${translate("Meu espaço", lang)}`;
    const background = activeTheme(settings).background;
    document.documentElement.style.backgroundColor = background;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", background);
    const iconVersion = settings.iconUrl?.split("/").at(-1) || "default";
    document
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
      .forEach((link) => {
        link.href = settings.iconUrl
          ? `/api/app-icon/192?v=${iconVersion}`
          : "/app-icon.svg";
      });
    document
      .querySelectorAll<HTMLLinkElement>('link[rel^="apple-touch-icon"]')
      .forEach((link) => {
        link.href = `/api/app-icon/512?v=${iconVersion}`;
      });
    document
      .querySelector<HTMLLinkElement>('link[rel="manifest"]')
      ?.setAttribute("href", `/api/site.webmanifest?v=${iconVersion}`);
  }, [
    settings.language,
    settings.theme,
    settings.iconUrl,
    settings.customThemes,
  ]);
  const projectOf = (task: Task) =>
    projects.find((p) => p.id === task.projectId);
  const completed = (task: Task) =>
    task.status === (projectOf(task)?.columns || defaultColumns).at(-1);
  const standaloneTasks = tasks.filter((t) => !t.projectId),
    openTasks = tasks.filter((t) => !completed(t)),
    dayTasks = sortByPriority(
      tasks.filter(
        (t) => (t.due === today || (t.due && t.due < today)) && !completed(t),
      ),
    ),
    todayEvents = events
      .filter((e) => e.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
  const filteredTasks = sortByPriority(
    standaloneTasks.filter(
      (t) =>
        `${t.title} ${t.description} ${t.tags}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (taskFilter === "all" ||
          (taskFilter === "done" ? completed(t) : !completed(t))),
    ),
  );
  const projectSummaries = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const done = projectTasks.filter(completed).length;
    const open = projectTasks.length - done;
    const high = projectTasks.filter(
      (task) => !completed(task) && task.priority === "high",
    ).length;
    const overdue = projectTasks.filter(
      (task) => !completed(task) && !!task.due && task.due < today,
    ).length;
    return {
      project,
      total: projectTasks.length,
      done,
      open,
      high,
      overdue,
      progress: projectTasks.length
        ? Math.round((done / projectTasks.length) * 100)
        : 100,
    };
  });
  const projectOpenTasks = projectSummaries.reduce(
    (total, item) => total + item.open,
    0,
  );
  const projectDoneTasks = projectSummaries.reduce(
    (total, item) => total + item.done,
    0,
  );
  const projectHighTasks = projectSummaries.reduce(
    (total, item) => total + item.high,
    0,
  );
  const projectOverdueTasks = projectSummaries.reduce(
    (total, item) => total + item.overdue,
    0,
  );
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const cb = (e: BeforeUnloadEvent) => {
      if (composeDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", cb);
    return () => window.removeEventListener("beforeunload", cb);
  }, [composeDirty]);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [r, m, s, b] = await Promise.all([
        api<RecordItem[]>("/records"),
        api<Mail[]>("/mail"),
        api<typeof status>("/status"),
        api<BackupInfo[]>("/backups"),
      ]);
      setRecords(r);
      setMails(m);
      setStatus(s);
      setBackups(b);
      setQuickNote(
        r.find(
          (item): item is Note =>
            item.id === "quick-note" && item.kind === "note",
        )?.body || "",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(item: RecordItem) {
    const result = await api<RecordItem>(`/records/${item.id}`, {
      method: "PUT",
      body: JSON.stringify(item),
    });
    setRecords((old) => [result, ...old.filter((r) => r.id !== item.id)]);
  }
  function navigate(p: Page) {
    setPage(p);
    setQuery("");
    setMenu(false);
    setSelectedMail(null);
  }
  function newTask(projectId = "", due = today) {
    const p = projects.find((p) => p.id === projectId);
    setEditor({
      ...blankTask(),
      projectId,
      status: p?.columns[0] || defaultColumns[0],
      due,
    });
  }
  function newProject() {
    setEditor({
      id: uid(),
      kind: "project",
      title: "",
      description: "",
      color: "#a78bfa",
      columns: defaultColumns,
    });
  }
  function newEvent(date = selectedDate) {
    setEditor({
      id: uid(),
      kind: "event",
      title: "",
      date,
      time: "09:00",
      endTime: "10:00",
      description: "",
    });
  }
  function newNote() {
    setEditor({
      id: uid(),
      kind: "note",
      title: "",
      body: "",
      projectId: projectFilter,
    });
  }
  async function toggleTask(t: Task, row?: HTMLElement | null) {
    await perform(async () => {
      const wasDone = completed(t);
      const leavesList =
        row &&
        ((page === "today" && !wasDone) ||
          (page === "tasks" &&
            ((taskFilter === "open" && !wasDone) ||
              (taskFilter === "done" && wasDone))));
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      setCompletingTaskId(wasDone ? null : t.id);
      let animation: Animation | undefined;
      try {
        const request = api<Task[]>(`/tasks/${t.id}/complete`, {
          method: "POST",
          body: JSON.stringify({ complete: !wasDone, today }),
        });
        if (leavesList && !reducedMotion) {
          const height = row.getBoundingClientRect().height;
          row.style.overflow = "hidden";
          animation = row.animate(
            [
              {
                height: `${height}px`,
                opacity: 1,
                transform: "translateX(0) scale(1)",
              },
              {
                height: `${height}px`,
                opacity: 1,
                transform: "translateX(0) scale(1)",
                offset: 0.3,
              },
              {
                height: "0px",
                paddingTop: "0px",
                paddingBottom: "0px",
                borderBottomWidth: "0px",
                opacity: 0,
                transform: "translateX(20px) scale(.98)",
              },
            ],
            {
              duration: 420,
              easing: "cubic-bezier(.22,.8,.25,1)",
              fill: "forwards",
            },
          );
        }
        const result = await request;
        if (animation) await animation.finished;
        setRecords((old) => [
          ...result,
          ...old.filter((r) => !result.some((n) => n.id === r.id)),
        ]);
        if (animation)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        setToast(wasDone ? "Tarefa reaberta." : "Tarefa concluída.");
      } finally {
        animation?.cancel();
        if (row) row.style.overflow = "";
        setCompletingTaskId(null);
      }
    });
  }
  async function savePreferences(
    next: Settings,
    message = "Preferências salvas.",
  ) {
    await save(next);
    setToast(message);
  }
  async function uploadIdentity(kind: "icon" | "logo" | "avatar", file?: File) {
    if (!file) return;
    setIdentityBusy(kind);
    setError("");
    try {
      let upload = file;
      let smallIcon: Blob | undefined;
      if (kind === "icon") {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const context = canvas.getContext("2d")!;
        const side = Math.min(bitmap.width, bitmap.height);
        context.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          512,
          512,
        );
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error("Não foi possível preparar o ícone.")),
            "image/png",
          ),
        );
        upload = new File([blob], "app-icon.png", { type: "image/png" });
        const small = document.createElement("canvas");
        small.width = small.height = 192;
        small.getContext("2d")!.drawImage(canvas, 0, 0, 192, 192);
        smallIcon = await new Promise<Blob>((resolve, reject) =>
          small.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error("Não foi possível preparar o ícone.")),
            "image/png",
          ),
        );
      }
      const form = new FormData();
      form.append("file", upload);
      if (smallIcon) form.append("small", smallIcon, "app-icon-192.png");
      const { url } = await api<{ url: string }>(`/branding/${kind}`, {
        method: "POST",
        body: form,
      });
      const field = { icon: "iconUrl", logo: "logoUrl", avatar: "avatarUrl" }[
        kind
      ] as "iconUrl" | "logoUrl" | "avatarUrl";
      await savePreferences(
        { ...settings, [field]: url },
        "Imagem atualizada.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIdentityBusy(null);
    }
  }
  function resetIdentity(kind: "icon" | "logo" | "avatar") {
    const field = { icon: "iconUrl", logo: "logoUrl", avatar: "avatarUrl" }[
      kind
    ] as "iconUrl" | "logoUrl" | "avatarUrl";
    void perform(() =>
      savePreferences(
        { ...settings, [field]: undefined },
        "Imagem padrão restaurada.",
      ),
    );
  }
  function taskRow(t: Task) {
    const done = completed(t),
      project = projectOf(t);
    return (
      <div
        className={`task-row ${done ? "done" : ""} ${completingTaskId === t.id ? "is-completing" : ""} priority-row-${t.priority}`}
        key={t.id}
      >
        <button
          className={`check-btn ${done ? "checked" : ""}`}
          onClick={(event) =>
            void toggleTask(
              t,
              event.currentTarget.closest<HTMLElement>(".task-row"),
            )
          }
          disabled={busy}
          aria-label={tr(done ? "Reabrir tarefa" : "Concluir tarefa")}
        >
          {done || completingTaskId === t.id ? <Check size={14} /> : null}
        </button>
        <button className="task-content" onClick={() => setTaskPreview(t)}>
          <strong>{t.title}</strong>
          <span>
            {project && (
              <>
                <i style={{ background: project.color }} />
                {project.title}
                <b>·</b>
              </>
            )}
            {tr(t.status)}
            {t.checklist.length > 0 && (
              <>
                <b>·</b>
                {t.checklist.filter((c) => c.done).length}/{t.checklist.length}{" "}
                {tr("passos")}
              </>
            )}
          </span>
        </button>
        <span
          className={`due ${t.due && t.due < today && !done ? "overdue" : ""}`}
        >
          {t.due === today ? tr("Hoje") : dateLabel(t.due)}
          {t.time ? ` · ${t.time}` : ""}
        </span>
        <span
          className={`priority-badge priority-${t.priority}`}
          title={`${tr("Prioridade")} ${tr(priorities[t.priority])}`}
        >
          <Flag size={13} />
          <span>{tr(priorities[t.priority])}</span>
        </span>
        <button
          className="icon-btn"
          aria-label={`Editar ${t.title}`}
          onClick={() => setEditor(t)}
        >
          <Pencil size={16} />
        </button>
        <button
          className="icon-btn task-delete"
          aria-label={`Excluir ${t.title}`}
          onClick={() => setDeleteItem(t)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }
  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    await perform(async () => {
      await save({ ...blankTask(), title: quick.trim(), due: "" });
      setQuick("");
      setToast("Capturado. Organize quando quiser.");
    });
  }
  const quickNoteTimer = useRef<number | undefined>(undefined);
  function updateQuickNote(value: string) {
    setQuickNote(value);
    setQuickNoteSaving(true);
    window.clearTimeout(quickNoteTimer.current);
    quickNoteTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          if (!value.trim()) {
            if (records.some((record) => record.id === "quick-note")) {
              await api("/records/quick-note", { method: "DELETE" });
              setRecords((old) =>
                old.filter((record) => record.id !== "quick-note"),
              );
            }
            return;
          }
          const note = await api<Note>("/records/quick-note", {
            method: "PUT",
            body: JSON.stringify({
              id: "quick-note",
              kind: "note",
              title: "Nota rápida",
              body: value,
              projectId: "",
            }),
          });
          setRecords((old) => [
            note,
            ...old.filter((record) => record.id !== note.id),
          ]);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setQuickNoteSaving(false);
        }
      })();
    }, 550);
  }
  async function moveKanbanTask(
    task: Task,
    targetColumn: string,
    targetIndex?: number,
  ) {
    const destination = sortForKanban(
      tasks.filter(
        (item) =>
          item.projectId === task.projectId &&
          item.status === targetColumn &&
          item.id !== task.id,
      ),
    );
    const position = Math.max(
      0,
      Math.min(targetIndex ?? destination.length, destination.length),
    );
    destination.splice(position, 0, { ...task, status: targetColumn });
    const affected = [
      ...destination.map((item, index) => ({ ...item, position: index + 1 })),
      ...(task.status === targetColumn
        ? []
        : sortForKanban(
            tasks.filter(
              (item) =>
                item.projectId === task.projectId &&
                item.status === task.status &&
                item.id !== task.id,
            ),
          ).map((item, index) => ({ ...item, position: index + 1 }))),
    ];
    const replacements = new Map(affected.map((item) => [item.id, item]));
    setRecords((old) =>
      old.map((record) => replacements.get(record.id) || record),
    );
    try {
      if (targetColumn === columns.at(-1) && !completed(task)) {
        await Promise.all(
          affected.map((item) =>
            api<RecordItem>(`/records/${item.id}`, {
              method: "PUT",
              body: JSON.stringify(item),
            }),
          ),
        );
        const result = await api<Task[]>(`/tasks/${task.id}/complete`, {
          method: "POST",
          body: JSON.stringify({ complete: true, today }),
        });
        setRecords((old) => [
          ...result,
          ...old.filter(
            (record) => !result.some((item) => item.id === record.id),
          ),
        ]);
      } else {
        await Promise.all(
          affected.map((item) =>
            api<RecordItem>(`/records/${item.id}`, {
              method: "PUT",
              body: JSON.stringify(item),
            }),
          ),
        );
      }
    } catch (error) {
      await reload();
      throw error;
    }
  }
  const pointerDrag = useRef<{
    task: Task;
    pointerId: number;
    element: HTMLElement;
    offsetX: number;
    offsetY: number;
    originalStyle: string | null;
    targetColumn: string;
    targetElement: HTMLElement | null;
    targetIndex: number;
    sourceParent: HTMLElement;
    placeholder: HTMLDivElement;
    cardHeight: number;
    cardMargin: string;
    sourceCards: HTMLElement[];
    cleanup: () => void;
  } | null>(null);
  function animateCardReflow(
    cards: HTMLElement[],
    before: Map<HTMLElement, DOMRect>,
  ) {
    cards.forEach((card) => {
      const previous = before.get(card);
      if (!previous) return;
      const next = card.getBoundingClientRect();
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaY) < 1) return;
      card.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 260,
          easing: "cubic-bezier(.18,.9,.25,1)",
          fill: "none",
        },
      );
    });
  }
  async function toggleChecklistItem(task: Task, checklistId: string) {
    const updated = {
      ...task,
      checklist: task.checklist.map((item) =>
        item.id === checklistId ? { ...item, done: !item.done } : item,
      ),
    };
    await perform(async () => {
      await save(updated);
      setTaskPreview(updated);
      setToast("Passo atualizado.");
    });
  }
  function columnElementUnderPointer(clientX: number, clientY: number) {
    const target = document.elementFromPoint(
      clientX,
      clientY,
    ) as HTMLElement | null;
    return target?.closest<HTMLElement>(".kanban-column") || null;
  }
  function setDragTarget(
    drag: NonNullable<typeof pointerDrag.current>,
    targetElement: HTMLElement | null,
    clientY: number,
  ) {
    document
      .querySelectorAll(".drop-insertion-before")
      .forEach((card) => card.classList.remove("drop-insertion-before"));
    if (drag.targetElement !== targetElement) {
      drag.targetElement?.classList.remove("drop-target");
      targetElement?.classList.add("drop-target");
    }
    drag.targetElement = targetElement;
    drag.targetColumn = targetElement?.dataset.column || "";
    if (!targetElement) return;
    const cards = Array.from(
      targetElement.querySelectorAll<HTMLElement>(":scope > .kanban-card"),
    );
    const targetIndex = cards.findIndex(
      (card) =>
        clientY <
        card.getBoundingClientRect().top +
          card.getBoundingClientRect().height / 2,
    );
    const insertionPoint =
      cards[targetIndex === -1 ? cards.length : targetIndex] || null;
    if (
      drag.placeholder.nextSibling !== insertionPoint ||
      drag.placeholder.parentElement !== targetElement
    ) {
      const reflowCards = Array.from(
        new Set([
          ...drag.sourceParent.querySelectorAll<HTMLElement>(
            ":scope > .kanban-card",
          ),
          ...targetElement.querySelectorAll<HTMLElement>(
            ":scope > .kanban-card",
          ),
        ]),
      );
      const before = new Map(
        reflowCards.map((card) => [card, card.getBoundingClientRect()]),
      );
      targetElement.insertBefore(drag.placeholder, insertionPoint);
      drag.placeholder.style.height = `${drag.cardHeight}px`;
      drag.placeholder.style.marginBottom = drag.cardMargin;
      animateCardReflow(reflowCards, before);
    }
    insertionPoint?.classList.add("drop-insertion-before");
    drag.targetIndex = targetIndex === -1 ? cards.length : targetIndex;
  }
  function beginPointerDrag(event: ReactPointerEvent<HTMLElement>, task: Task) {
    if (
      (event.pointerType === "mouse" && event.button !== 0) ||
      (event.target as HTMLElement).closest("button, select, input, textarea")
    )
      return;
    event.preventDefault();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const sourceParent = element.parentElement;
    if (!sourceParent) return;
    const sourceCards = Array.from(
      sourceParent.querySelectorAll<HTMLElement>(":scope > .kanban-card"),
    ).filter((card) => card !== element);
    const placeholder = document.createElement("div");
    placeholder.className = "kanban-drag-space";
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.marginBottom = getComputedStyle(element).marginBottom;
    sourceParent.insertBefore(placeholder, element);
    document.body.appendChild(element);
    const drag = {
      task,
      pointerId: event.pointerId,
      element,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      originalStyle: element.getAttribute("style"),
      targetColumn: "",
      targetElement: null,
      targetIndex: 0,
      sourceParent,
      placeholder,
      cardHeight: rect.height,
      cardMargin: getComputedStyle(element).marginBottom,
      sourceCards,
      cleanup: () => {},
    };
    pointerDrag.current = drag;
    element.classList.add("is-pointer-dragging");
    Object.assign(element.style, {
      position: "fixed",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      margin: "0",
      zIndex: "80",
      pointerEvents: "none",
      transformOrigin: `${event.clientX - rect.left}px ${event.clientY - rect.top}px`,
      transition:
        "transform 150ms cubic-bezier(.2,.9,.2,1), box-shadow 150ms ease",
    });
    const move = (pointerEvent: PointerEvent) => {
      const active = pointerDrag.current;
      if (!active || active.pointerId !== pointerEvent.pointerId) return;
      pointerEvent.preventDefault();
      active.element.style.left = `${pointerEvent.clientX - active.offsetX}px`;
      active.element.style.top = `${pointerEvent.clientY - active.offsetY}px`;
      setDragTarget(
        active,
        columnElementUnderPointer(pointerEvent.clientX, pointerEvent.clientY),
        pointerEvent.clientY,
      );
    };
    const finish = (pointerEvent: PointerEvent) =>
      finishPointerDrag(pointerEvent);
    const cancel = (pointerEvent: PointerEvent) =>
      finishPointerDrag(pointerEvent, true);
    const blur = () => finishPointerDrag(null, true);
    drag.cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners keep the interaction intact on browsers without capture.
    }
    requestAnimationFrame(() => {
      if (pointerDrag.current?.element === element) {
        const before = new Map(
          sourceCards.map((card) => [card, card.getBoundingClientRect()]),
        );
        placeholder.style.height = "0";
        placeholder.style.marginBottom = "0";
        animateCardReflow(sourceCards, before);
        element.style.transform = "scale(1.018) rotate(0.7deg)";
      }
    });
  }
  function finishPointerDrag(event: PointerEvent | null, cancelled = false) {
    const drag = pointerDrag.current;
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    const targetElement =
      !cancelled && event
        ? columnElementUnderPointer(event.clientX, event.clientY)
        : null;
    const targetColumn = targetElement?.dataset.column || "";
    drag.cleanup();
    drag.targetElement?.classList.remove("drop-target");
    document
      .querySelectorAll(".drop-insertion-before")
      .forEach((card) => card.classList.remove("drop-insertion-before"));
    if (event && drag.element.hasPointerCapture(event.pointerId))
      drag.element.releasePointerCapture(event.pointerId);
    if (drag.originalStyle === null) drag.element.removeAttribute("style");
    else drag.element.setAttribute("style", drag.originalStyle);
    drag.element.classList.remove("is-pointer-dragging");
    const before = new Map(
      drag.sourceCards.map((card) => [card, card.getBoundingClientRect()]),
    );
    // React owns the board columns. Restore the dragged node to its original
    // parent before changing state so React can perform the destination move.
    drag.sourceParent.appendChild(drag.placeholder);
    drag.sourceParent.insertBefore(drag.element, drag.placeholder);
    drag.placeholder.remove();
    animateCardReflow(drag.sourceCards, before);
    pointerDrag.current = null;
    if (!cancelled && targetColumn)
      void perform(() =>
        moveKanbanTask(drag.task, targetColumn, drag.targetIndex),
      );
  }
  const pageTitle = tr(
    {
      today: "Meu dia",
      tasks: "Minhas tarefas",
      calendar: "Calendário",
      projects: "Projetos",
      notes: "Notas & ideias",
      passwords: "Senhas & chaves",
      mail: "Caixa de e-mail",
      settings: "Configurações",
    }[page],
  );
  const unread = mails.filter((m) => m.folder === "inbox" && m.unread).length;
  function newMail(reply?: Mail) {
    setCompose({
      id: uid(),
      folder: "drafts",
      sender: status.mailAddresses.inbox,
      recipient: reply?.sender || "",
      subject: reply
        ? reply.subject.startsWith("Re:")
          ? reply.subject
          : `Re: ${reply.subject}`
        : "",
      body: "",
      received_at: new Date().toISOString(),
      unread: 0,
      attachments: [],
      send_state: "draft",
      reply_to: reply?.message_id,
    });
    setComposeDirty(false);
  }
  async function saveDraft() {
    if (!compose) return;
    await api(`/mail/${compose.id}`, {
      method: "PUT",
      body: JSON.stringify(compose),
    });
    setComposeDirty(false);
    setMails(await api<Mail[]>("/mail"));
  }
  async function moveMail(m: Mail, target: Mail["folder"]) {
    await perform(async () => {
      await api(`/mail/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ folder: target }),
      });
      setMails((old) =>
        old.map((x) => (x.id === m.id ? { ...x, folder: target } : x)),
      );
      setSelectedMail(null);
      setToast(
        target === "trash" ? "E-mail movido para a lixeira." : "E-mail movido.",
      );
    });
  }
  function selectMail(m: Mail) {
    if (m.folder === "drafts") {
      setCompose(m);
      setComposeDirty(false);
      return;
    }
    setSelectedMail(m);
    if (m.unread)
      void perform(async () => {
        await api(`/mail/${m.id}`, {
          method: "PATCH",
          body: JSON.stringify({ unread: false }),
        });
        setMails((old) =>
          old.map((x) => (x.id === m.id ? { ...x, unread: 0 } : x)),
        );
      });
  }
  function projectSelect() {
    return (
      <select
        aria-label={tr("Filtrar projeto")}
        value={projectFilter}
        onChange={(e) => setProjectFilter(e.target.value)}
      >
        <option value="">{tr("Todos os projetos")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    );
  }
  function calendar() {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    let days = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
    if (calendarMode === "week") {
      const d = new Date(`${selectedDate}T12:00:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      days = Array.from({ length: 7 }, (_, i) => {
        const n = new Date(d);
        n.setDate(n.getDate() + i);
        return n;
      });
    }
    if (calendarMode === "day") days = [new Date(`${selectedDate}T12:00:00`)];
    const move = (direction: number) => {
      if (calendarMode === "month")
        setMonth(
          new Date(month.getFullYear(), month.getMonth() + direction, 1),
        );
      else {
        const d = new Date(`${selectedDate}T12:00:00`);
        d.setDate(d.getDate() + direction * (calendarMode === "week" ? 7 : 1));
        setSelectedDate(localDate(d));
        setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    };
    return (
      <>
        <div className="toolbar">
          <div className="calendar-nav">
            <button
              className="icon-btn"
              aria-label={tr("Período anterior")}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <h2>
              {month.toLocaleDateString(settings.language || "pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              className="icon-btn"
              aria-label={tr("Próximo período")}
              onClick={() => move(1)}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="secondary"
              onClick={() => {
                setMonth(
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                );
                setSelectedDate(today);
              }}
            >
              {tr("Hoje")}
            </button>
          </div>
          <div className="segmented">
            {(["month", "week", "day"] as const).map((m, i) => (
              <button
                key={m}
                className={calendarMode === m ? "active" : ""}
                onClick={() => setCalendarMode(m)}
              >
                {tr(["Mês", "Semana", "Dia"][i])}
              </button>
            ))}
          </div>
        </div>
        <div className="calendar-scroll">
          <div
            className={`calendar-grid ${calendarMode === "day" ? "single-day" : ""}`}
          >
            {calendarMode !== "day" &&
              ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d} className="weekday">
                  {tr(d)}
                </div>
              ))}
            {days.map((d) => {
              const key = localDate(d);
              return (
                <div
                  key={key}
                  className={`calendar-cell ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${key === selectedDate ? "selected" : ""}`}
                >
                  <button
                    className={`date-number ${key === today ? "current" : ""}`}
                    onClick={() => {
                      setSelectedDate(key);
                      setCalendarDay(key);
                    }}
                  >
                    {d.getDate()}
                  </button>
                  <button
                    className="date-add"
                    aria-label={`Adicionar compromisso em ${dateLabel(key)}`}
                    onClick={() => newEvent(key)}
                  >
                    <Plus size={13} />
                  </button>
                  {events
                    .filter((e) => e.date === key)
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((e) => (
                      <button
                        key={e.id}
                        className="calendar-event"
                        onClick={() => setEditor(e)}
                      >
                        {e.time} {e.title}
                      </button>
                    ))}
                  {sortByPriority(tasks.filter((t) => t.due === key)).map(
                    (t) => (
                      <button
                        key={t.id}
                        className={`calendar-task priority-calendar-${t.priority} ${completed(t) ? "done" : ""}`}
                        onClick={() => setTaskPreview(t)}
                      >
                        <Circle size={9} />
                        {t.time ? `${t.time} · ${t.title}` : t.title}
                      </button>
                    ),
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="calendar-footer">
          <span>
            <i className="dot violet" />
            {tr("Compromissos")}
          </span>
          <span>
            <i className="dot gold" />
            {tr("Tarefas com prazo")}
          </span>
          <button
            className="text-btn"
            onClick={() => newTask("", selectedDate)}
          >
            {tr("Adicionar tarefa em")} {dateLabel(selectedDate)}{" "}
            <Plus size={14} />
          </button>
        </div>
      </>
    );
  }
  return (
    <div
      className={`app theme-${themeEditor ? "custom" : themePresets[settings.theme || "original"] ? settings.theme || "original" : "custom"}`}
      style={themeStyle(
        themeEditor
          ? { ...settings, theme: themeEditor.id, customThemes: [themeEditor] }
          : settings,
      )}
    >
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("today");
          }}
        >
          <img
            src={settings.logoUrl || "/logo.svg"}
            alt="Grimório"
          />
          <span>{tr("WORKSPACE")}</span>
        </a>
        <div className="workspace-label">
          <img
            className="workspace-avatar"
            src={settings.avatarUrl || "/avatar.svg"}
            alt={settings.name}
          />
          <div>
            <strong>{tr("Meu espaço")}</strong>
            <small>{tr("Pessoal & profissional")}</small>
          </div>
        </div>
        <div className="nav-label">{tr("PRINCIPAL")}</div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              key={id}
            >
              <Icon size={19} />
              <span>{tr(label)}</span>
              {id === "mail" && unread > 0 && <b className="count">{unread}</b>}
              {id === "today" && <span className="tiny-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-label projects-label">
          {tr("SEUS PROJETOS")}
          <button
            className="icon-btn"
            aria-label={tr("Criar projeto")}
            onClick={newProject}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-projects">
          {projects.length ? (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProjectFilter(p.id);
                  navigate("projects");
                }}
              >
                <i className="dot" style={{ background: p.color }} />
                {p.title}
              </button>
            ))
          ) : (
            <p>
              {tr("Nenhum projeto cadastrado.")}
              <button onClick={newProject}>
                {tr("Criar primeiro projeto")} <ArrowUpRight size={13} />
              </button>
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <img
              className="profile-avatar"
              src={settings.avatarUrl || "/avatar.svg"}
              alt={settings.name}
            />
            <div>
              <strong>{settings.name}</strong>
              <small>{tr("Meu espaço")}</small>
            </div>
            <button
              className={`icon-btn profile-settings ${page === "settings" ? "active" : ""}`}
              aria-label={tr("Configurações")}
              onClick={() => navigate("settings")}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label={tr("Abrir navegação")}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>{tr("Meu espaço")}</span>
            <ChevronRight size={13} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-top">
              <CalendarDays size={14} />
              {new Date().toLocaleDateString(settings.language || "pt-BR", {
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>
        </header>
        <main className="page-enter" key={page}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "today"
                  ? new Date().toLocaleDateString(
                      settings.language || "pt-BR",
                      { weekday: "long" },
                    )
                  : "GRIMÓRIO"}
              </div>
              <h1>
                {page === "today" ? (
                  <>
                    {tr("Olá,")} {settings.name}
                    <span className="gold-period">.</span>
                  </>
                ) : (
                  pageTitle
                )}
              </h1>
            </div>
            {page !== "passwords" && (
              <button
                className="primary"
                onClick={() =>
                  page === "mail"
                    ? newMail()
                    : page === "projects"
                      ? newProject()
                      : page === "notes"
                        ? newNote()
                        : page === "calendar"
                          ? newEvent()
                          : newTask("")
                }
              >
                <Plus size={17} />
                {tr(
                  page === "mail"
                    ? "Escrever e-mail"
                    : page === "projects"
                      ? "Novo projeto"
                      : page === "notes"
                        ? "Nova nota"
                        : page === "calendar"
                          ? "Novo compromisso"
                          : "Nova tarefa",
                )}
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {tr(error)}
              <button className="text-btn" onClick={() => setError("")}>
                {tr("Fechar")}
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">{tr("Organizando seu espaço…")}</div>
          ) : (
            <>
              {page === "today" && (
                <>
                  <div className="stats">
                    <div>
                      <span className="stat-icon violet">
                        <ListTodo size={20} />
                      </span>
                      <p>
                        {tr("Tarefas para hoje")}
                        <strong>
                          {dayTasks
                            .filter((t) => !completed(t))
                            .length.toString()
                            .padStart(2, "0")}
                        </strong>
                        <small>
                          {
                            openTasks.filter((t) => t.due && t.due < today)
                              .length
                          }{" "}
                          {tr("pendentes de outros dias")}
                        </small>
                      </p>
                    </div>
                    <div>
                      <span className="stat-icon gold">
                        <CalendarDays size={20} />
                      </span>
                      <p>
                        {tr("Na agenda")}
                        <strong>
                          {todayEvents.length.toString().padStart(2, "0")}
                        </strong>
                        <small>{tr("Compromissos de hoje")}</small>
                      </p>
                    </div>
                    <div>
                      <span className="stat-icon green">
                        <FolderKanban size={20} />
                      </span>
                      <p>
                        {tr("Projetos")}
                        <strong>
                          {projects.length.toString().padStart(2, "0")}
                        </strong>
                        <small>{tr("Ideias em movimento")}</small>
                      </p>
                    </div>
                    <div>
                      <span className="stat-icon blue">
                        <MailIcon size={20} />
                      </span>
                      <p>
                        {tr("Não lidos")}
                        <strong>{unread.toString().padStart(2, "0")}</strong>
                        <small>{tr("Na sua caixa de entrada")}</small>
                      </p>
                    </div>
                  </div>
                  <div className="today-grid">
                    <section className="panel focus-panel">
                      <div className="section-heading">
                        <h2>
                          <span className="section-marker" />
                          {tr("Seu foco de hoje")}{" "}
                          <span className="sub-count">{dayTasks.length}</span>
                        </h2>
                        <button
                          className="text-btn"
                          onClick={() => navigate("tasks")}
                        >
                          {tr("Ver todas")} <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {dayTasks.length ? (
                        <div className="task-list">{dayTasks.map(taskRow)}</div>
                      ) : (
                        <Empty
                          icon={CheckCheck}
                          title={tr("Nenhuma tarefa para hoje")}
                          detail={tr("Crie uma tarefa para começar.")}
                          action={
                            <button
                              className="secondary"
                              onClick={() => newTask("")}
                            >
                              {tr("Planejar uma tarefa")} <Plus size={14} />
                            </button>
                          }
                        />
                      )}
                      <form className="quick-add" onSubmit={quickAdd}>
                        <Plus size={18} />
                        <input
                          aria-label={tr("Captura rápida")}
                          placeholder={tr(
                            "Uma ideia ou pendência? Capture aqui…",
                          )}
                          value={quick}
                          onChange={(e) => setQuick(e.target.value)}
                          maxLength={200}
                        />
                        <button
                          disabled={busy || !quick.trim()}
                          aria-label={tr("Capturar tarefa")}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </form>
                    </section>
                    <section className="panel agenda-panel">
                      <div className="section-heading">
                        <h2>{tr("Na agenda")}</h2>
                        <span className="tag">{tr("HOJE")}</span>
                      </div>
                      {todayEvents.length ? (
                        todayEvents.map((e) => (
                          <button
                            className="agenda-item"
                            key={e.id}
                            onClick={() => setEditor(e)}
                          >
                            <span>
                              {e.time}
                              <small>{e.endTime}</small>
                            </span>
                            <div>
                              <strong>{e.title}</strong>
                              <small>
                                {e.description || tr("Compromisso pessoal")}
                              </small>
                            </div>
                          </button>
                        ))
                      ) : (
                        <Empty
                          icon={Clock3}
                          title={tr("Nenhum compromisso para hoje")}
                          detail={tr("Crie um compromisso no calendário.")}
                        />
                      )}
                      <button
                        className="agenda-footer"
                        onClick={() => navigate("calendar")}
                      >
                        {tr("Abrir calendário")} <ArrowUpRight size={15} />
                      </button>
                    </section>
                    <section className="projects-overview">
                      <div className="section-heading">
                        <h2>{tr("Seus projetos")}</h2>
                        <button
                          className="text-btn"
                          onClick={() => navigate("projects")}
                        >
                          {tr("Todos os projetos")} <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="project-cards">
                        {projects.slice(0, 3).map((p) => {
                          const ts = tasks.filter((t) => t.projectId === p.id),
                            done = ts.filter(completed).length;
                          return (
                            <button
                              className="project-card"
                              key={p.id}
                              onClick={() => {
                                setProjectFilter(p.id);
                                navigate("projects");
                              }}
                            >
                              <span
                                className="project-symbol"
                                style={{ color: p.color }}
                              >
                                <FolderKanban size={22} />
                              </span>
                              <ArrowUpRight size={17} className="card-arrow" />
                              <h3>{p.title}</h3>
                              <p>
                                {p.description ||
                                  "Cada etapa, um passo à frente."}
                              </p>
                              <div className="progress-track">
                                <span
                                  style={{
                                    width: `${ts.length ? (done / ts.length) * 100 : 100}%`,
                                    background: p.color,
                                  }}
                                />
                              </div>
                              <footer>
                                <span>
                                  {done} {tr("de")} {ts.length} {tr("tarefas")}
                                </span>
                                <b>
                                  {ts.length
                                    ? Math.round((done / ts.length) * 100)
                                    : 100}
                                  %
                                </b>
                              </footer>
                            </button>
                          );
                        })}
                        <button
                          className="new-project-card"
                          onClick={newProject}
                        >
                          <span>
                            <Plus size={22} />
                          </span>
                          <strong>{tr("Uma nova ideia?")}</strong>
                          <small>{tr("Crie um espaço para ela")}</small>
                        </button>
                      </div>
                    </section>
                    <section className="quick-note-panel">
                      <div className="quick-note-heading">
                        <div>
                          <h2>{tr("Bloco rápido")}</h2>
                          <p>{tr("Escreva. Ele salva sozinho.")}</p>
                        </div>
                      </div>
                      <ResizableTextarea
                        aria-label={tr("Bloco de notas rápido")}
                        value={quickNote}
                        onChange={(e) => updateQuickNote(e.target.value)}
                        placeholder={tr("Anote antes que a ideia passe…")}
                        rows={6}
                        maxLength={3000}
                      />
                      <small aria-live="polite">
                        {quickNoteSaving
                          ? tr("Salvando…")
                          : quickNote.trim()
                            ? tr("Salvo automaticamente")
                            : tr("Apague tudo para descartar")}
                      </small>
                    </section>
                  </div>
                </>
              )}
              {page === "tasks" && (
                <>
                  <div className="toolbar">
                    <div className="segmented">
                      {[
                        ["open", "Em aberto"],
                        ["done", "Concluídas"],
                        ["all", "Todas"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={taskFilter === id ? "active" : ""}
                          onClick={() => setTaskFilter(id)}
                        >
                          {tr(label)}
                        </button>
                      ))}
                    </div>
                    <div className="filters">
                      <label className="search">
                        <Search size={16} />
                        <input
                          placeholder={tr("Buscar tarefa…")}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="panel">
                    {filteredTasks.length ? (
                      filteredTasks.map(taskRow)
                    ) : (
                      <Empty
                        icon={ListTodo}
                        title={tr("Nenhuma tarefa por aqui")}
                        detail={tr(
                          "Crie uma tarefa ou ajuste os filtros para encontrar o que procura.",
                        )}
                        action={
                          <button
                            className="secondary"
                            onClick={() => newTask("")}
                          >
                            {tr("Adicionar tarefa")} <Plus size={15} />
                          </button>
                        }
                      />
                    )}
                  </div>
                </>
              )}
              {page === "calendar" && (
                <section className="panel calendar-panel">{calendar()}</section>
              )}
              {page === "projects" && (
                <>
                  {projects.length > 0 ? (
                    activeProject ? (
                      <>
                        <div className="project-board-heading">
                          <button
                            className="secondary"
                            onClick={() => setProjectFilter("")}
                          >
                            <ArrowLeft size={16} /> {tr("Visão geral")}
                          </button>
                          <div className="project-board-title">
                            <i
                              className="dot"
                              style={{ background: activeProject.color }}
                            />
                            <div>
                              <strong>{activeProject.title}</strong>
                              <small>
                                {activeProject.description ||
                                  "Organize as próximas etapas deste projeto."}
                              </small>
                            </div>
                          </div>
                          <div className="project-board-actions">
                            <button
                              className="icon-btn"
                              aria-label={`Editar ${activeProject.title}`}
                              onClick={() => setEditor(activeProject)}
                            >
                              <Settings2 size={17} />
                            </button>
                            <button
                              className="icon-btn project-delete"
                              aria-label={`Excluir ${activeProject.title}`}
                              onClick={() => setDeleteItem(activeProject)}
                            >
                              <Trash2 size={17} />
                            </button>
                            <button
                              className="secondary"
                              onClick={() => newTask(projectFilter)}
                            >
                              <Plus size={16} /> {tr("Tarefa")}
                            </button>
                          </div>
                        </div>
                        <div className="kanban">
                          {columns.map((column, index) => {
                            const ts = sortForKanban(
                              tasks.filter(
                                (t) =>
                                  t.projectId === projectFilter &&
                                  t.status === column,
                              ),
                            );
                            return (
                              <section
                                className="kanban-column"
                                key={column}
                                data-column={column}
                              >
                                <h3>
                                  <i
                                    className={`dot ${index === columns.length - 1 ? "green" : index === 1 ? "violet" : "gold"}`}
                                  />
                                  {tr(column)}
                                  <span>{ts.length}</span>
                                  <button
                                    className="icon-btn"
                                    aria-label={`${tr("Adicionar tarefa em")} ${tr(column)}`}
                                    onClick={() =>
                                      setEditor({
                                        ...blankTask(),
                                        projectId: projectFilter,
                                        status: column,
                                      })
                                    }
                                  >
                                    <Plus size={15} />
                                  </button>
                                </h3>
                                {ts.map((t) => (
                                  <article
                                    className={`kanban-card priority-card-${t.priority}`}
                                    key={t.id}
                                    onPointerDown={(e) =>
                                      beginPointerDrag(e, t)
                                    }
                                  >
                                    <div className="kanban-card-top">
                                      <span
                                        className={`priority-badge priority-${t.priority}`}
                                      >
                                        <Flag size={12} />
                                        {tr(priorities[t.priority])}
                                      </span>
                                      <span className="kanban-card-actions">
                                        <button
                                          className="icon-btn kanban-view"
                                          aria-label={`${tr("Visualizar")} ${t.title}`}
                                          onClick={() => setTaskPreview(t)}
                                        >
                                          <Eye size={15} />
                                        </button>
                                        <button
                                          className="icon-btn kanban-edit"
                                          aria-label={`${tr("Editar")} ${t.title}`}
                                          onClick={() => setEditor(t)}
                                        >
                                          <Pencil size={15} />
                                        </button>
                                      </span>
                                    </div>
                                    <h3 className="kanban-card-title">
                                      {t.title}
                                    </h3>
                                    {t.description && (
                                      <p>{t.description.slice(0, 110)}</p>
                                    )}
                                    {t.tags && (
                                      <div className="tags">
                                        {t.tags
                                          .split(",")
                                          .filter(Boolean)
                                          .map((tag) => (
                                            <span key={tag}>{tag.trim()}</span>
                                          ))}
                                      </div>
                                    )}
                                    <footer>
                                      <span>
                                        <CalendarDays size={12} />
                                        {dateLabel(t.due)}
                                        {t.time ? ` · ${t.time}` : ""}
                                      </span>
                                      <Flag
                                        size={13}
                                        className={`priority-${t.priority}`}
                                      />
                                    </footer>
                                    <select
                                      aria-label={`${tr("Mover")} ${t.title}`}
                                      value={t.status}
                                      onChange={(e) =>
                                        void perform(() =>
                                          moveKanbanTask(t, e.target.value),
                                        )
                                      }
                                    >
                                      {columns.map((c) => (
                                        <option key={c} value={c}>
                                          {tr(c)}
                                        </option>
                                      ))}
                                    </select>
                                  </article>
                                ))}
                                {!ts.length && (
                                  <div className="column-empty">
                                    {tr("Arraste uma tarefa para cá")}
                                    <br />
                                    {tr("ou adicione um novo passo.")}
                                  </div>
                                )}
                              </section>
                            );
                          })}
                        </div>
                        <p className="board-hint">
                          {tr(
                            "Arraste os cartões entre etapas ou use o seletor de cada tarefa.",
                          )}
                        </p>
                      </>
                    ) : (
                      <div className="projects-dashboard">
                        <div className="project-metrics">
                          <div>
                            <span className="stat-icon violet">
                              <FolderKanban size={20} />
                            </span>
                            <p>
                              {tr("Projetos ativos")}
                              <strong>
                                {projects.length.toString().padStart(2, "0")}
                              </strong>
                              <small>
                                {projectOpenTasks} {tr("tarefas em andamento")}
                              </small>
                            </p>
                          </div>
                          <div>
                            <span className="stat-icon gold">
                              <CheckCheck size={20} />
                            </span>
                            <p>
                              {tr("Concluídas")}
                              <strong>
                                {projectDoneTasks.toString().padStart(2, "0")}
                              </strong>
                              <small>{tr("Entregas já finalizadas")}</small>
                            </p>
                          </div>
                          <div>
                            <span className="stat-icon green">
                              <Flag size={20} />
                            </span>
                            <p>
                              {tr("Alta prioridade")}
                              <strong>
                                {projectHighTasks.toString().padStart(2, "0")}
                              </strong>
                              <small>{tr("Tarefas que pedem foco")}</small>
                            </p>
                          </div>
                          <div>
                            <span className="stat-icon blue">
                              <Clock3 size={20} />
                            </span>
                            <p>
                              {tr("Em atraso")}
                              <strong>
                                {projectOverdueTasks
                                  .toString()
                                  .padStart(2, "0")}
                              </strong>
                              <small>{tr("Itens além do prazo")}</small>
                            </p>
                          </div>
                        </div>
                        <section className="panel projects-analysis">
                          <div className="section-heading">
                            <div>
                              <h2>
                                <span className="section-marker" />
                                {tr("Panorama dos projetos")}
                              </h2>
                              <p className="panel-subtitle">
                                {tr("Selecione um projeto para ver as tarefas.")}
                              </p>
                            </div>
                          </div>
                          <div className="project-analysis-list">
                            {projectSummaries
                              .sort(
                                (a, b) =>
                                  b.high - a.high ||
                                  b.overdue - a.overdue ||
                                  a.progress - b.progress,
                              )
                              .map(
                                ({
                                  project,
                                  total,
                                  done,
                                  open,
                                  high,
                                  overdue,
                                  progress,
                                }) => (
                                  <button
                                    className="project-analysis-row"
                                    key={project.id}
                                    onClick={() => setProjectFilter(project.id)}
                                  >
                                    <span
                                      className="project-analysis-dot"
                                      style={{ background: project.color }}
                                    />
                                    <div className="project-analysis-main">
                                      <strong>{project.title}</strong>
                                      <small>
                                        {open
                                          ? `${open} ${tr("tarefas abertas")}`
                                          : tr("Tudo concluído")}
                                        {high
                                          ? ` · ${high} ${tr("prioridade alta")}`
                                          : ""}
                                        {overdue
                                          ? ` · ${overdue} ${tr("em atraso")}`
                                          : ""}
                                      </small>
                                      <span className="progress-track">
                                        <i
                                          style={{
                                            width: `${progress}%`,
                                            background: project.color,
                                          }}
                                        />
                                      </span>
                                    </div>
                                    <div className="project-analysis-progress">
                                      <strong>{progress}%</strong>
                                      <small>
                                        {done}/{total || 0}
                                      </small>
                                    </div>
                                    <ArrowUpRight size={17} />
                                  </button>
                                ),
                              )}
                          </div>
                        </section>
                      </div>
                    )
                  ) : (
                    <div className="panel">
                      <Empty
                        icon={FolderKanban}
                        title={tr("Nenhum projeto cadastrado.")}
                        detail={tr(
                          "Crie seu primeiro projeto e personalize as etapas do seu fluxo.",
                        )}
                        action={
                          <button className="primary" onClick={newProject}>
                            <Plus size={16} />
                            {tr("Criar projeto")}
                          </button>
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {page === "notes" && (
                <>
                  <div className="toolbar">
                    {projectSelect()}
                    <label className="search">
                      <Search size={16} />
                      <input
                        placeholder={tr("Buscar nas notas…")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="notes-grid">
                    {notes
                      .filter(
                        (n) =>
                          (!projectFilter || n.projectId === projectFilter) &&
                          `${n.title} ${n.body}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((n) => (
                        <button
                          className="note-card"
                          key={n.id}
                          onClick={() => setEditor(n)}
                        >
                          <FileText size={19} />
                          <h3>{n.title}</h3>
                          <p>{n.body || tr("Continue sua ideia…")}</p>
                          <span>
                            {projects.find((p) => p.id === n.projectId)
                              ?.title || tr("Nota pessoal")}
                          </span>
                        </button>
                      ))}
                    <button className="new-project-card" onClick={newNote}>
                      <span>
                        <Plus size={22} />
                      </span>
                      <strong>{tr("Deixe uma ideia aqui")}</strong>
                      <small>{tr("Criar nova nota")}</small>
                    </button>
                  </div>
                </>
              )}
              {page === "passwords" && (
                <PasswordsPage language={settings.language} />
              )}
              {page === "mail" && (
                <>
                  {!status.mailEnabled && (
                    <div className="notice">
                      <MailIcon size={18} />
                      <div>
                        <strong>
                          {tr("Seu e-mail está sendo preparado.")}
                        </strong>
                        <span>
                          {tr(
                            "Você já pode escrever e salvar rascunhos. Envio e\r\n                          recebimento serão ativados após configurar o domínio.",
                          )}
                        </span>
                      </div>
                      <span className="tag">{tr("CONFIGURAÇÃO PENDENTE")}</span>
                    </div>
                  )}
                  <div className="mail-layout">
                    <aside className="mail-folders">
                      {(
                        [
                          ["inbox", "Entrada", Inbox],
                          ["sent", "Enviados", Send],
                          ["drafts", "Rascunhos", Pencil],
                          ["archive", "Arquivo", Archive],
                          ["trash", "Lixeira", Trash2],
                        ] as const
                      ).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          className={folder === id ? "active" : ""}
                          onClick={() => {
                            setFolder(id);
                            setSelectedMail(null);
                          }}
                        >
                          <Icon size={17} />
                          {tr(label)}
                          <span>
                            {mails.filter((m) => m.folder === id).length}
                          </span>
                        </button>
                      ))}
                      <div className="mail-identity">
                        <i className="dot violet" />
                        {status.mailAddresses.inbox || tr("E-mail não configurado")}
                        <small>{tr("Envio e recebimento")}</small>
                        <i className="dot gold" />
                        {status.mailAddresses.noReply || tr("E-mail não configurado")}
                        <small>{tr("Somente envio")}</small>
                      </div>
                    </aside>
                    <section className="mail-content">
                      {selectedMail ? (
                        <>
                          <div className="mail-actions">
                            <button
                              className="text-btn"
                              onClick={() => setSelectedMail(null)}
                            >
                              <ArrowLeft size={16} />
                              {tr("Voltar")}
                            </button>
                            <div>
                              <button
                                className="icon-btn"
                                aria-label={tr("Arquivar")}
                                onClick={() =>
                                  void moveMail(selectedMail, "archive")
                                }
                              >
                                <Archive size={18} />
                              </button>
                              <button
                                className="icon-btn"
                                aria-label={tr("Mover para lixeira")}
                                onClick={() =>
                                  void moveMail(selectedMail, "trash")
                                }
                              >
                                <Trash2 size={18} />
                              </button>
                              {selectedMail.folder === "trash" && (
                                <button
                                  className="text-btn"
                                  onClick={() =>
                                    void moveMail(selectedMail, "inbox")
                                  }
                                >
                                  {tr("Restaurar")}
                                </button>
                              )}
                            </div>
                          </div>
                          <article className="mail-reading">
                            <h2>{selectedMail.subject || "(sem assunto)"}</h2>
                            <div className="mail-metadata">
                              <strong>{selectedMail.sender}</strong>
                              <span>
                                {tr("Para:")} {selectedMail.recipient}
                              </span>
                              <small>
                                {new Date(
                                  selectedMail.received_at,
                                ).toLocaleString(settings.language || "pt-BR")}
                              </small>
                            </div>
                            <div className="mail-body">{selectedMail.body}</div>
                            {selectedMail.attachments.map((a) => (
                              <a
                                className="attachment"
                                key={a.id}
                                href={`/api/mail/${selectedMail.id}/attachments/${a.id}`}
                                download
                              >
                                <Paperclip size={16} />
                                {a.filename}
                                <ArrowDownToLine size={15} />
                              </a>
                            ))}
                            <div className="mail-bottom-actions">
                              <button
                                className="secondary"
                                onClick={() => newMail(selectedMail)}
                              >
                                <ArrowLeft size={15} />
                                {tr("Responder")}
                              </button>
                              <button
                                className="secondary"
                                onClick={() =>
                                  setEditor({
                                    ...blankTask(),
                                    title:
                                      selectedMail.subject ||
                                      "Acompanhar e-mail",
                                    description: selectedMail.body.slice(
                                      0,
                                      2000,
                                    ),
                                    mailId: selectedMail.id,
                                  })
                                }
                              >
                                <ListTodo size={16} />
                                {tr("Criar tarefa")}
                              </button>
                            </div>
                          </article>
                        </>
                      ) : (
                        <>
                          <div className="mail-search">
                            <Search size={17} />
                            <input
                              placeholder={tr(
                                "Buscar remetente, assunto ou mensagem…",
                              )}
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </div>
                          {mails.filter(
                            (m) =>
                              m.folder === folder &&
                              `${m.sender} ${m.subject} ${m.body}`
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                          ).length ? (
                            mails
                              .filter(
                                (m) =>
                                  m.folder === folder &&
                                  `${m.sender} ${m.subject} ${m.body}`
                                    .toLowerCase()
                                    .includes(query.toLowerCase()),
                              )
                              .map((m) => (
                                <button
                                  key={m.id}
                                  className={`mail-row ${m.unread ? "unread" : ""}`}
                                  onClick={() => selectMail(m)}
                                >
                                  <span className="mail-avatar">
                                    {(m.folder === "sent"
                                      ? m.recipient
                                      : m.sender
                                    )
                                      .charAt(0)
                                      .toUpperCase()}
                                  </span>
                                  <div>
                                    <strong>
                                      {m.folder === "sent"
                                        ? m.recipient
                                        : m.sender}
                                    </strong>
                                    <h3>{m.subject || "(sem assunto)"}</h3>
                                    <p>
                                      {m.body.slice(0, 110) ||
                                        "Rascunho em branco"}
                                    </p>
                                  </div>
                                  <small>
                                    {new Date(m.received_at).toLocaleDateString(
                                      settings.language || "pt-BR",
                                      { day: "2-digit", month: "short" },
                                    )}
                                  </small>
                                </button>
                              ))
                          ) : (
                            <Empty
                              icon={Inbox}
                              title={tr(
                                query
                                  ? "Nenhum resultado"
                                  : "Tudo tranquilo por aqui",
                              )}
                              detail={tr(
                                query
                                  ? "Experimente outro termo de busca."
                                  : folder === "drafts"
                                    ? "Seus rascunhos salvos aparecerão aqui."
                                    : "As mensagens desta pasta aparecerão aqui.",
                              )}
                            />
                          )}
                        </>
                      )}
                    </section>
                  </div>
                </>
              )}
              {page === "settings" && (
                <div className="settings-grid">
                  <section className="panel settings-panel customization-panel">
                    <h2>
                      <ImagePlus size={18} /> {tr("Identidade visual")}
                    </h2>
                    <p>
                      {tr(
                        "Personalize seu nome e as imagens do app. A logo também pode aparecer na assinatura dos seus e-mails.",
                      )}
                    </p>
                    <form
                      className="identity-name-form"
                      key={settings.name}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const name = String(
                          new FormData(event.currentTarget).get("name") || "",
                        ).trim();
                        void perform(() =>
                          savePreferences(
                            { ...settings, name },
                            "Nome atualizado.",
                          ),
                        );
                      }}
                    >
                      <label>
                        {tr("Como quer ser chamado?")}
                        <input
                          name="name"
                          required
                          maxLength={200}
                          defaultValue={settings.name}
                        />
                      </label>
                      <button className="secondary" disabled={busy}>
                        <Check size={15} /> {tr("Salvar nome")}
                      </button>
                    </form>
                    <div className="identity-grid">
                      {(
                        [
                          {
                            kind: "icon",
                            title: "Ícone do app",
                            hint: "Aparece na aba e na tela inicial. A imagem será recortada em quadrado.",
                            src: settings.iconUrl || "/app-icon.svg",
                          },
                          {
                            kind: "logo",
                            title: "Logo",
                            hint: "Menu lateral e assinatura de e-mail.",
                            src: settings.logoUrl || "/logo.svg",
                          },
                          {
                            kind: "avatar",
                            title: "Foto de perfil",
                            hint: "Aparece no seu espaço e no perfil.",
                            src: settings.avatarUrl || "/avatar.svg",
                          },
                        ] as const
                      ).map(({ kind, title, hint, src }) => (
                        <div
                          className={`identity-item identity-${kind}`}
                          key={kind}
                        >
                          <div className="identity-preview">
                            <img src={src} alt={tr(title)} />
                          </div>
                          <div className="identity-copy">
                            <strong>{tr(title)}</strong>
                            <small>{tr(hint)}</small>
                          </div>
                          <div className="identity-actions">
                            <label className="secondary identity-upload">
                              <ImagePlus size={15} />{" "}
                              {tr(
                                identityBusy === kind
                                  ? "Enviando…"
                                  : "Escolher imagem",
                              )}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={!!identityBusy || busy}
                                onChange={(event) => {
                                  void uploadIdentity(
                                    kind,
                                    event.target.files?.[0],
                                  );
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            {(kind === "icon"
                              ? settings.iconUrl
                              : kind === "logo"
                                ? settings.logoUrl
                                : settings.avatarUrl) && (
                              <button
                                className="text-btn"
                                disabled={busy || !!identityBusy}
                                onClick={() => resetIdentity(kind)}
                              >
                                {tr("Restaurar")}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <small className="settings-hint">
                      {tr(
                        "PNG, JPEG ou WebP · até 2 MB. Para o ícone, use uma imagem nítida e quadrada.",
                      )}
                    </small>
                  </section>
                  <section className="panel settings-panel customization-panel">
                    <h2>
                      <Palette size={18} /> {tr("Aparência")}
                    </h2>
                    <p>
                      {tr(
                        "Escolha um tema pronto ou crie uma combinação de cores só sua.",
                      )}
                    </p>
                    <div className="theme-options">
                      {(
                        [
                          ["original", "Original"],
                          ["light", "Claro"],
                          ["night", "Noturno"],
                          ["dark", "Dark"],
                        ] as const
                      ).map(([id, name]) => (
                        <button
                          key={id}
                          className={`theme-option ${(!settings.theme && id === "original") || settings.theme === id ? "selected" : ""}`}
                          onClick={() =>
                            void perform(() =>
                              savePreferences(
                                { ...settings, theme: id },
                                `${tr("Tema")} ${tr(name)} ${tr("ativado.")}`,
                              ),
                            )
                          }
                          disabled={busy}
                        >
                          <span
                            className="theme-swatch"
                            style={{
                              background: themePresets[id].background,
                              borderColor: themePresets[id].border,
                            }}
                          >
                            <i
                              style={{ background: themePresets[id].surface }}
                            />
                            <b
                              style={{ background: themePresets[id].accent }}
                            />
                          </span>
                          <strong>{tr(name)}</strong>
                          {settings.theme === id ||
                          (!settings.theme && id === "original") ? (
                            <Check size={16} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                    {!!settings.customThemes?.length && (
                      <div className="custom-theme-list">
                        {settings.customThemes.map((item) => (
                          <div className="custom-theme-item" key={item.id}>
                            <button
                              className={`theme-option ${settings.theme === item.id ? "selected" : ""}`}
                              disabled={busy}
                              onClick={() =>
                                void perform(() =>
                                  savePreferences(
                                    { ...settings, theme: item.id },
                                    `${tr("Tema")} ${item.name} ${tr("ativado.")}`,
                                  ),
                                )
                              }
                            >
                              <span
                                className="theme-swatch"
                                style={{
                                  background: item.colors.background,
                                  borderColor: item.colors.border,
                                }}
                              >
                                <i
                                  style={{ background: item.colors.surface }}
                                />
                                <b style={{ background: item.colors.accent }} />
                              </span>
                              <strong>{item.name}</strong>
                              {settings.theme === item.id && (
                                <Check size={16} />
                              )}
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`Editar tema ${item.name}`}
                              onClick={() =>
                                setThemeEditor({
                                  ...item,
                                  colors: { ...item.colors },
                                })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      className="secondary create-theme"
                      disabled={(settings.customThemes?.length || 0) >= 20}
                      onClick={() =>
                        setThemeEditor({
                          id: `theme-${uid()}`,
                          name: tr("Meu tema"),
                          colors: { ...activeTheme(settings) },
                        })
                      }
                    >
                      <Plus size={16} /> {tr("Criar tema")}
                    </button>
                    <div className="appearance-language">
                      <h3>
                        <Languages size={18} /> {tr("Idioma")}
                      </h3>
                      <p>
                        {tr(
                          "Escolha o idioma da interface. Seus dados continuam como você escreveu.",
                        )}
                      </p>
                      <select
                        aria-label={tr("Idioma da interface")}
                        value={settings.language || "pt-BR"}
                        disabled={busy}
                        onChange={(event) =>
                          void perform(() =>
                            savePreferences(
                              {
                                ...settings,
                                language: event.target
                                  .value as Settings["language"],
                              },
                              "Idioma atualizado.",
                            ),
                          )
                        }
                      >
                        <option value="pt-BR">{tr("Português")}</option>
                        <option value="en">{tr("English")}</option>
                        <option value="es">{tr("Español")}</option>
                      </select>
                    </div>
                  </section>
                  <section className="panel settings-panel">
                    <h2>{tr("Assinatura de e-mail")}</h2>
                    <p>{tr("Incluída automaticamente em todos os envios.")}</p>
                    <form
                      className="signature-editor"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const signatureText = signatureDraft.trim();
                        void perform(() =>
                          savePreferences(
                            {
                              ...settings,
                              signatureText,
                              signatureShowLogo: signatureLogoDraft,
                            },
                            "Assinatura salva.",
                          ),
                        );
                      }}
                    >
                      <label>
                        {tr("Texto da assinatura")}
                        <ResizableTextarea
                          required
                          maxLength={5000}
                          rows={5}
                          value={signatureDraft}
                          onChange={(event) =>
                            setSignatureDraft(event.target.value)
                          }
                        />
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={signatureLogoDraft}
                          onChange={(event) =>
                            setSignatureLogoDraft(event.target.checked)
                          }
                        />
                        {tr("Mostrar logo na assinatura")}
                      </label>
                      <span className="signature-preview-label">
                        {tr("Prévia")}
                      </span>
                      <SignaturePreview
                        settings={settings}
                        text={signatureDraft}
                        showLogo={signatureLogoDraft}
                      />
                      <button
                        className="primary"
                        disabled={busy || !signatureDraft.trim()}
                      >
                        <Check size={16} /> {tr("Salvar assinatura")}
                      </button>
                    </form>
                  </section>
                  <section className="panel settings-panel">
                    <h2>{tr("Sistema")}</h2>
                    <div className="service-status">
                      <h3>{tr("Backup diário")}</h3>
                      <div className="backup-panel">
                        <div className="backup-heading">
                          <span>{tr("Snapshots do seu espaço")}</span>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void perform(async () => {
                                const result = await api<{
                                  records: number;
                                  mail: number;
                                }>("/backups", { method: "POST" });
                                setBackups(await api<BackupInfo[]>("/backups"));
                                setToast(
                                  `${tr("Backup criado:")} ${result.records} ${tr("registros e")} ${result.mail} ${tr("e-mails.")}`,
                                );
                              })
                            }
                          >
                            {tr("Criar agora")} <Archive size={15} />
                          </button>
                        </div>
                        <small>
                          {tr(
                            "Um snapshot é criado automaticamente à meia-noite e substitui o anterior.",
                          )}
                        </small>
                        {backups.length ? (
                          <div className="backup-list">
                            {backups.slice(0, 5).map((backup) => (
                              <div key={backup.key}>
                                <span>
                                  {new Intl.DateTimeFormat(
                                    settings.language || "pt-BR",
                                    { dateStyle: "short", timeStyle: "short" },
                                  ).format(new Date(backup.createdAt))}
                                </span>
                                <button
                                  className="text-btn"
                                  disabled={busy}
                                  onClick={() => setBackupToRestore(backup)}
                                >
                                  {tr("Restaurar")}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="backup-empty">
                            {tr("Nenhum backup criado ainda.")}
                          </p>
                        )}
                      </div>
                      <h3>{tr("Conexões")}</h3>
                      <div className="outlook-connect">
                        <span>
                          {tr("Calendário Outlook · somente leitura")}
                        </span>
                        <small>
                          {status.outlookLastSyncedAt
                            ? `${tr("Atualizada em")} ${new Intl.DateTimeFormat(settings.language || "pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(status.outlookLastSyncedAt))}`
                            : tr("Aguardando a primeira atualização.")}
                        </small>
                        <button
                          className="icon-btn refresh-calendar"
                          aria-label={tr("Atualizar agenda")}
                          title={tr("Atualizar agenda")}
                          disabled={busy}
                          onClick={() =>
                            void perform(async () => {
                              const result = await api<{
                                count: number;
                                unchanged?: boolean;
                              }>("/integrations/outlook/sync", {
                                method: "POST",
                              });
                              await reload();
                              setToast(
                                result.unchanged
                                  ? "Agenda já está atualizada."
                                  : `${result.count} ${tr("compromissos do Outlook atualizados.")}`,
                              );
                            })
                          }
                        >
                          <RefreshCw size={15} />
                        </button>
                      </div>
                      <div>
                        <span>{tr("Resend · Envio de e-mail")}</span>
                        <b>
                          {tr(status.mailEnabled ? "Ativo" : "A configurar")}
                        </b>
                      </div>
                      <div>
                        <span>{tr("Dados do seu espaço")}</span>
                        <b>
                          {tr(
                            status.local ? "Neste computador" : "Cloudflare D1",
                          )}
                        </b>
                      </div>
                      <p>
                        {tr(
                          "As chaves dos serviços conectados ficam no servidor e não aparecem nesta página.",
                        )}
                      </p>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>GRIMÓRIO</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {tr(toast)}
        </div>
      )}
      {themeEditor && (
        <Modal
          title={tr(
            settings.customThemes?.some((item) => item.id === themeEditor.id)
              ? "Editar tema"
              : "Criar tema",
          )}
          onClose={() => setThemeEditor(null)}
        >
          <form
            className="theme-editor"
            onSubmit={(event) => {
              event.preventDefault();
              const current = themeEditor;
              if (!current) return;
              void perform(async () => {
                const list = [
                  ...(settings.customThemes || []).filter(
                    (item) => item.id !== current.id,
                  ),
                  current,
                ];
                await savePreferences(
                  { ...settings, customThemes: list, theme: current.id },
                  `${tr("Tema")} ${current.name} ${tr("salvo.")}`,
                );
                setThemeEditor(null);
              });
            }}
          >
            <label>
              {tr("Nome do tema")}
              <input
                required
                maxLength={40}
                value={themeEditor.name}
                onChange={(event) =>
                  setThemeEditor({ ...themeEditor, name: event.target.value })
                }
              />
            </label>
            <div className="theme-editor-grid">
              {(Object.keys(themeColorLabels) as (keyof ThemeColors)[]).map(
                (key) => (
                  <label className="color-field" key={key}>
                    <span>{tr(themeColorLabels[key])}</span>
                    <div>
                      <input
                        type="color"
                        value={themeEditor.colors[key]}
                        onChange={(event) =>
                          setThemeEditor({
                            ...themeEditor,
                            colors: {
                              ...themeEditor.colors,
                              [key]: event.target.value,
                            },
                          })
                        }
                      />
                      <code>{themeEditor.colors[key].toUpperCase()}</code>
                    </div>
                  </label>
                ),
              )}
            </div>
            <div className="modal-actions">
              {settings.customThemes?.some(
                (item) => item.id === themeEditor.id,
              ) && (
                <button
                  type="button"
                  className="danger-text"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Excluir o tema ${themeEditor.name}?`))
                      return;
                    void perform(async () => {
                      await savePreferences(
                        {
                          ...settings,
                          customThemes: (settings.customThemes || []).filter(
                            (item) => item.id !== themeEditor.id,
                          ),
                          theme:
                            settings.theme === themeEditor.id
                              ? "original"
                              : settings.theme,
                        },
                        "Tema excluído.",
                      );
                      setThemeEditor(null);
                    });
                  }}
                >
                  <Trash2 size={15} /> {tr("Excluir")}
                </button>
              )}
              <div />
              <button
                type="button"
                className="secondary"
                onClick={() => setThemeEditor(null)}
              >
                {tr("Cancelar")}
              </button>
              <button className="primary" disabled={busy}>
                <Check size={16} /> {tr("Salvar tema")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {calendarDay && (
        <Modal
          title={`Agenda · ${dateLabel(calendarDay)}`}
          onClose={() => setCalendarDay(null)}
        >
          <div className="day-agenda">
            {events
              .filter((event) => event.date === calendarDay)
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((event) => (
                <button
                  key={event.id}
                  className="day-agenda-item event"
                  onClick={() => {
                    setEditor(event);
                    setCalendarDay(null);
                  }}
                >
                  <span>
                    {event.time}
                    <small>{event.endTime}</small>
                  </span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.description || tr("Compromisso")}</small>
                  </div>
                </button>
              ))}
            {sortByPriority(
              tasks.filter((task) => task.due === calendarDay),
            ).map((task) => (
              <button
                key={task.id}
                className={`day-agenda-item task ${completed(task) ? "done" : ""}`}
                onClick={() => {
                  setTaskPreview(task);
                  setCalendarDay(null);
                }}
              >
                <span>
                  {task.time}
                  <small>
                    {completed(task)
                      ? tr("Concluída")
                      : tr(priorities[task.priority])}
                  </small>
                </span>
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.description || tr(task.status)}</small>
                </div>
              </button>
            ))}
            {!events.some((event) => event.date === calendarDay) &&
              !tasks.some((task) => task.due === calendarDay) && (
                <Empty
                  icon={CalendarDays}
                  title={tr("Dia livre")}
                  detail={tr("Não há compromissos ou tarefas para esta data.")}
                />
              )}
          </div>
          <div className="modal-actions">
            <div />
            <button className="secondary" onClick={() => setCalendarDay(null)}>
              {tr("Fechar")}
            </button>
          </div>
        </Modal>
      )}
      {taskPreview && (
        <Modal title={taskPreview.title} onClose={() => setTaskPreview(null)}>
          <div className="task-preview">
            <div className="task-preview-meta">
              <span
                className={`priority-badge priority-${taskPreview.priority}`}
              >
                <Flag size={13} />
                {tr(priorities[taskPreview.priority])}
              </span>
              <span>
                <CalendarDays size={14} />
                {taskPreview.due === today
                  ? tr("Hoje")
                  : dateLabel(taskPreview.due)}
                {taskPreview.time ? ` · ${taskPreview.time}` : ""}
              </span>
              {projectOf(taskPreview) && (
                <span>
                  <i style={{ background: projectOf(taskPreview)?.color }} />
                  {projectOf(taskPreview)?.title}
                </span>
              )}
            </div>
            {taskPreview.description && (
              <p className="task-preview-description">
                {taskPreview.description}
              </p>
            )}
            {taskPreview.tags && (
              <div className="tags">
                {taskPreview.tags
                  .split(",")
                  .filter(Boolean)
                  .map((tag) => (
                    <span key={tag}>{tag.trim()}</span>
                  ))}
              </div>
            )}
            {taskPreview.checklist.length > 0 && (
              <section className="task-preview-checklist">
                <h3>
                  {tr("Passos da tarefa")}{" "}
                  <small>
                    {taskPreview.checklist.filter((item) => item.done).length}/
                    {taskPreview.checklist.length}
                  </small>
                </h3>
                {taskPreview.checklist.map((item) => (
                  <button
                    key={item.id}
                    className={`preview-check ${item.done ? "done" : ""}`}
                    disabled={busy}
                    onClick={() =>
                      void toggleChecklistItem(taskPreview, item.id)
                    }
                  >
                    <span>{item.done && <Check size={14} />}</span>
                    {item.text}
                  </button>
                ))}
              </section>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="danger-text"
              onClick={() => {
                setDeleteItem(taskPreview);
                setTaskPreview(null);
              }}
            >
              <Trash2 size={16} />
              {tr("Excluir")}
            </button>
            <div />
            <button className="secondary" onClick={() => setTaskPreview(null)}>
              {tr("Fechar")}
            </button>
            <button
              className="primary"
              onClick={() => {
                setEditor(taskPreview);
                setTaskPreview(null);
              }}
            >
              <Pencil size={16} />
              {tr("Editar")}
            </button>
          </div>
        </Modal>
      )}
      {editor && (
        <Modal
          title={tr(
            editor.kind === "task"
              ? "Organizar tarefa"
              : editor.kind === "project"
                ? "Seu projeto"
                : editor.kind === "event"
                  ? "Compromisso"
                  : "Sua nota",
          )}
          onClose={() => setEditor(null)}
        >
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                if (editor.kind === "task") {
                  const previous = tasks.find((t) => t.id === editor.id);
                  const stages =
                    projects.find((p) => p.id === editor.projectId)?.columns ||
                    defaultColumns;
                  if (
                    editor.status === stages.at(-1) &&
                    (!previous || !completed(previous))
                  ) {
                    await save({ ...editor, status: stages[0] });
                    const result = await api<Task[]>(
                      `/tasks/${editor.id}/complete`,
                      {
                        method: "POST",
                        body: JSON.stringify({ complete: true, today }),
                      },
                    );
                    setRecords((old) => [
                      ...result,
                      ...old.filter((r) => !result.some((n) => n.id === r.id)),
                    ]);
                  } else await save(editor);
                } else await save(editor);
                setEditor(null);
                setToast("Salvo no seu espaço.");
              });
            }}
          >
            <label>
              {tr("Título")}
              <input
                required
                maxLength={200}
                value={"title" in editor ? editor.title : ""}
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value } as RecordItem)
                }
                placeholder={tr("Dê um nome…")}
                autoFocus
              />
            </label>
            {editor.kind === "task" && (
              <>
                <div className="form-grid">
                  {(editor.projectId || page === "projects") && (
                    <SelectField
                      label={tr("Projeto")}
                      value={editor.projectId}
                      options={[
                        { value: "", label: tr("Pessoal / sem projeto") },
                        ...projects.map((project) => ({ value: project.id, label: project.title })),
                      ]}
                      onChange={(projectId) =>
                        setEditor({
                          ...editor,
                          projectId,
                          status: projects.find((project) => project.id === projectId)?.columns[0] || defaultColumns[0],
                        })
                      }
                    />
                  )}
                  {(editor.projectId || page === "projects") && (
                    <SelectField
                      label={tr("Etapa")}
                      value={editor.status}
                      options={(projects.find((project) => project.id === editor.projectId)?.columns || defaultColumns).map((column) => ({ value: column, label: tr(column) }))}
                      onChange={(status) => setEditor({ ...editor, status })}
                    />
                  )}
                  <DateField label={tr("Prazo")} value={editor.due} onChange={(due) => setEditor({ ...editor, due, time: due ? editor.time : "" })} />
                  <TimeField label={tr("Horário")} optional value={editor.time || ""} disabled={!editor.due} onChange={(time) => setEditor({ ...editor, time })} />
                </div>
                <SegmentedControl
                  label={tr("Prioridade")}
                  value={editor.priority}
                  tone="priority"
                  options={([
                    { value: "low", label: tr("Baixa") },
                    { value: "medium", label: tr("Normal") },
                    { value: "high", label: tr("Alta") },
                  ] as const)}
                  onChange={(priority) => setEditor({ ...editor, priority })}
                />
                <label>
                  {tr("Descrição")}
                  <ResizableTextarea
                    rows={3}
                    value={editor.description}
                    onChange={(e) =>
                      setEditor({ ...editor, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  {tr("Etiquetas (separadas por vírgulas)")}
                  <input
                    maxLength={500}
                    value={editor.tags}
                    onChange={(e) =>
                      setEditor({ ...editor, tags: e.target.value })
                    }
                    placeholder={tr("design, pessoal…")}
                  />
                </label>
                <SegmentedControl
                  label={tr("Repetir após concluir")}
                  value={editor.repeat}
                  options={([
                    { value: "none", label: tr("Não repetir") },
                    { value: "daily", label: tr("Diariamente") },
                    { value: "weekly", label: tr("Semanalmente") },
                    { value: "monthly", label: tr("Mensalmente") },
                  ] as const)}
                  onChange={(repeat) => setEditor({ ...editor, repeat })}
                />
                <div className="checklist-editor">
                  <h3>{tr("Passos da tarefa")}</h3>
                  {editor.checklist.map((c, i) => (
                    <div key={c.id}>
                      <input
                        aria-label={`${tr("Concluir passo")} ${i + 1}`}
                        type="checkbox"
                        role="switch"
                        checked={c.done}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            checklist: editor.checklist.map((x) =>
                              x.id === c.id
                                ? { ...x, done: e.target.checked }
                                : x,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`${tr("Passo")} ${i + 1}`}
                        required
                        value={c.text}
                        maxLength={500}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            checklist: editor.checklist.map((x) =>
                              x.id === c.id
                                ? { ...x, text: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={tr("Remover passo")}
                        onClick={() =>
                          setEditor({
                            ...editor,
                            checklist: editor.checklist.filter(
                              (x) => x.id !== c.id,
                            ),
                          })
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        checklist: [
                          ...editor.checklist,
                          { id: uid(), text: "", done: false },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    {tr("Adicionar passo")}
                  </button>
                </div>
                {editor.mailId && (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => {
                      const mail = mails.find((m) => m.id === editor.mailId);
                      if (mail) {
                        navigate("mail");
                        setFolder(mail.folder);
                        selectMail(mail);
                        setEditor(null);
                      }
                    }}
                  >
                    <MailIcon size={15} />
                    {tr("Ver e-mail vinculado")}
                  </button>
                )}
              </>
            )}
            {editor.kind === "project" && (
              <>
                <label>
                  {tr("Descrição")}
                  <ResizableTextarea
                    rows={3}
                    value={editor.description}
                    onChange={(e) =>
                      setEditor({ ...editor, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  {tr("Cor do projeto")}
                  <input
                    type="color"
                    value={editor.color}
                    onChange={(e) =>
                      setEditor({ ...editor, color: e.target.value })
                    }
                  />
                </label>
                <label>
                  {tr("Etapas do Kanban (uma por linha)")}
                  <ResizableTextarea
                    rows={5}
                    value={editor.columns.join("\n")}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        columns: e.target.value.split("\n"),
                      })
                    }
                  />
                </label>
                <p className="field-help">
                  {tr(
                    "A última etapa representa a conclusão. Mova as tarefas antes\r\n                  de remover uma etapa em uso.",
                  )}
                </p>
              </>
            )}
            {editor.kind === "event" && (
              <>
                <DateField label={tr("Data")} required value={editor.date} onChange={(date) => setEditor({ ...editor, date })} />
                <div className="form-grid">
                  <TimeField label={tr("Início")} required value={editor.time} onChange={(time) => setEditor({ ...editor, time })} />
                  <TimeField label={tr("Término")} required value={editor.endTime} onChange={(endTime) => setEditor({ ...editor, endTime })} />
                </div>
                <label>
                  {tr("Detalhes")}
                  <ResizableTextarea
                    rows={4}
                    value={editor.description}
                    onChange={(e) =>
                      setEditor({ ...editor, description: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            {editor.kind === "note" && (
              <>
                <SelectField
                  label={tr("Projeto")}
                  value={editor.projectId}
                  options={[
                    { value: "", label: tr("Nota pessoal") },
                    ...projects.map((project) => ({ value: project.id, label: project.title })),
                  ]}
                  onChange={(projectId) => setEditor({ ...editor, projectId })}
                />
                <label>
                  {tr("Conteúdo")}
                  <ResizableTextarea
                    rows={10}
                    value={editor.body}
                    onChange={(e) =>
                      setEditor({ ...editor, body: e.target.value })
                    }
                    placeholder={tr("Comece por uma ideia…")}
                  />
                </label>
              </>
            )}
            <div className="modal-actions">
              {records.some((r) => r.id === editor.id) && (
                <button
                  type="button"
                  className="danger-text"
                  onClick={() => {
                    setDeleteItem(editor);
                    setEditor(null);
                  }}
                >
                  <Trash2 size={16} />
                  {tr("Excluir")}
                </button>
              )}
              <div />
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(null)}
              >
                {tr("Cancelar")}
              </button>
              <button
                className="primary"
                disabled={busy || (editor.kind === "event" && (!editor.date || !editor.time || !editor.endTime))}
              >
                <Check size={16} />
                {tr(busy ? "Salvando…" : "Salvar")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleteItem && (
        <Modal
          title={tr("Excluir este item?")}
          onClose={() => setDeleteItem(null)}
        >
          <p className="confirm-copy">
            “{"title" in deleteItem ? deleteItem.title : ""}
            {tr(
              "” será removido do\r\n            seu espaço. Esta ação não pode ser desfeita.",
            )}
            {deleteItem.kind === "project" &&
              " As tarefas dele serão mantidas como tarefas pessoais."}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleteItem(null)}>
              {tr("Cancelar")}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (deleteItem.kind === "project") {
                    const detached = tasks
                      .filter((task) => task.projectId === deleteItem.id)
                      .map((task) => ({
                        ...task,
                        projectId: "",
                        status: defaultColumns[0],
                      }));
                    await Promise.all(
                      detached.map((task) =>
                        api(`/records/${task.id}`, {
                          method: "PUT",
                          body: JSON.stringify(task),
                        }),
                      ),
                    );
                    setRecords((old) =>
                      old.map((record) =>
                        record.kind === "task" &&
                        record.projectId === deleteItem.id
                          ? {
                              ...record,
                              projectId: "",
                              status: defaultColumns[0],
                            }
                          : record,
                      ),
                    );
                    if (projectFilter === deleteItem.id) setProjectFilter("");
                  }
                  await api(`/records/${deleteItem.id}`, { method: "DELETE" });
                  setRecords((old) =>
                    old.filter((r) => r.id !== deleteItem.id),
                  );
                  setDeleteItem(null);
                  setToast("Item excluído.");
                })
              }
            >
              {tr("Excluir item")}
            </button>
          </div>
        </Modal>
      )}
      {backupToRestore && (
        <Modal
          title={tr("Restaurar este backup?")}
          onClose={() => setBackupToRestore(null)}
        >
          <p className="confirm-copy">
            {tr("Os dados atuais serão substituídos pelo snapshot de")}{" "}
            {new Intl.DateTimeFormat(settings.language || "pt-BR", {
              dateStyle: "full",
              timeStyle: "short",
            }).format(new Date(backupToRestore.createdAt))}
            {tr(
              ". Antes disso, o sistema criará um backup de segurança do estado atual.",
            )}
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => setBackupToRestore(null)}
            >
              {tr("Cancelar")}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const result = await api<{ records: number; mail: number }>(
                    "/backups/restore",
                    {
                      method: "POST",
                      body: JSON.stringify({ key: backupToRestore.key }),
                    },
                  );
                  await reload();
                  setBackupToRestore(null);
                  setToast(
                    `Backup restaurado: ${result.records} registros e ${result.mail} e-mails.`,
                  );
                })
              }
            >
              {tr("Restaurar backup")}
            </button>
          </div>
        </Modal>
      )}
      {compose && (
        <Modal
          title={tr("Escrever e-mail")}
          onClose={() => {
            if (!composeDirty) {
              setCompose(null);
              return;
            }
            void perform(async () => {
              await saveDraft();
              setCompose(null);
              setToast("Rascunho salvo.");
            });
          }}
        >
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await saveDraft();
                await api(`/mail/${compose.id}/send`, {
                  method: "POST",
                  body: "{}",
                });
                setMails(await api<Mail[]>("/mail"));
                setCompose(null);
                setToast("E-mail enviado.");
              });
            }}
          >
            <label>
              {tr("De")}
              <select
                disabled={compose.send_state === "pending"}
                value={compose.sender}
                onChange={(e) => {
                  setCompose({ ...compose, sender: e.target.value });
                  setComposeDirty(true);
                }}
              >
                <option value={status.mailAddresses.inbox}>{status.mailAddresses.inbox}</option>
                <option value={status.mailAddresses.noReply}>{status.mailAddresses.noReply}</option>
              </select>
            </label>
            <label>
              {tr("Para")}
              <input
                type="email"
                required
                disabled={compose.send_state === "pending"}
                value={compose.recipient}
                onChange={(e) => {
                  setCompose({ ...compose, recipient: e.target.value });
                  setComposeDirty(true);
                }}
                placeholder={tr("nome@exemplo.com")}
              />
            </label>
            <label>
              {tr("Assunto")}
              <input
                required
                maxLength={200}
                disabled={compose.send_state === "pending"}
                value={compose.subject}
                onChange={(e) => {
                  setCompose({ ...compose, subject: e.target.value });
                  setComposeDirty(true);
                }}
              />
            </label>
            <label>
              {tr("Mensagem")}
              <ResizableTextarea
                required
                rows={8}
                disabled={compose.send_state === "pending"}
                value={compose.body}
                onChange={(e) => {
                  setCompose({ ...compose, body: e.target.value });
                  setComposeDirty(true);
                }}
              />
            </label>
            <SignaturePreview
              settings={settings}
              text={signatureTextFor(settings)}
              showLogo={settings.signatureShowLogo !== false}
              small
            />
            <div className="compose-attachments">
              {compose.attachments.map((a) => (
                <span className="attachment" key={a.id}>
                  <Paperclip size={14} />
                  {a.filename}
                </span>
              ))}
              <label className="file-input">
                <Paperclip size={16} />
                {tr("Anexar arquivo")}
                <input
                  type="file"
                  disabled={busy || compose.send_state === "pending"}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void perform(async () => {
                        await saveDraft();
                        const form = new FormData();
                        form.set("file", file);
                        const attachments = await api<Mail["attachments"]>(
                          `/mail/${compose.id}/attachments`,
                          { method: "POST", body: form },
                        );
                        setCompose({ ...compose, attachments });
                        setMails(await api<Mail[]>("/mail"));
                      });
                    e.target.value = "";
                  }}
                />
              </label>
              <small>{tr("Até 5 arquivos, total de 5 MB.")}</small>
            </div>
            {!status.mailEnabled && (
              <p className="field-help">
                {tr(
                  "Envio aguardando a configuração do domínio. Você pode salvar\r\n                este rascunho.",
                )}
              </p>
            )}
            {compose.send_state === "pending" && (
              <p className="field-help">
                {tr(
                  "Envio pendente de confirmação. Confira o registro no Resend\r\n                antes de reenviar.",
                )}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy || compose.send_state === "pending"}
                onClick={() =>
                  void perform(async () => {
                    await saveDraft();
                    setCompose(null);
                    setToast("Rascunho salvo.");
                  })
                }
              >
                {tr("Salvar rascunho")}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !status.mailEnabled ||
                  compose.send_state === "pending"
                }
              >
                <Send size={16} />
                {tr(busy ? "Processando…" : "Enviar e-mail")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
