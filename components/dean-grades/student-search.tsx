"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, UserRound, X } from "lucide-react";
import { RetryButton } from "@/components/ui/retry-button";
import { cn } from "@/lib/utils";
import {
  STUDENT_SEARCH_MAX_LENGTH,
  STUDENT_SEARCH_MIN_LENGTH,
  deanStudentHref,
  type StudentSearchItem,
  type StudentSearchResponse,
} from "@/lib/validation/dean-grades";

const MIN_QUERY = STUDENT_SEARCH_MIN_LENGTH;
const DEBOUNCE_MS = 250;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; exact: string | null; results: StudentSearchItem[]; layout?: string }
  | { status: "error"; message: string; unauthorized?: boolean };

/**
 * Поиск студента своего факультета (GET /api/staff/students/search): по ФИО — подсказки при наборе,
 * по номеру зачётки — Enter сразу открывает студента. Без JavaScript форма уходит на /staff/grades?q=…,
 * и страница сама откроет студента по зачётке или покажет найденных.
 * Клавиатура: ↑/↓ — выбор подсказки, Enter — открыть, Esc — закрыть список, второе Esc — очистить.
 */
export function StudentSearch({
  course,
  initialQuery = "",
  example = null,
}: {
  course: number;
  initialQuery?: string;
  /** Пример номера зачётки из данных факультета (первая зачётка курса); null — без примера */
  example?: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<State>({ status: "idle" });
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const enough = q.length >= MIN_QUERY;

  useEffect(() => {
    if (!enough || dismissed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/staff/students/search?${new URLSearchParams({ q })}`, { signal: controller.signal });
        if (res.status === 401) {
          setState({ status: "error", message: "Сессия закончилась — войдите снова.", unauthorized: true });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Extract<StudentSearchResponse, { results: unknown }>;
        setState({ status: "done", exact: data.exact, results: data.results, layout: data.layout });
        setActive(-1);
      } catch (e) {
        if (controller.signal.aborted) return;
        console.warn("student search failed", e);
        setState({ status: "error", message: "Не удалось выполнить поиск. Проверьте интернет и попробуйте ещё раз." });
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q, enough, attempt, dismissed]);

  const open = enough && state.status !== "idle" && !dismissed;
  const results = open && state.status === "done" ? state.results : [];

  // Клик или касание вне поиска — закрыть подсказки (текст в поле остаётся).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDismissed(true);
        setActive(-1);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function go(recordBookNo: string) {
    setDismissed(true);
    setActive(-1);
    router.push(deanStudentHref(recordBookNo));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q) return;
    const chosen = results[active];
    if (chosen) return go(chosen.recordBookNo);
    // Зачётка совпала полностью — сразу к студенту; иначе — страница со всеми найденными
    if (state.status === "done" && state.exact && !dismissed) return go(state.exact);
    setDismissed(true);
    router.push(`/staff/grades?${new URLSearchParams({ course: String(course), q })}#search-results`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) {
        setDismissed(true);
        setActive(-1);
      } else {
        setQuery("");
        setState({ status: "idle" });
      }
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <form role="search" action="/staff/grades" method="get" onSubmit={onSubmit} aria-label="Поиск студента">
        <input type="hidden" name="course" value={course} />
        <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
          Найти студента факультета
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            id={`${id}-input`}
            name="q"
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && results[active] ? `${id}-opt-${active}` : undefined}
            aria-describedby={`${id}-status`}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={STUDENT_SEARCH_MAX_LENGTH}
            placeholder="Фамилия или номер зачётки"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDismissed(false);
              setActive(-1);
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
      </form>

      {/* Подсказки — сразу под полем; на компьютере — поверх страницы, на телефоне — в потоке (видны над клавиатурой) */}
      <div
        hidden={results.length === 0}
        className="mt-2 overflow-hidden rounded-card border border-border bg-surface shadow-lg lg:absolute lg:inset-x-0 lg:z-40"
      >
        {state.status === "done" && state.layout && (
          <p className="border-b border-border bg-primary-soft px-4 py-2 text-sm text-primary" aria-hidden>
            Похоже, включена английская раскладка — ищем «{state.layout}»
          </p>
        )}
        <ul
          id={listId}
          role="listbox"
          aria-label="Найденные студенты"
          className="max-h-[60dvh] divide-y divide-border overflow-y-auto overscroll-contain"
        >
          {results.map((s, i) => (
            <li
              key={s.recordBookNo}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(s.recordBookNo)}
              className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface-muted", i === active && "bg-primary-soft")}
            >
              <UserRound className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium break-words">{s.fullName}</span>
                <span className="block text-sm break-words text-muted">
                  {s.recordBookNo} · {s.group} · {s.course} курс
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div id={`${id}-status`} aria-live="polite" className="mt-1.5">
        {q.length > 0 && !enough && !dismissed && <p className="text-sm text-muted">Введите хотя бы {MIN_QUERY} символа.</p>}
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
            На факультете никого не нашли. Проверьте фамилию или номер зачётки{example ? `, например ${example}` : ""}.
          </p>
        )}
        {open && state.status === "done" && results.length > 0 && (
          <p className="sr-only">
            {state.layout ? `Похоже, включена английская раскладка — ищем «${state.layout}». ` : ""}Найдено: {results.length}.{state.exact ? " Номер зачётки совпал — Enter откроет студента." : ""} Стрелки вверх и
            вниз — выбор, Enter — открыть.
          </p>
        )}
      </div>
    </div>
  );
}
