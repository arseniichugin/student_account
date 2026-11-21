import { MessageSquareText } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import type { MyAbout } from "@/lib/data/account";
import { AboutForm } from "./about-form";

/** Блок «О себе» в профиле любой роли: текст (или пустое состояние) и форма изменения. */
export function AboutCard({ data, note }: { data: MyAbout; /** Кто увидит текст */ note?: React.ReactNode }) {
  return (
    <Card>
      <CardTitle>О себе</CardTitle>
      {data.about ? (
        <>
          {/* Обычный текст: React экранирует HTML, whitespace-pre-line сохраняет переводы строк */}
          <p className="mt-2 text-[15px] break-words whitespace-pre-line">{data.about}</p>
          {data.updatedAt && (
            <p className="mt-2 text-xs text-muted">
              Обновлено {data.updatedAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}
            </p>
          )}
        </>
      ) : (
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-surface-muted p-3">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Пока ничего не рассказали о себе</p>
            <p className="mt-0.5 text-sm text-muted">Несколько строк о себе: чем занимаетесь, как с вами связаться.</p>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {data.shared && (
        <p className="mt-3 text-sm text-muted">
          Это общий тестовый аккаунт: текст видят все, кто под ним входит. Сохранять можно до {data.limitPerHour} раз в час.
        </p>
      )}
      <AboutForm initial={data.about ?? ""} empty={!data.about} />
    </Card>
  );
}
