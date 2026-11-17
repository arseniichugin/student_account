"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { RetryButton } from "@/components/ui/retry-button";
import { cn } from "@/lib/utils";

export type ComboboxItem = { id: string; label: string; meta: string };

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: ComboboxItem[] }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 200;

/**
 * Поле с подсказками при наборе: данные подтягиваются с сервера, выпадает список (до 5 вариантов).
 * Выбор — касанием или стрелками + Enter; Esc закрывает список. Пока вариант не выбран, значение пустое:
 * в форму уходит только id из подсказки (скрытое поле `name`), а не свободный текст.
 *
 * `url(q)` — адрес подсказок для набранного текста; null — поле недоступно (не заполнено предыдущее).
 * Сбросить поле (например, при смене студента) — сменить `key` у компонента.
 */
export function Combobox({
  label,
  name,
  placeholder,
  url,
  minChars = 0,
  value,
  onChange,
  disabledHint,
  emptyText = "Ничего не найдено",
  inputMode,
  invalid,
  errorId,
}: {
  label: string;
  name: string;
  placeholder: string;
  url: (q: string) => string | null;
  minChars?: number;
  value: ComboboxItem | null;
  onChange: (item: ComboboxItem | null) => void;
  /** Подсказка под недоступным полем: «Сначала выберите студента» */
  disabledHint?: string;
  emptyText?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** Ошибка проверки на сервере: поле помечается aria-invalid и ссылается на текст ошибки errorId */
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(value?.label ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const disabled = url("") === null;
  const href = !value && open && q.length >= minChars ? url(q) : null;

  useEffect(() => {
    if (!href) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch(href, { signal: controller.signal });
        if (res.status === 401) {
          setState({ status: "error", message: "Сессия закончилась — обновите страницу и войдите снова." });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: ComboboxItem[] };
        setState({ status: "done", results: data.results });
        setActive(data.results.length ? 0 : -1);
      } catch (e) {
        if (controller.signal.aborted) return;
        console.warn("combobox suggest failed", e);
        setState({ status: "error", message: "Не удалось загрузить подсказки. Проверьте интернет." });
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [href, attempt]);

  // Клик вне поля — закрыть список
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const results = href && state.status === "done" ? state.results : [];
  const showList = results.length > 0;

  function choose(item: ComboboxItem) {
    onChange(item);
    setQuery(item.label);
    setOpen(false);
    setState({ status: "idle" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (results.length) setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && showList) {
      e.preventDefault();
      const item = results[active] ?? results[0];
      if (item) choose(item);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={value?.id ?? ""} />
      <div className="relative">
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={[`${id}-status`, invalid ? errorId : null].filter(Boolean).join(" ")}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          inputMode={inputMode}
          disabled={disabled}
          placeholder={disabled ? "" : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onFocus={() => {
            if (!value) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "min-h-11 w-full rounded-xl border bg-surface pr-11 pl-3.5 text-[16px] text-text outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted",
            value ? "border-success" : "border-border focus:border-primary",
          )}
        />
        {value ? (
          <button
            type="button"
            aria-label={`Очистить поле «${label}»`}
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-muted hover:text-text"
          >
            <X className="size-5" aria-hidden />
          </button>
        ) : (
          state.status === "loading" &&
          href && <Loader2 className="absolute top-3 right-3 size-5 animate-spin text-muted" aria-hidden />
        )}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={`Варианты: ${label}`}
        hidden={!showList}
        className="absolute inset-x-0 top-full z-20 mt-1 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-lg"
      >
        {results.map((item, i) => (
          <li
            key={item.id}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(item)}
            className={cn(
              "flex min-h-12 cursor-pointer flex-col justify-center px-3.5 py-2 hover:bg-surface-muted",
              i === active && "bg-primary-soft",
            )}
          >
            <span className="font-medium break-words">{item.label}</span>
            {item.meta && <span className="text-sm break-words text-muted">{item.meta}</span>}
          </li>
        ))}
      </ul>

      <div id={`${id}-status`} aria-live="polite" className="mt-1 min-h-5 text-sm">
        {value ? (
          <p className="flex items-center gap-1 text-success">
            <Check className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{value.meta || "Выбрано"}</span>
          </p>
        ) : disabled ? (
          disabledHint && <p className="text-muted">{disabledHint}</p>
        ) : open && q.length < minChars ? (
          <p className="text-muted">Введите хотя бы {minChars} символа</p>
        ) : href && state.status === "done" && results.length === 0 ? (
          <p className="text-muted">{emptyText}</p>
        ) : href && state.status === "error" ? (
          <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-danger">
            <p>{state.message}</p>
            <RetryButton className="mt-2" onRetry={() => setAttempt((n) => n + 1)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
