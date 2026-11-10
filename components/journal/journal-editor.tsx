"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Undo2, Users } from "lucide-react";
import { saveGradesAction } from "@/app/(app)/(teacher)/journal/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import type { Journal, JournalStudent, TeacherAssignment } from "@/lib/data/grades";
import { formatCredit, formatPoints, letterFor, scaleEntry, scoredAverage, type GradeLetter } from "@/lib/grades/scale";
import { CHECKPOINTS, FINAL_KIND_LABEL, checkpointLabel, type CheckpointNo } from "@/lib/grades/term";
import { MAX_GRADES_PER_SAVE, parsePointsInput, type GradeEntryInput } from "@/lib/validation/grades";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { cn, plural } from "@/lib/utils";
import { dueLabel, gradesLabel } from "./labels";
import { LetterBadge } from "./letter-badge";
import { ProgressMeter } from "./progress-meter";

// ─── Модель ячеек ───────────────────────────────────────────────────
// Колонка журнала: срез 1–3 или итоговая. Значение ячейки — текст поля ввода:
// баллы «85» / «» (пусто), для зачёта — "pass" / "fail" / "" (не выставлено).
// Черновик (drafts) хранит только изменённые ячейки; сохранённое значение — в students.

type Col = CheckpointNo | "final";
type CreditValue = "pass" | "fail" | "";
type Layout = "d" | "m"; // таблица (компьютер) / карточки (телефон)

const CP_COLS: CheckpointNo[] = [1, 2, 3];
const cellKey = (studentId: string, col: Col) => `${studentId}:${col}`;
const fieldId = (layout: Layout, key: string) => `${layout}-${key.replace(":", "-")}`;
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

function savedValue(s: JournalStudent, col: Col): string {
  if (col !== "final") return s.checkpoints[col - 1] ? String(s.checkpoints[col - 1]!.points) : "";
  const r = s.finalResult;
  if (!r) return "";
  return r.kind === "EXAM" ? String(r.points) : r.passed ? "pass" : "fail";
}

const shortName = (s: JournalStudent) => `${s.lastName} ${s.firstName}`;

/** Подпись поля для экранного диктора: «Иванова Анна, 2-й срез, баллы». */
function fieldLabel(s: JournalStudent, col: Col, finalKind: "EXAM" | "CREDIT" | null): string {
  if (col !== "final") return `${shortName(s)}, ${checkpointLabel(col)}, баллы`;
  return finalKind === "CREDIT" ? `${shortName(s)}, зачёт` : `${shortName(s)}, экзамен, баллы`;
}

type Banner = { type: "success" | "error"; text: string } | null;

export function JournalEditor({ journal }: { journal: Journal }) {
  const finalKind = journal.assignment.final?.kind ?? null;
  const cols: Col[] = finalKind ? [...CP_COLS, "final"] : CP_COLS;

  const [students, setStudents] = useState(journal.students);
  const [assignment, setAssignment] = useState<TeacherAssignment>(journal.assignment);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [justSaved, setJustSaved] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<Banner>(null);
  const [mode, setMode] = useState<Col>(journal.currentCheckpoint ?? (finalKind ? "final" : 3));
  const [pending, startTransition] = useTransition();

  const refs = useRef(new Map<string, HTMLElement>());
  const saveRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const focusRequest = useRef<string | null>(null);
  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // Изменённые ячейки: черновик отличается от сохранённого
  const dirtyKeys = useMemo(
    () =>
      Object.keys(drafts).filter((k) => {
        const [sid, c] = k.split(":");
        const s = byId.get(sid!);
        const col: Col = c === "final" ? "final" : (Number(c) as CheckpointNo);
        return s && drafts[k]!.trim() !== savedValue(s, col);
      }),
    [drafts, byId],
  );

  const valueOf = (s: JournalStudent, col: Col) => drafts[cellKey(s.id, col)] ?? savedValue(s, col);

  /** Ошибка ячейки: сначала мгновенная проверка ввода, потом ответ сервера. */
  const errorOf = (key: string, col: Col, text: string): string | null => {
    if (!(col === "final" && finalKind === "CREDIT")) {
      const p = parsePointsInput(text);
      if (!p.ok) return p.error;
    }
    return serverErrors[key] ?? null;
  };

  const clientInvalid = dirtyKeys.filter((k) => {
    const col = k.endsWith(":final") ? "final" : (Number(k.split(":")[1]) as CheckpointNo);
    return !(col === "final" && finalKind === "CREDIT") && !parsePointsInput(drafts[k]!).ok;
  });

  // ─── Фокус ─────────────────────────────────────────────────────────

  const focusField = useCallback((key: string) => {
    const layout: Layout = isDesktop() ? "d" : "m";
    const el = refs.current.get(fieldId(layout, key));
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    }
    return false;
  }, []);

  /** На телефоне поле видно только в выбранной колонке: переключаем колонку, фокус — после отрисовки. */
  const focusCell = (key: string) => {
    if (focusField(key)) return;
    const c = key.split(":")[1];
    setMode(c === "final" ? "final" : (Number(c) as CheckpointNo));
    focusRequest.current = key;
  };

  useEffect(() => {
    if (focusRequest.current && focusField(focusRequest.current)) focusRequest.current = null;
  });

  /** Enter / ↓ — следующий студент в той же колонке, Shift+Enter / ↑ — предыдущий. */
  const moveFocus = (layout: Layout, index: number, col: Col, step: 1 | -1) => {
    const next = students[index + step];
    if (!next) {
      if (step === 1) saveRef.current?.focus();
      return;
    }
    const el = refs.current.get(fieldId(layout, cellKey(next.id, col)));
    el?.focus();
    if (el instanceof HTMLInputElement && el.type === "text") el.select();
  };

  const onFieldKeyDown = (layout: Layout, index: number, col: Col) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing) return;
    const isSelect = e.currentTarget instanceof HTMLSelectElement;
    if (e.key === "Enter") {
      e.preventDefault(); // не отправлять форму: Enter — переход к следующему студенту
      moveFocus(layout, index, col, e.shiftKey ? -1 : 1);
    } else if (!isSelect && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      moveFocus(layout, index, col, e.key === "ArrowDown" ? 1 : -1);
    }
  };

  // ─── Изменение и сохранение ────────────────────────────────────────

  const setCell = (s: JournalStudent, col: Col, text: string) => {
    const key = cellKey(s.id, col);
    setDrafts((d) => {
      const next = { ...d };
      if (text.trim() === savedValue(s, col)) delete next[key];
      else next[key] = text;
      return next;
    });
    if (serverErrors[key]) {
      setServerErrors((errs) => {
        const next = { ...errs };
        delete next[key];
        return next;
      });
    }
    if (justSaved.size > 0) setJustSaved(new Set());
    if (banner?.type === "success") setBanner(null);
  };

  const discard = () => {
    if (dirtyKeys.length > 0 && !window.confirm(`Отменить ${dirtyKeys.length} ${plural(dirtyKeys.length, ["изменение", "изменения", "изменений"])}?`)) {
      return;
    }
    setDrafts({});
    setServerErrors({});
    setBanner(null);
  };

  const toEntry = (key: string, text: string): GradeEntryInput => {
    const [studentId, c] = key.split(":") as [string, string];
    const t = text.trim();
    if (c !== "final") {
      const p = parsePointsInput(t);
      return { studentId, kind: "CHECKPOINT", checkpoint: Number(c) as CheckpointNo, points: p.ok ? p.points : null };
    }
    if (finalKind === "CREDIT") return { studentId, kind: "CREDIT", passed: t === "pass" ? true : t === "fail" ? false : null };
    const p = parsePointsInput(t);
    return { studentId, kind: "EXAM", points: p.ok ? p.points : null };
  };

  const save = () => {
    if (pending) return;
    if (dirtyKeys.length === 0) {
      setBanner({ type: "success", text: "Изменений нет — всё уже сохранено." });
      return;
    }
    if (clientInvalid.length > 0) {
      setBanner({
        type: "error",
        text: `Исправьте ${clientInvalid.length} ${plural(clientInvalid.length, ["поле", "поля", "полей"])}: баллы — целое число от 0 до 100. Ничего не сохранено.`,
      });
      focusCell(firstInOrder(clientInvalid));
      return;
    }

    // Порядок — как в журнале: по студентам, внутри — по колонкам
    const order = new Map(students.flatMap((s, i) => cols.map((c, j) => [cellKey(s.id, c), i * 10 + j] as const)));
    const keys = [...dirtyKeys].sort((a, b) => order.get(a)! - order.get(b)!);
    const sent = Object.fromEntries(keys.map((k) => [k, drafts[k]!]));

    setBanner(null);
    startTransition(async () => {
      let savedCount = 0;
      const savedKeys: string[] = [];
      const updated = new Map<string, JournalStudent>();
      let lastAssignment: TeacherAssignment | null = null;
      let failure: { text: string; errors: Record<string, string> } | null = null;

      try {
        // Группа целиком (до ~30 человек × 4 колонки) может не влезть в одно сохранение — частями
        for (let off = 0; off < keys.length; off += MAX_GRADES_PER_SAVE) {
          const chunk = keys.slice(off, off + MAX_GRADES_PER_SAVE);
          const r = await saveGradesAction({ assignmentId: assignment.id, entries: chunk.map((k) => toEntry(k, sent[k]!)) });
          if (!r.ok) {
            const errors: Record<string, string> = {};
            for (const fe of r.fieldErrors) {
              const k = chunk[fe.index];
              if (k && !errors[k]) errors[k] = fe.message;
            }
            failure = { text: r.error, errors };
            break;
          }
          savedCount += r.saved;
          savedKeys.push(...chunk);
          r.students.forEach((s) => updated.set(s.id, s));
          lastAssignment = r.assignment;
        }
      } catch {
        failure = { text: "Не удалось сохранить: нет связи с сервером. Проверьте интернет и нажмите «Сохранить» ещё раз.", errors: {} };
      }

      if (savedKeys.length > 0) {
        setStudents((list) => list.map((s) => updated.get(s.id) ?? s));
        if (lastAssignment) setAssignment(lastAssignment);
        // Убираем из черновика только то, что ушло на сервер и с тех пор не менялось
        setDrafts((d) => {
          const next = { ...d };
          for (const k of savedKeys) if (next[k] === sent[k]) delete next[k];
          return next;
        });
        setJustSaved(new Set(savedKeys));
      }

      if (failure) {
        const errKeys = Object.keys(failure.errors);
        setServerErrors(failure.errors);
        const savedNote = savedKeys.length > 0 ? ` Часть оценок сохранена (${gradesLabel(savedCount)}).` : " Ничего не сохранено.";
        setBanner({
          type: "error",
          text: errKeys.length > 0 ? `${failure.text}: ${errKeys.length} ${plural(errKeys.length, ["ошибка", "ошибки", "ошибок"])} у полей.${savedNote}` : `${failure.text}.${savedNote}`.replace("..", "."),
        });
        if (errKeys.length > 0) focusCell(firstInOrder(errKeys));
        return;
      }

      setServerErrors({});
      setBanner({
        type: "success",
        text:
          savedCount > 0
            ? `Сохранено: ${gradesLabel(savedCount)}. ${savedCount === 1 ? "Студент увидит её в разделе «Оценки» и получит уведомление." : "Студенты увидят их в разделе «Оценки» и получат уведомления."}`
            : "Сохранено. Оценки уже были такими.",
      });
    });
  };

  function firstInOrder(keys: string[]): string {
    const order = new Map(students.flatMap((s, i) => cols.map((c, j) => [cellKey(s.id, c), i * 10 + j] as const)));
    return [...keys].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))[0]!;
  }

  // ─── Защита от потери несохранённого ────────────────────────────────

  const dirtyCount = dirtyKeys.length;
  useEffect(() => {
    if (dirtyCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // старые браузеры
    };
    // Переходы внутри кабинета (меню, «Назад к группам») не вызывают beforeunload — спрашиваем сами
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const msg = `Есть несохранённые оценки (${dirtyCount}). Уйти без сохранения?`;
      if (!window.confirm(msg)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Другие формы страницы (например, «Выйти») — тоже спрашиваем
    const onSubmit = (e: SubmitEvent) => {
      if (e.target === formRef.current) return;
      if (!window.confirm(`Есть несохранённые оценки (${dirtyCount}). Продолжить без сохранения?`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [dirtyCount]);

  // ─── Отрисовка ─────────────────────────────────────────────────────

  if (students.length === 0) {
    return (
      <EmptyState icon={Users} title="В группе нет студентов">
        Студенты появятся здесь после загрузки списков вуза. Если это ошибка — сообщите в деканат.
      </EmptyState>
    );
  }

  const colTitle = (col: Col) => (col === "final" ? FINAL_KIND_LABEL[finalKind!] : checkpointLabel(col));
  const colShort = (col: Col) => (col === "final" ? (finalKind === "CREDIT" ? "Зачёт" : "Экз.") : CHECKPOINTS[col - 1]!.short);
  const current = journal.currentCheckpoint;

  /** Состояние ячейки для оформления и подсказок. */
  const cellState = (s: JournalStudent, col: Col) => {
    const key = cellKey(s.id, col);
    const text = valueOf(s, col);
    const dirty = dirtyKeys.includes(key);
    const error = dirty || serverErrors[key] ? errorOf(key, col, text) : null;
    const erase = dirty && !error && text.trim() === "" && savedValue(s, col) !== "";
    let letter: GradeLetter | null = null;
    if (!(col === "final" && finalKind === "CREDIT")) {
      const p = parsePointsInput(text);
      if (p.ok && p.points !== null) letter = letterFor(p.points);
    }
    return { key, text, dirty, error, erase, letter, saved: justSaved.has(key) && !dirty };
  };

  /** Средний по срезам с учётом ещё не сохранённых (но правильных) баллов. */
  const liveAverage = (s: JournalStudent) =>
    scoredAverage(
      CP_COLS.map((c) => {
        const p = parsePointsInput(valueOf(s, c));
        return p.ok ? p.points : s.checkpoints[c - 1]?.points;
      }),
    );

  const inputClass = (st: ReturnType<typeof cellState>, big = false) =>
    cn(
      "rounded-lg border bg-surface text-center tabular-nums text-text outline-none transition-colors placeholder:text-muted focus:ring-2",
      big ? "h-12 w-24 text-[20px] font-semibold" : "h-11 w-14 text-[16px]",
      st.error
        ? "border-danger bg-danger-soft focus:ring-danger/30"
        : st.dirty
          ? "border-warning focus:border-primary focus:ring-primary/20"
          : st.saved
            ? "border-success focus:border-primary focus:ring-primary/20"
            : "border-border focus:border-primary focus:ring-primary/20",
    );

  const hintFor = (st: ReturnType<typeof cellState>, id: string) =>
    st.error ? (
      <p id={`${id}-err`} className="mt-1 text-xs leading-snug text-danger">
        {st.error}
      </p>
    ) : st.erase ? (
      <p id={`${id}-hint`} className="mt-1 text-xs leading-snug text-warning">
        Оценка будет стёрта
      </p>
    ) : null;

  const describedBy = (st: ReturnType<typeof cellState>, id: string, withLetter: boolean) =>
    [st.error ? `${id}-err` : st.erase ? `${id}-hint` : null, withLetter ? `${id}-letter` : null].filter(Boolean).join(" ") || undefined;

  /** Поле баллов: срез или экзамен. */
  const pointsField = (layout: Layout, s: JournalStudent, index: number, col: Col, big = false) => {
    const st = cellState(s, col);
    const id = fieldId(layout, st.key);
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <input
            ref={register(id)}
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            autoComplete="off"
            enterKeyHint={index === students.length - 1 ? "done" : "next"}
            value={st.text}
            placeholder="—"
            aria-label={fieldLabel(s, col, finalKind)}
            aria-invalid={st.error ? true : undefined}
            aria-describedby={describedBy(st, id, true)}
            onChange={(e) => setCell(s, col, e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={onFieldKeyDown(layout, index, col)}
            className={inputClass(st, big)}
          />
          <LetterBadge id={`${id}-letter`} letter={st.letter} size={big ? "lg" : "sm"} />
          {big && st.letter && <span className="min-w-0 text-sm text-muted">{scaleEntry(st.letter).label}</span>}
        </div>
        {hintFor(st, id)}
      </div>
    );
  };

  /** Зачёт на компьютере: компактный выпадающий список. */
  const creditSelect = (s: JournalStudent, index: number) => {
    const st = cellState(s, "final");
    const id = fieldId("d", st.key);
    return (
      <div>
        <select
          ref={register(id)}
          id={id}
          value={st.text}
          aria-label={fieldLabel(s, "final", finalKind)}
          aria-invalid={st.error ? true : undefined}
          aria-describedby={describedBy(st, id, false)}
          onChange={(e) => setCell(s, "final", e.target.value)}
          onKeyDown={onFieldKeyDown("d", index, "final")}
          className={cn(inputClass(st), "w-36 px-2 text-left text-[14px]", st.text === "fail" && !st.dirty && "text-danger")}
        >
          <option value="">не выставлено</option>
          <option value="pass">зачтено</option>
          <option value="fail">не зачтено</option>
        </select>
        {hintFor(st, id)}
      </div>
    );
  };

  /** Зачёт на телефоне: три крупные кнопки-переключатели (радиокнопки). */
  const creditRadios = (s: JournalStudent) => {
    const st = cellState(s, "final");
    const id = fieldId("m", st.key);
    const options: { value: CreditValue; label: string }[] = [
      { value: "pass", label: "Зачтено" },
      { value: "fail", label: "Не зачтено" },
      { value: "", label: "Не выставлено" },
    ];
    return (
      <fieldset aria-describedby={describedBy(st, id, false)}>
        <legend className="sr-only">{fieldLabel(s, "final", finalKind)}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
          {options.map((o) => {
            const checked = st.text === o.value;
            return (
              <label
                key={o.value || "none"}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-[13px] leading-tight font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                  checked
                    ? o.value === "pass"
                      ? "bg-success-soft text-success shadow-sm"
                      : o.value === "fail"
                        ? "bg-danger-soft text-danger shadow-sm"
                        : "bg-surface text-text shadow-sm"
                    : "text-muted hover:text-text",
                  checked && st.dirty && "ring-2 ring-warning",
                )}
              >
                <input
                  ref={checked ? register(id) : undefined}
                  type="radio"
                  name={id}
                  value={o.value}
                  checked={checked}
                  onChange={() => setCell(s, "final", o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            );
          })}
        </div>
        {hintFor(st, id)}
      </fieldset>
    );
  };

  /** Сводка ячейки в карточке студента (телефон): кнопка — перейти к этой колонке. */
  const summaryChip = (s: JournalStudent, col: Col) => {
    const st = cellState(s, col);
    const active = mode === col;
    let value: React.ReactNode = <span className="text-muted">—</span>;
    let spoken = "нет оценки";
    if (col === "final" && finalKind === "CREDIT") {
      if (st.text) {
        value = <span className={st.text === "pass" ? "text-success" : "text-danger"}>{st.text === "pass" ? "зачт." : "не зач."}</span>;
        spoken = formatCredit(st.text === "pass");
      }
    } else if (st.letter) {
      const p = parsePointsInput(st.text);
      value = (
        <span className={scaleEntry(st.letter).tone.text}>
          <span className="font-semibold">{st.letter}</span> {p.ok && p.points !== null ? p.points : ""}
        </span>
      );
      spoken = `${st.letter}, ${st.text} баллов`;
    } else if (st.error) {
      value = <span className="text-danger">ошибка</span>;
      spoken = "ошибка";
    }
    return (
      <button
        key={col}
        type="button"
        onClick={() => {
          setMode(col);
          focusRequest.current = st.key;
        }}
        aria-pressed={active}
        aria-label={`${colTitle(col)}: ${spoken}${st.dirty ? ", не сохранено" : ""}. Заполнять эту колонку`}
        className={cn(
          "relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border px-1 py-1 text-center text-[13px] leading-tight tabular-nums",
          active ? "border-primary bg-primary-soft" : "border-border bg-surface",
          st.error && "border-danger",
        )}
      >
        <span className="text-[11px] text-muted">{colShort(col)}</span>
        <span className="max-w-full truncate">{value}</span>
        {st.dirty && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-warning" aria-hidden />}
      </button>
    );
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        // onSubmit, а не <form action>: React 19 после action сбрасывает поля к начальным значениям,
        // а здесь после сохранения в полях должны остаться новые оценки (см. CLAUDE.md)
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          save();
        }
      }}
      className="space-y-4"
    >
      {/* Прогресс группы (компьютер; на телефоне — в переключателе колонок) — обновляется после сохранения */}
      <Card className="hidden gap-x-6 gap-y-3 lg:grid lg:grid-cols-2 xl:grid-cols-4">
        {assignment.progress.map((p) => (
          <ProgressMeter
            key={p.checkpoint}
            label={checkpointLabel(p.checkpoint)}
            graded={p.graded}
            total={p.total}
            current={p.checkpoint === current}
          />
        ))}
        {assignment.final && (
          <ProgressMeter
            label={FINAL_KIND_LABEL[assignment.final.kind]}
            graded={assignment.finalGraded}
            total={assignment.studentCount}
            current={current === null}
          />
        )}
      </Card>

      <p className="text-sm text-muted">
        Баллы — от 0 до 100, буква ставится сама. Пустое поле — оценка будет стёрта.{" "}
        <span className="hidden lg:inline">Enter или ↓ — следующий студент, ↑ — предыдущий, Tab — следующая колонка, Ctrl+S — сохранить.</span>
      </p>

      {/* ── Телефон и планшет: выбор колонки + карточки студентов ── */}
      <div className="space-y-3 lg:hidden">
        <div role="group" aria-label="Что заполняю" className="grid grid-cols-4 gap-1 rounded-xl bg-surface-muted p-1">
          {cols.map((c) => {
            const graded = c === "final" ? assignment.finalGraded : assignment.progress[c - 1]!.graded;
            const isCurrent = c === "final" ? current === null : c === current;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={mode === c}
                aria-label={`${colTitle(c)}${isCurrent ? ", идёт" : ""}: выставлено ${graded} из ${assignment.studentCount}`}
                onClick={() => setMode(c)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center rounded-lg px-1 py-1 text-center text-[13px] leading-tight font-medium",
                  mode === c ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text",
                )}
              >
                {c === "final" ? colTitle(c) : `${c}-й срез`}
                <span
                  className={cn(
                    "mt-0.5 text-[11px] font-normal tabular-nums",
                    graded >= assignment.studentCount ? "text-success" : mode === c ? "text-text" : "text-muted",
                  )}
                >
                  {graded}/{assignment.studentCount}
                  {isCurrent && " · идёт"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          Заполняете: <span className="font-medium text-text">{colTitle(mode)}</span>
          {mode !== "final" && ` · ${dueLabel(CHECKPOINTS[mode - 1]!.due)}`}
          {mode === "final" && journal.assignment.final?.date && ` · ${formatDayMonthLong(journal.assignment.final.date)}`}
        </p>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {students.map((s, i) => {
            const avg = liveAverage(s);
            return (
              <li key={s.id} className="min-w-0 rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] leading-snug font-semibold break-words">{s.fullName}</h3>
                    <p className="text-xs text-muted">Зачётка {s.recordBookNo}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted">
                    Средний
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-sm text-text">
                      {avg ? (
                        <>
                          <LetterBadge letter={avg.letter} />
                          <span className="tabular-nums">{formatPoints(avg.points)}</span>
                        </>
                      ) : (
                        <span className="text-muted">нет</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={cn("mt-3 grid gap-1.5", cols.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
                  {cols.map((c) => summaryChip(s, c))}
                </div>
                <div className="mt-3">
                  {mode === "final" && finalKind === "CREDIT" ? creditRadios(s) : pointsField("m", s, i, mode, true)}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Компьютер: таблица с полями ввода ── */}
      <div className="hidden overflow-auto rounded-card border border-border bg-surface lg:block lg:max-h-[calc(100dvh-9rem)]">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">
            Журнал группы {assignment.group.name}, {assignment.discipline.name}: срезы, средний балл и итоговая оценка
          </caption>
          <thead>
            <tr className="text-[13px] text-muted">
              <th scope="col" className="sticky top-0 left-0 z-30 border-b border-border bg-surface px-3 py-2.5 font-medium">
                Студент
              </th>
              {CP_COLS.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 border-b border-border px-1.5 py-2.5 font-medium xl:px-2 whitespace-nowrap",
                    c === current ? "bg-primary-soft text-primary" : "bg-surface",
                  )}
                >
                  {checkpointLabel(c)}
                  <span className="block text-[11px] font-normal">
                    {c === current ? "идёт · " : ""}
                    {dueLabel(CHECKPOINTS[c - 1]!.due)}
                  </span>
                </th>
              ))}
              <th scope="col" className="sticky top-0 z-20 border-b border-border bg-surface px-2 py-2.5 font-medium">
                Средний
              </th>
              <th
                scope="col"
                className={cn(
                  "sticky top-0 z-20 border-b border-border px-1.5 py-2.5 font-medium xl:px-2 whitespace-nowrap",
                  current === null ? "bg-primary-soft text-primary" : "bg-surface",
                )}
              >
                {finalKind ? FINAL_KIND_LABEL[finalKind] : "Итоговая"}
                <span className="block text-[11px] font-normal">
                  {journal.assignment.final?.date ? formatDayMonthLong(journal.assignment.final.date) : finalKind ? "" : "нет в расписании"}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const avg = liveAverage(s);
              return (
                <tr key={s.id} className="group align-top">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2 text-left font-normal group-last:border-0 group-hover:bg-surface-muted"
                  >
                    <span className="block min-w-40 font-medium break-words text-text">
                      <span className="mr-1.5 text-muted tabular-nums">{i + 1}.</span>
                      {s.fullName}
                    </span>
                    <span className="block text-xs text-muted">Зачётка {s.recordBookNo}</span>
                  </th>
                  {CP_COLS.map((c) => (
                    <td
                      key={c}
                      className={cn(
                        "border-b border-border px-1.5 py-2 group-last:border-0 group-hover:bg-surface-muted xl:px-2",
                        c === current && "bg-primary-soft/40",
                      )}
                    >
                      {pointsField("d", s, i, c)}
                    </td>
                  ))}
                  <td className="border-b border-border px-1.5 py-2 group-last:border-0 group-hover:bg-surface-muted xl:px-2">
                    <div className="flex h-11 items-center gap-1.5 whitespace-nowrap">
                      {avg ? (
                        <>
                          <LetterBadge letter={avg.letter} />
                          <span className="tabular-nums">{formatPoints(avg.points)}</span>
                        </>
                      ) : (
                        <span className="text-muted">нет оценок</span>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-border px-1.5 py-2 group-last:border-0 group-hover:bg-surface-muted xl:px-2">
                    {finalKind === "CREDIT" ? (
                      creditSelect(s, i)
                    ) : finalKind === "EXAM" ? (
                      pointsField("d", s, i, "final")
                    ) : (
                      <span className="flex h-11 items-center text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Панель сохранения: всегда видна (над нижним меню на телефоне) ── */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4">
        {banner && (
          <div
            role={banner.type === "error" ? "alert" : "status"}
            className={cn(
              "mb-2 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-sm",
              banner.type === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-success-soft text-success",
            )}
          >
            {banner.type === "error" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>{banner.text}</span>
          </div>
        )}
        {/* На телефоне панель без изменений не нужна — не закрываем ею карточки */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-card border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur sm:gap-3 sm:p-3",
            dirtyCount === 0 && !pending && "max-lg:hidden",
          )}
        >
          <p className="min-w-0 flex-1 text-sm" aria-live="polite">
            {pending ? (
              "Сохраняем…"
            ) : dirtyCount > 0 ? (
              <>
                <span className="block font-medium text-warning">Не сохранено: {dirtyCount}</span>
                {clientInvalid.length > 0 && <span className="block text-xs text-danger">С ошибкой: {clientInvalid.length}</span>}
              </>
            ) : (
              <span className="text-muted">Все изменения сохранены</span>
            )}
          </p>
          {dirtyCount > 0 && !pending && (
            <Button type="button" variant="ghost" onClick={discard} aria-label="Отменить несохранённые изменения">
              <Undo2 className="size-4" aria-hidden />
              <span className="hidden sm:inline">Отменить</span>
            </Button>
          )}
          <Button ref={saveRef} type="submit" disabled={pending || dirtyCount === 0}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? "Сохраняем…" : dirtyCount > 0 ? `Сохранить (${dirtyCount})` : "Сохранить"}
          </Button>
        </div>
      </div>
    </form>
  );
}
