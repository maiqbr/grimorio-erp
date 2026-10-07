import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";

type SegmentedOption<T extends string> = { value: T; label: string };

function useFieldPopup(floatingRef?: { current: HTMLDivElement | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !floatingRef?.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const toggle = (height = 0) => {
    if (!open && rootRef.current) {
      setAbove(
        rootRef.current.getBoundingClientRect().bottom + height >
          window.innerHeight - 16,
      );
    }
    setOpen(!open);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return { rootRef, triggerRef, open, above, toggle, close, onKeyDown };
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const popup = useFieldPopup(popoverRef);
  const selected = options.find((option) => option.value === value);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const positioned = popoverStyle !== null;

  useLayoutEffect(() => {
    if (!popup.open) return;
    const position = () => {
      const rect = popup.triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
      const desiredHeight = Math.min(
        options.length * 36 + 12,
        270,
        window.innerHeight * 0.45,
      );
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const above = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableHeight = above ? spaceAbove : spaceBelow;
      setPopoverStyle({
        position: "fixed",
        width,
        minWidth: width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: above ? rect.top - 6 : rect.bottom + 6,
        maxHeight: Math.max(36, availableHeight),
        transform: above ? "translateY(-100%)" : undefined,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [popup.open, options.length]);

  useEffect(() => {
    if (popup.open && positioned)
      popoverRef.current
        ?.querySelector<HTMLElement>(".active")
        ?.focus({ preventScroll: true });
  }, [popup.open, positioned]);

  return (
    <div
      className={`picker-field${compact ? " is-compact" : ""}${popup.open ? " is-open" : ""}`}
      ref={popup.rootRef}
      onKeyDown={popup.onKeyDown}
    >
      {!hideLabel && <span className="picker-label">{label}</span>}
      <button
        ref={popup.triggerRef}
        type="button"
        className={`picker-trigger${popup.open ? " is-open" : ""}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={popup.open}
        disabled={disabled}
        onClick={() => {
          setPopoverStyle(null);
          popup.toggle();
        }}
      >
        <span>{selected?.label || options[0]?.label || ""}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {popup.open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            className="field-popover select-popover"
            role="listbox"
            aria-label={label}
            style={popoverStyle}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                popup.close();
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const buttons = Array.from(
                popoverRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button",
                ) || [],
              );
              const current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? "active" : ""}
                onClick={() => {
                  onChange(option.value);
                  popup.close();
                }}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>,
          popup.rootRef.current?.closest(".app") || document.body,
        )}
    </div>
  );
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function pickerWords() {
  const language = document.documentElement.lang;
  if (language === "en") {
    return {
      locale: "en-US",
      selectDate: "Select date",
      previous: "Previous month",
      next: "Next month",
      clear: "Clear",
      today: "Today",
      optional: "optional",
      noTime: "No time",
      choose: "Choose",
    };
  }
  if (language === "es") {
    return {
      locale: "es-ES",
      selectDate: "Elegir fecha",
      previous: "Mes anterior",
      next: "Mes siguiente",
      clear: "Borrar",
      today: "Hoy",
      optional: "opcional",
      noTime: "Sin hora",
      choose: "Elegir",
    };
  }
  return {
    locale: "pt-BR",
    selectDate: "Selecionar data",
    previous: "Mês anterior",
    next: "Próximo mês",
    clear: "Limpar",
    today: "Hoje",
    optional: "opcional",
    noTime: "Sem horário",
    choose: "Escolher",
  };
}

export function DateField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const popup = useFieldPopup();
  const selected = parseDate(value);
  const [month, setMonth] = useState(() => {
    const date = selected || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const words = pickerWords();
  const locale = words.locale;
  const today = dateValue(new Date());
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  firstDay.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + index);
    return day;
  });
  const dayNames = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2024, 0, 1 + index);
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day);
  });
  const display = selected
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(selected)
    : words.selectDate;

  return (
    <div
      className="picker-field"
      ref={popup.rootRef}
      onKeyDown={popup.onKeyDown}
    >
      <span className="picker-label">{label}</span>
      <button
        ref={popup.triggerRef}
        type="button"
        className={`picker-trigger${popup.open ? " is-open" : ""}`}
        aria-label={`${label}: ${display}`}
        aria-haspopup="dialog"
        aria-expanded={popup.open}
        onClick={() => {
          if (!popup.open) {
            const date = selected || new Date();
            setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          }
          popup.toggle(360);
        }}
      >
        <CalendarDays size={17} aria-hidden="true" />
        <span className={!selected ? "picker-placeholder" : ""}>{display}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {popup.open && (
        <div
          className={`field-popover calendar-popover${popup.above ? " above" : ""}`}
          role="dialog"
          aria-label={label}
        >
          <div className="calendar-picker-head">
            <strong>
              {new Intl.DateTimeFormat(locale, {
                month: "long",
                year: "numeric",
              }).format(month)}
            </strong>
            <div>
              <button
                type="button"
                aria-label={words.previous}
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label={words.next}
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div className="calendar-picker-grid">
            {dayNames.map((day, index) => (
              <span key={index} className="calendar-weekday">
                {day}
              </span>
            ))}
            {days.map((day) => {
              const dayValue = dateValue(day);
              return (
                <button
                  key={dayValue}
                  type="button"
                  aria-label={new Intl.DateTimeFormat(locale, {
                    dateStyle: "full",
                  }).format(day)}
                  aria-pressed={dayValue === value}
                  className={`${day.getMonth() !== month.getMonth() ? "outside" : ""} ${dayValue === value ? "selected" : ""} ${dayValue === today ? "today" : ""}`}
                  onClick={() => {
                    onChange(dayValue);
                    popup.close();
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="calendar-picker-actions">
            {!required && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  popup.close();
                }}
              >
                {words.clear}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onChange(today);
                popup.close();
              }}
            >
              {words.today}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  optional?: boolean;
}) {
  const popup = useFieldPopup();
  const words = pickerWords();
  const menuRef = useRef<HTMLDivElement>(null);
  const times = Array.from(
    { length: 96 },
    (_, index) =>
      `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
  );
  useEffect(() => {
    if (!popup.open || !menuRef.current) return;
    const menu = menuRef.current;
    const focusTime = value || "08:00";
    const option =
      Array.from(menu.querySelectorAll<HTMLElement>("[data-time]")).find(
        (element) => element.dataset.time === focusTime,
      ) || menu.querySelector<HTMLElement>('[data-time="08:00"]');
    if (option) {
      const menuRect = menu.getBoundingClientRect();
      const optionRect = option.getBoundingClientRect();
      menu.scrollTop +=
        optionRect.top -
        menuRect.top -
        (menu.clientHeight - option.clientHeight) / 2;
    }
  }, [popup.open, value]);

  return (
    <div
      className="picker-field"
      ref={popup.rootRef}
      onKeyDown={popup.onKeyDown}
    >
      <span className="picker-label">
        {label}
        {optional && <small>{words.optional}</small>}
      </span>
      <div
        className={`time-picker-trigger${popup.open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
      >
        <Clock3 size={17} aria-hidden="true" />
        <input
          type="time"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={required}
        />
        <button
          ref={popup.triggerRef}
          type="button"
          aria-label={`${words.choose} ${label.toLowerCase()}`}
          aria-haspopup="listbox"
          aria-expanded={popup.open}
          disabled={disabled}
          onClick={() => popup.toggle(270)}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </div>
      {popup.open && (
        <div
          ref={menuRef}
          className={`field-popover time-popover${popup.above ? " above" : ""}`}
          role="listbox"
          aria-label={label}
        >
          {!required && (
            <button
              type="button"
              className="clear-time"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange("");
                popup.close();
              }}
            >
              {words.noTime}
            </button>
          )}
          {times.map((time) => (
            <button
              key={time}
              type="button"
              data-time={time}
              role="option"
              aria-selected={time === value}
              className={time === value ? "active" : ""}
              onClick={() => {
                onChange(time);
                popup.close();
              }}
            >
              {time}
              {time === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  tone = "accent",
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  tone?: "accent" | "priority";
}) {
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div className="segmented-field">
      <span className="segmented-label">{label}</span>
      <div
        className="segmented-control"
        role="group"
        aria-label={label}
        data-tone={tone}
        data-value={value}
        style={
          {
            "--segment-count": options.length,
            "--segment-index": selected,
          } as CSSProperties
        }
      >
        <span className="segmented-thumb" aria-hidden="true" />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "selected" : ""}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResizableTextarea({
  className,
  disabled,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ y: number; height: number } | null>(null);

  const resize = (height: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const minimum = Math.max(
      56,
      parseFloat(getComputedStyle(textarea).minHeight) || 0,
    );
    textarea.style.height = `${Math.max(minimum, Math.round(height))}px`;
  };

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0 || !textareaRef.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      y: event.clientY,
      height: textareaRef.current.getBoundingClientRect().height,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (dragRef.current) {
      resize(dragRef.current.height + event.clientY - dragRef.current.y);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled || !textareaRef.current) return;
    const step =
      event.key === "ArrowDown" || event.key === "PageDown"
        ? event.key === "PageDown"
          ? 64
          : 16
        : event.key === "ArrowUp" || event.key === "PageUp"
          ? event.key === "PageUp"
            ? -64
            : -16
          : 0;
    if (step || event.key === "Home") {
      event.preventDefault();
      resize(
        event.key === "Home"
          ? 56
          : textareaRef.current.getBoundingClientRect().height + step,
      );
    }
  };

  return (
    <span className={`resizable-textarea${className ? ` ${className}` : ""}`}>
      <textarea ref={textareaRef} disabled={disabled} {...props} />
      <span
        className="textarea-grip"
        role="separator"
        aria-label="Ajustar altura do campo de texto"
        aria-orientation="horizontal"
        tabIndex={disabled ? -1 : 0}
        title="Arraste para ajustar a altura"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={onKeyDown}
      >
        <span aria-hidden="true" />
      </span>
    </span>
  );
}
