import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type TextareaHTMLAttributes,
} from "react";

type SegmentedOption<T extends string> = { value: T; label: string };

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
