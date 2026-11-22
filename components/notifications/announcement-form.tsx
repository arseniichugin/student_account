"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  NOTIFICATION_KIND_LABEL,
  STAFF_NOTIFICATION_KINDS,
  type AudienceType,
  type StaffNotificationKind,
} from "@/lib/notifications/labels";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from "@/lib/validation/notifications";
import { createStaffAnnouncementAction, createTeacherAnnouncementAction } from "@/lib/notifications/form-actions";

/**
 * Новое событие: вид, название, текст, кому, когда. Общая форма деканата (mode="staff")
 * и преподавателя (mode="teacher") — отличаются только варианты «Кому отправить».
 * Отправляется через onSubmit + startTransition (а не <form action>): иначе React 19 после отправки
 * сбрасывает все поля, в том числе выбранную аудиторию. После успеха очищаются только название и текст.
 */
export function AnnouncementForm({
  mode,
  students,
  teachers = 0,
  courses = [],
  groups = [],
  teacherChoices = [],
  minSendAt,
}: {
  mode: "staff" | "teacher";
  /** Деканат: студентов факультета; преподаватель: студентов во всех его группах */
  students: number;
  /** Деканат: преподавателей, ведущих занятия у факультета */
  teachers?: number;
  courses?: { course: number; students: number }[];
  /** Группы для «Отправить группе…» (group — подпись курса для группировки в списке) */
  groups?: { id: string; label: string; group?: string }[];
  /** Преподаватели для «Преподавателю…» (только деканат) */
  teacherChoices?: { id: string; label: string }[];
  /** «YYYY-MM-DDTHH:MM» — сейчас по Москве (нижняя граница поля времени) */
  minSendAt: string;
}) {
  const id = useId();
  const staff = mode === "staff";
  const [state, formAction, pending] = useActionState(
    staff ? createStaffAnnouncementAction : createTeacherAnnouncementAction,
    undefined,
  );
  const [kind, setKind] = useState<StaffNotificationKind>("ANNOUNCEMENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceType>(staff ? "faculty" : "myGroups");
  const [course, setCourse] = useState(String(courses[0]?.course ?? ""));
  const [when, setWhen] = useState<"now" | "later">("now");
  const [sendAt, setSendAt] = useState("");

  // После успешной отправки очищаем название и текст (аудитория и вид остаются — удобно для серии сообщений)
  // (сброс во время рендера, а не в useEffect — так рекомендует React для «состояния от пропсов»)
  const savedAt = state?.savedAt;
  const [handledSavedAt, setHandledSavedAt] = useState(savedAt);
  if (savedAt !== handledSavedAt) {
    setHandledSavedAt(savedAt);
    setTitle("");
    setBody("");
  }

  const err = state?.fieldErrors ?? {};
  // После ошибки проверки — фокус на первое поле с ошибкой
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.fieldErrors) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state]);
  const fieldError = (name: string) =>
    err[name] ? (
      <p id={`${id}-${name}-error`} className="mt-1 text-sm text-danger">
        {err[name]}
      </p>
    ) : null;
  const describedBy = (name: string) => (err[name] ? `${id}-${name}-error` : undefined);

  return (
    <form
      // action — запасной путь без JavaScript (обычная отправка формы); с JS отправку ведёт onSubmit
      action={formAction}
      ref={formRef}
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <fieldset className="min-w-0">
        <legend className="mb-1.5 block text-sm font-medium">Вид события</legend>
        <div className="flex flex-wrap gap-2">
          {STAFF_NOTIFICATION_KINDS.map((k) => (
            <Chip key={k} name="kind" value={k} checked={kind === k} onChange={() => setKind(k)}>
              {NOTIFICATION_KIND_LABEL[k]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor={`${id}-title`}>Название</Label>
        <Input
          id={`${id}-title`}
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          placeholder="Например: Экзамен по зельеварению"
          aria-invalid={!!err.title}
          aria-describedby={describedBy("title")}
          required
        />
        {fieldError("title")}
      </div>

      <div>
        <Label htmlFor={`${id}-body`}>Текст сообщения</Label>
        <Textarea
          id={`${id}-body`}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={ANNOUNCEMENT_BODY_MAX}
          rows={4}
          placeholder="Дата, время, аудитория, что взять с собой…"
          aria-invalid={!!err.body}
          aria-describedby={[describedBy("body"), `${id}-body-count`].filter(Boolean).join(" ")}
          required
        />
        <p id={`${id}-body-count`} className="mt-1 text-right text-xs text-muted">
          {body.length} / {ANNOUNCEMENT_BODY_MAX}
        </p>
        {fieldError("body")}
      </div>

      <fieldset className="group/aud min-w-0">
        <legend className="mb-1.5 block text-sm font-medium">Кому отправить</legend>
        <div className="flex flex-wrap gap-2">
          {(staff
            ? ([
                ["faculty", `Отправить всем (${students + teachers})`],
                ["course", "Отправить курсу…"],
                ["group", "Отправить группе…"],
                ["allTeachers", `Всем преподавателям (${teachers})`],
                ["teacher", "Преподавателю…"],
              ] as const)
            : ([
                ["myGroups", `Всем моим группам (${students})`],
                ["group", "Отправить группе…"],
              ] as const)
          ).map(([value, label]) => (
            <Chip key={value} name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)}>
              {label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {audience === "faculty" &&
            `Все студенты вашего факультета (${students}) и преподаватели, которые ведут у него занятия (${teachers}).`}
          {audience === "course" && "Все студенты выбранного курса вашего факультета."}
          {audience === "group" &&
            (staff
              ? "Студенты академической или языковой группы вашего факультета."
              : "Студенты одной из групп, у которых вы ведёте занятия.")}
          {audience === "allTeachers" && "Все преподаватели, которые ведут занятия у групп вашего факультета."}
          {audience === "teacher" && "Один преподаватель из ведущих занятия у вашего факультета."}
          {audience === "myGroups" && "Студенты всех групп, у которых вы ведёте занятия."}
        </p>

        {/* Курс и время отправки показываются через CSS (:has(:checked)) — и без JavaScript */}
        {staff && (
          <div className="mt-3 hidden group-has-[[value=course]:checked]/aud:block">
            <Label htmlFor={`${id}-course`}>Курс</Label>
            <Select
              id={`${id}-course`}
              name="course"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              aria-invalid={!!err.course}
              aria-describedby={describedBy("course")}
            >
              {courses.map((c) => (
                <option key={c.course} value={c.course}>
                  {c.course} курс — студентов: {c.students}
                </option>
              ))}
            </Select>
            {fieldError("course")}
          </div>
        )}
        {/* Группа и преподаватель — обычные выпадающие списки, заполненные на сервере (как курс):
            показываются через CSS и работают без JavaScript */}
        <div className="mt-3 hidden group-has-[[value=group]:checked]/aud:block">
          <Label htmlFor={`${id}-group`}>Группа</Label>
          <Select
            id={`${id}-group`}
            name="groupId"
            defaultValue=""
            aria-invalid={!!err.groupId}
            aria-describedby={describedBy("groupId")}
          >
            <option value="">{groups.length ? "Выберите группу" : "Групп нет"}</option>
            {groupByCourse(groups).map(([course, items]) => (
              <optgroup key={course} label={course}>
                {items.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {fieldError("groupId")}
        </div>
        {staff && (
          <div className="mt-3 hidden group-has-[[value=teacher]:checked]/aud:block">
            <Label htmlFor={`${id}-teacher`}>Преподаватель</Label>
            <Select
              id={`${id}-teacher`}
              name="teacherId"
              defaultValue=""
              aria-invalid={!!err.teacherId}
              aria-describedby={describedBy("teacherId")}
            >
              <option value="">{teacherChoices.length ? "Выберите преподавателя" : "Преподавателей нет"}</option>
              {teacherChoices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            {fieldError("teacherId")}
          </div>
        )}
      </fieldset>

      <fieldset className="group/when min-w-0">
        <legend className="mb-1.5 block text-sm font-medium">Когда отправить</legend>
        <div className="flex flex-wrap gap-2">
          <Chip name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")}>
            Сейчас
          </Chip>
          <Chip name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")}>
            Запланировать
          </Chip>
        </div>
        <div className="mt-3 hidden max-w-xs group-has-[[value=later]:checked]/when:block">
          <Label htmlFor={`${id}-sendAt`}>Дата и время (по Москве)</Label>
          <Input
            id={`${id}-sendAt`}
            type="datetime-local"
            name="sendAt"
            value={sendAt}
            min={minSendAt}
            onChange={(e) => setSendAt(e.target.value)}
            aria-invalid={!!err.sendAt}
            aria-describedby={describedBy("sendAt")}
          />
          {fieldError("sendAt")}
          <p className="mt-1 text-sm text-muted">До этого времени студенты сообщение не увидят; отправку можно отменить.</p>
        </div>
      </fieldset>

      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state?.success && <FormMessage type="success">{state.success}</FormMessage>}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Отправляем…" : when === "later" ? "Запланировать" : "Отправить"}
      </Button>
    </form>
  );
}

/** Вариант-«таблетка» (радиокнопка). Высота 44 px, фокус с клавиатуры виден. */
function Chip({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
          // Подсветка — по состоянию самой радиокнопки (CSS), а не React: работает и без JavaScript
          "bg-surface-muted text-muted hover:text-text peer-checked:bg-primary peer-checked:text-on-primary",
        )}
      >
        {children}
      </span>
    </label>
  );
}

/** Группы списка по курсам — для <optgroup>. */
function groupByCourse<T extends { group?: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const i of items) {
    const key = i.group ?? "Группы";
    map.set(key, [...(map.get(key) ?? []), i]);
  }
  return [...map.entries()];
}
