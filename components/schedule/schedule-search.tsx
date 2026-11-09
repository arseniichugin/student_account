"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, Search, Users, X } from "lucide-react";
import { RetryButton } from "@/components/campus-map/retry-button";
import type { ScheduleView } from "@/lib/schedule/dates";
import { scheduleHref } from "@/lib/schedule/links";
import { cn } from "@/lib/utils";
import { SCHEDULE_SEARCH_MAX_LENGTH, type ScheduleSearchItem } from "@/lib/validation/schedule";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

type Faculty = { id: string; name: string };

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: ScheduleSearchItem[] }
  | { status: "error"; message: string; unauthorized?: boolean };

const GROUP_KIND = { academic: "Группа", language: "Языковая группа", other: "Группа" } as const;

function describe(item: ScheduleSearchItem): { title: string; meta: string } {
  if (item.type === "teacher") {
    return { title: item.shortName, meta: ["Преподаватель", item.fullName, item.rank].filter(Boolean).join(" · ") };
  }
  const faculty = item.faculty?.replace(/^Факультет\s+/i, "");
  return {
    title: item.name,
    meta: [GROUP_KIND[item.kind], faculty, item.course ? `${item.course} курс` : null].filter(Boolean).join(" · "),
  };
}

/**
 * Поиск по группам и преподавателям с подсказками при наборе (GET /api/schedule/search)
 * и фильтром по факультету. Выбор подсказки ведёт на /schedule?group=<id> или ?teacher=<id>,
 * сохраняя выбранную дату и вид. Клавиатура: ↑/↓ — выбор, Enter — открыть, Esc — закрыть.
 */
export function ScheduleSearch({
  faculties,
  date,
  view,
}: {
  faculties: Faculty[];
  date: string | null;
  view: ScheduleView;
}) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const enough = q.length >= MIN_QUERY;

  useEffect(() => {
    if (!enough) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const params = new URLSearchParams({ q });
        if (faculty) params.set("faculty", faculty);
        const res = await fetch(`/api/schedule/search?${params}`, { signal: controller.signal });
        if (res.status === 401) {
          setState({ status: "error", message: "Сессия закончилась — войдите снова.", unauthorized: true });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: ScheduleSearchItem[] };
        setState({ status: "done", results: data.results });
        setActive(-1);
      } catch (e) {
        if (controller.signal.aborted) return;
        console.warn("schedule search failed", e);
        setState({ status: "error", message: "Не удалось выполнить поиск. Проверьте интернет и попробуйте ещё раз." });
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q, faculty, enough, attempt]);

  const results = enough && state.status === "done" ? state.results : [];
  const open = enough && state.status !== "idle";
  const hrefOf = (item: ScheduleSearchItem) => scheduleHref({ target: { type: item.type, id: item.id }, date, view });

  function choose(item: ScheduleSearchItem) {
    setQuery("");
    setState({ status: "idle" });
    router.push(hrefOf(item));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active] ?? (results.length === 1 ? results[0] : undefined);
      if (item) choose(item);
    } else if (e.key === "Escape") {
      setQuery("");
      setState({ status: "idle" });
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
          Группа или преподаватель
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={SCHEDULE_SEARCH_MAX_LENGTH}
            placeholder="2-СЛ-1 или Комаров"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < MIN_QUERY) setState({ status: "idle" });
            }}
            onKeyDown={onKeyDown}
            className="min-h-11 w-full rounded-xl border border-border bg-surface pr-12 pl-11 text-[16px] text-text outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => {
                setQuery("");
                setState({ status: "idle" });
                inputRef.current?.focus();
              }}
              className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-muted hover:text-text"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="sr-only">Факультет</legend>
        <div className="flex flex-wrap gap-2">
          {[{ id: null, name: "Все факультеты" }, ...faculties].map((f) => {
            const selected = faculty === f.id;
            return (
              <button
                key={f.id ?? "all"}
                type="button"
                aria-pressed={selected}
                onClick={() => setFaculty(f.id)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium",
                  selected ? "bg-primary text-on-primary" : "bg-surface-muted text-muted hover:text-text",
                )}
              >
                {f.name.replace(/^Факультет\s+/i, "")}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div aria-live="polite">
        {q.length > 0 && !enough && <p className="text-sm text-muted">Введите хотя бы {MIN_QUERY} символа.</p>}
        {open && state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Ищем…
          </p>
        )}
        {open && state.status === "error" && (
          <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <p>{state.message}</p>
            {state.unauthorized ? (
              <Link href="/login" className="mt-1 inline-flex min-h-11 items-center font-medium underline">
                Войти
              </Link>
            ) : (
              <RetryButton className="mt-2" onRetry={() => setAttempt((n) => n + 1)} />
            )}
          </div>
        )}
        {open && state.status === "done" && results.length === 0 && (
          <p className="text-sm text-muted">
            Ничего не найдено{faculty ? " на выбранном факультете" : ""}. Проверьте написание: группа — «2-СЛ-1», преподаватель —
            по фамилии.
          </p>
        )}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Подсказки"
        hidden={results.length === 0}
        className="max-h-[60dvh] divide-y divide-border overflow-y-auto overscroll-contain rounded-card border border-border bg-surface"
      >
        {results.map((item, i) => {
          const { title, meta } = describe(item);
          const Icon = item.type === "teacher" ? GraduationCap : Users;
          return (
            <li key={`${item.type}-${item.id}`} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={hrefOf(item)}
                onClick={() => {
                  setQuery("");
                  setState({ status: "idle" });
                }}
                className={cn(
                  "flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-muted",
                  i === active && "bg-primary-soft",
                )}
              >
                <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium break-words">{title}</span>
                  <span className="block text-sm break-words text-muted">{meta}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
