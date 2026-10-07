import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api } from "./lib";
import { translate } from "./i18n";
import { ResizableTextarea, SelectField } from "./FormControls";
import type { Settings, VaultItem } from "./types";

type Draft = Pick<
  VaultItem,
  "kind" | "name" | "value" | "username" | "website" | "notes" | "favorite"
>;
type Filter = "all" | "password" | "key" | "favorite";

const emptyDraft = (kind: Draft["kind"] = "password", value = ""): Draft => ({
  kind,
  name: "",
  value,
  username: "",
  website: "",
  notes: "",
  favorite: false,
});

function randomCharacter(alphabet: string) {
  const limit = 256 - (256 % alphabet.length);
  let byte: number;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (byte >= limit);
  return alphabet[byte % alphabet.length];
}

function generatePassword(length: number, symbols: boolean) {
  const sets = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    ...(symbols ? ["!@#$%&*+=?-"] : []),
  ];
  const alphabet = sets.join("");
  const chars = sets.map(randomCharacter);
  while (chars.length < length) chars.push(randomCharacter(alphabet));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const max = 256 - (256 % (index + 1));
    let byte: number;
    do {
      byte = crypto.getRandomValues(new Uint8Array(1))[0];
    } while (byte >= max);
    const target = byte % (index + 1);
    [chars[index], chars[target]] = [chars[target], chars[index]];
  }
  return chars.join("");
}

function generateKey(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function websiteLink(value: string) {
  if (!value.trim()) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function PasswordsPage({
  language,
}: {
  language: Settings["language"];
}) {
  const tr = (value: string) => translate(value, language);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDraftValue, setShowDraftValue] = useState(false);
  const [toDelete, setToDelete] = useState<VaultItem | null>(null);
  const [generatorKind, setGeneratorKind] = useState<Draft["kind"]>("password");
  const [passwordLength, setPasswordLength] = useState(20);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [keyBytes, setKeyBytes] = useState(32);
  const [generated, setGenerated] = useState("");
  const [showGenerated, setShowGenerated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void api<VaultItem[]>("/vault", { signal: controller.signal })
      .then(setItems)
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setError(caught.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!visibleId) return;
    const timer = window.setTimeout(() => setVisibleId(null), 20000);
    return () => window.clearTimeout(timer);
  }, [visibleId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copiado para a área de transferência.");
    } catch {
      setError("Não foi possível copiar. Tente novamente.");
    }
  }

  function openNew(kind: Draft["kind"] = "password", value = "") {
    setEditingId(null);
    setDraft(emptyDraft(kind, value));
    setShowDraftValue(!!value);
  }

  function openEdit(item: VaultItem) {
    const { kind, name, value, username, website, notes, favorite } = item;
    setEditingId(item.id);
    setDraft({ kind, name, value, username, website, notes, favorite });
    setShowDraftValue(false);
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    void run(async () => {
      const saved = await api<VaultItem>(
        editingId ? `/vault/${editingId}` : "/vault",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify({ ...draft, name: draft.name.trim() }),
        },
      );
      setItems((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setDraft(null);
      setNotice(editingId ? "Credencial atualizada." : "Credencial salva.");
    });
  }

  function toggleFavorite(item: VaultItem) {
    void run(async () => {
      const { kind, name, value, username, website, notes, favorite } = item;
      const updated = await api<VaultItem>(`/vault/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          kind,
          name,
          value,
          username,
          website,
          notes,
          favorite: !favorite,
        }),
      });
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? updated : entry)),
      );
    });
  }

  function deleteItem() {
    if (!toDelete) return;
    void run(async () => {
      await api(`/vault/${toDelete.id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== toDelete.id));
      setVisibleId(null);
      setToDelete(null);
      setNotice("Credencial excluída.");
    });
  }

  function makeSecret() {
    setGenerated(
      generatorKind === "password"
        ? generatePassword(passwordLength, includeSymbols)
        : generateKey(keyBytes),
    );
    setShowGenerated(true);
  }

  const filtered = items
    .filter(
      (item) =>
        filter === "all" ||
        (filter === "favorite" ? item.favorite : item.kind === filter),
    )
    .filter((item) =>
      `${item.name} ${item.username} ${item.website} ${item.notes}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const passwordCount = items.filter((item) => item.kind === "password").length;
  const keyCount = items.length - passwordCount;
  const favoriteCount = items.filter((item) => item.favorite).length;

  return (
    <div className="passwords-layout">
      <div className="passwords-content">
        <section className="panel password-hero">
          <div className="password-hero-icon">
            <ShieldCheck size={29} />
          </div>
          <div className="password-hero-copy">
            <span className="password-eyebrow">
              {tr("SEU ACESSO, ORGANIZADO")}
            </span>
            <h2>{tr("Tudo em um lugar seguro.")}</h2>
            <p>
              {tr(
                "Guarde acessos e chaves com os detalhes que ajudam você a encontrá-los depois.",
              )}
            </p>
          </div>
          <button className="primary" onClick={() => openNew()}>
            <Plus size={17} /> {tr("Nova credencial")}
          </button>
        </section>

        <div className="password-stats">
          <div>
            <span>{tr("Salvas")}</span>
            <strong>{items.length}</strong>
          </div>
          <div>
            <span>{tr("Senhas")}</span>
            <strong>{passwordCount}</strong>
          </div>
          <div>
            <span>{tr("Chaves")}</span>
            <strong>{keyCount}</strong>
          </div>
          <div>
            <span>{tr("Favoritas")}</span>
            <strong>{favoriteCount}</strong>
          </div>
        </div>

        <section className="panel password-library">
          <div className="password-library-head">
            <div>
              <h2>{tr("Minhas credenciais")}</h2>
              <p>{tr("Encontre, copie ou atualize seus acessos.")}</p>
            </div>
            <span>
              {filtered.length} {tr(filtered.length === 1 ? "item" : "itens")}
            </span>
          </div>
          <div className="password-toolbar">
            <label className="password-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr("Buscar por nome, conta ou site")}
                aria-label={tr("Buscar credenciais")}
              />
            </label>
            <div
              className="password-filters"
              role="group"
              aria-label={tr("Filtrar credenciais")}
            >
              {(
                [
                  ["all", "Todas"],
                  ["password", "Senhas"],
                  ["key", "Chaves"],
                  ["favorite", "Favoritas"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {tr(label)}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="password-empty">
              {tr("Carregando credenciais…")}
            </div>
          ) : filtered.length ? (
            <div className="password-list">
              {filtered.map((item) => (
                <article className="password-card" key={item.id}>
                  <div className={`password-card-icon ${item.kind}`}>
                    {item.kind === "password" ? (
                      <LockKeyhole size={21} />
                    ) : (
                      <KeyRound size={21} />
                    )}
                  </div>
                  <div className="password-card-main">
                    <div className="password-card-heading">
                      <strong>{item.name}</strong>
                      <span>
                        {tr(item.kind === "password" ? "Senha" : "Chave")}
                      </span>
                    </div>
                    <div className="password-card-meta">
                      {item.username && <span>{item.username}</span>}
                      {item.website &&
                        (websiteLink(item.website) ? (
                          <a
                            href={websiteLink(item.website)!}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Globe2 size={12} /> {item.website}
                          </a>
                        ) : (
                          <span>
                            <Globe2 size={12} /> {item.website}
                          </span>
                        ))}
                      {!item.username && !item.website && (
                        <span>{tr("Sem detalhes adicionais")}</span>
                      )}
                    </div>
                    <div className="password-card-secret">
                      <code>
                        {visibleId === item.id
                          ? item.value
                          : "••••••••••••••••"}
                      </code>
                      <button
                        className="icon-btn"
                        title={tr(
                          visibleId === item.id ? "Ocultar" : "Mostrar",
                        )}
                        aria-label={tr(
                          visibleId === item.id ? "Ocultar" : "Mostrar",
                        )}
                        onClick={() =>
                          setVisibleId(visibleId === item.id ? null : item.id)
                        }
                      >
                        {visibleId === item.id ? (
                          <EyeOff size={15} />
                        ) : (
                          <Eye size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="password-card-actions">
                    <button
                      className={`icon-btn password-favorite ${item.favorite ? "active" : ""}`}
                      title={tr(
                        item.favorite
                          ? "Remover dos favoritos"
                          : "Adicionar aos favoritos",
                      )}
                      aria-label={tr(
                        item.favorite
                          ? "Remover dos favoritos"
                          : "Adicionar aos favoritos",
                      )}
                      disabled={busy}
                      onClick={() => toggleFavorite(item)}
                    >
                      <Star
                        size={17}
                        fill={item.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="icon-btn"
                      title={tr("Copiar")}
                      aria-label={`${tr("Copiar")} ${item.name}`}
                      onClick={() => void copy(item.value)}
                    >
                      <Copy size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      title={tr("Editar")}
                      aria-label={`${tr("Editar")} ${item.name}`}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-btn password-delete"
                      title={tr("Excluir")}
                      aria-label={`${tr("Excluir")} ${item.name}`}
                      onClick={() => setToDelete(item)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="password-empty">
              <span>
                <KeyRound size={25} />
              </span>
              <h3>
                {tr(
                  items.length
                    ? "Nenhuma credencial encontrada"
                    : "Seu espaço seguro começa aqui",
                )}
              </h3>
              <p>
                {tr(
                  items.length
                    ? "Tente outro termo ou filtro."
                    : "Salve sua primeira senha ou chave para encontrá-la sempre que precisar.",
                )}
              </p>
              {!items.length && (
                <button className="secondary" onClick={() => openNew()}>
                  <Plus size={15} /> {tr("Adicionar credencial")}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="passwords-side">
        <section className="panel password-generator">
          <div className="password-side-icon">
            <Sparkles size={19} />
          </div>
          <h2>{tr("Gerador seguro")}</h2>
          <p>{tr("Gere uma senha ou chave aleatória.")}</p>
          <div className="password-generator-kind">
            <button
              className={generatorKind === "password" ? "active" : ""}
              onClick={() => {
                setGeneratorKind("password");
                setGenerated("");
              }}
            >
              {tr("Senha")}
            </button>
            <button
              className={generatorKind === "key" ? "active" : ""}
              onClick={() => {
                setGeneratorKind("key");
                setGenerated("");
              }}
            >
              {tr("Chave")}
            </button>
          </div>
          {generatorKind === "password" ? (
            <>
              <div className="password-range-field">
                <label
                  className="password-range-label"
                  htmlFor="password-length"
                >
                  {tr("Comprimento")} <strong>{passwordLength}</strong>
                </label>
                <input
                  id="password-length"
                  type="range"
                  min="12"
                  max="64"
                  value={passwordLength}
                  style={
                    {
                      "--range-progress": `${((passwordLength - 12) / 52) * 100}%`,
                    } as CSSProperties
                  }
                  onChange={(event) =>
                    setPasswordLength(Number(event.target.value))
                  }
                />
                <div className="password-range-bounds" aria-hidden="true">
                  <span>12</span>
                  <span>64</span>
                </div>
              </div>
              <label className="checkbox-label password-symbols">
                <input
                  type="checkbox"
                  role="switch"
                  checked={includeSymbols}
                  onChange={(event) => setIncludeSymbols(event.target.checked)}
                />
                {tr("Incluir símbolos")}
              </label>
            </>
          ) : (
            <SelectField
              label={tr("Tamanho da chave")}
              value={String(keyBytes)}
              options={[
                { value: "16", label: "128 bits" },
                { value: "32", label: "256 bits" },
                { value: "64", label: "512 bits" },
              ]}
              onChange={(bytes) => setKeyBytes(Number(bytes))}
            />
          )}
          <div className="password-generated">
            <code>
              {generated
                ? showGenerated
                  ? generated
                  : "••••••••••••••••"
                : tr("Sua nova credencial aparece aqui")}
            </code>
            {generated && (
              <button
                className="icon-btn"
                title={tr(showGenerated ? "Ocultar" : "Mostrar")}
                aria-label={tr(showGenerated ? "Ocultar" : "Mostrar")}
                onClick={() => setShowGenerated(!showGenerated)}
              >
                {showGenerated ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
          <div className="password-generator-actions">
            <button className="primary" onClick={makeSecret}>
              <RefreshCw size={15} /> {tr("Gerar")}
            </button>
            <button
              className="secondary"
              disabled={!generated}
              onClick={() => void copy(generated)}
              title={tr("Copiar")}
            >
              <Copy size={15} />
            </button>
          </div>
          {generated && (
            <button
              className="text-btn password-save-generated"
              onClick={() => openNew(generatorKind, generated)}
            >
              <Plus size={15} /> {tr("Salvar esta credencial")}
            </button>
          )}
        </section>
        <section className="panel password-security-note">
          <ShieldCheck size={20} />
          <div>
            <strong>{tr("Protegido para você")}</strong>
            <p>
              {tr(
                "Seu login do Cloudflare controla o acesso. Os valores ficam criptografados no armazenamento do ERP.",
              )}
            </p>
          </div>
        </section>
      </aside>

      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {tr(notice)}
        </div>
      )}
      {error && (
        <div className="password-error" role="alert">
          {tr(error)}
          <button
            className="icon-btn"
            aria-label={tr("Fechar")}
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {draft && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setDraft(null);
          }}
        >
          <div
            className="modal password-modal"
            role="dialog"
            aria-modal="true"
            aria-label={tr(editingId ? "Editar credencial" : "Nova credencial")}
          >
            <div className="modal-head">
              <h2>{tr(editingId ? "Editar credencial" : "Nova credencial")}</h2>
              <button
                className="icon-btn"
                aria-label={tr("Fechar")}
                onClick={() => setDraft(null)}
              >
                <X size={20} />
              </button>
            </div>
            <form className="password-editor" onSubmit={saveDraft}>
              <div className="password-editor-grid">
                <label>
                  {tr("Nome da credencial")}
                  <input
                    required
                    autoFocus
                    maxLength={200}
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    placeholder={tr("Ex.: Minha conta principal")}
                  />
                </label>
                <SelectField
                  label={tr("Tipo")}
                  value={draft.kind}
                  options={[
                    { value: "password", label: tr("Senha") },
                    { value: "key", label: tr("Chave") },
                  ]}
                  onChange={(kind) => setDraft({ ...draft, kind })}
                />
                <label>
                  {tr("Usuário ou e-mail")}
                  <input
                    maxLength={320}
                    autoComplete="off"
                    value={draft.username}
                    onChange={(event) =>
                      setDraft({ ...draft, username: event.target.value })
                    }
                    placeholder={tr("Opcional")}
                  />
                </label>
                <label>
                  {tr("Site ou serviço")}
                  <input
                    maxLength={2000}
                    autoComplete="off"
                    value={draft.website}
                    onChange={(event) =>
                      setDraft({ ...draft, website: event.target.value })
                    }
                    placeholder="https://"
                  />
                </label>
              </div>
              <label>
                {tr(draft.kind === "password" ? "Senha" : "Chave")}
                <div className="password-editor-value">
                  <input
                    required
                    type={showDraftValue ? "text" : "password"}
                    maxLength={10000}
                    autoComplete="new-password"
                    value={draft.value}
                    onChange={(event) =>
                      setDraft({ ...draft, value: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={tr(showDraftValue ? "Ocultar" : "Mostrar")}
                    onClick={() => setShowDraftValue(!showDraftValue)}
                  >
                    {showDraftValue ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={tr("Gerar nova credencial")}
                    onClick={() => {
                      const value =
                        draft.kind === "password"
                          ? generatePassword(passwordLength, includeSymbols)
                          : generateKey(keyBytes);
                      setDraft({ ...draft, value });
                      setShowDraftValue(true);
                    }}
                  >
                    <Sparkles size={17} />
                  </button>
                </div>
              </label>
              <label>
                {tr("Observações")}
                <ResizableTextarea
                  rows={3}
                  maxLength={20000}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                  placeholder={tr("Detalhes úteis para lembrar depois")}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.favorite}
                  onChange={(event) =>
                    setDraft({ ...draft, favorite: event.target.checked })
                  }
                />
                {tr("Adicionar aos favoritos")}
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDraft(null)}
                >
                  {tr("Cancelar")}
                </button>
                <button
                  className="primary"
                  disabled={busy || !draft.name.trim() || !draft.value}
                >
                  <Check size={16} />
                  {tr("Salvar credencial")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toDelete && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setToDelete(null);
          }}
        >
          <div
            className="modal password-confirm"
            role="dialog"
            aria-modal="true"
            aria-label={tr("Excluir credencial?")}
          >
            <div className="modal-head">
              <h2>{tr("Excluir credencial?")}</h2>
              <button
                className="icon-btn"
                aria-label={tr("Fechar")}
                onClick={() => setToDelete(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="confirm-copy">
              {tr("Esta credencial será excluída:")}{" "}
              <strong>{toDelete.name}</strong>
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setToDelete(null)}>
                {tr("Cancelar")}
              </button>
              <button className="danger" disabled={busy} onClick={deleteItem}>
                <Trash2 size={16} />
                {tr("Excluir credencial")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
