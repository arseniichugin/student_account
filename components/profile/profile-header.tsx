/** Шапка карточки аккаунта в профиле: инициалы, ФИО, роль. */
export function ProfileHeader({ initials, name, meta }: { initials: string; name: string; meta: string }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary"
        aria-hidden
      >
        {initials}
      </div>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold break-words">{name}</p>
        <p className="text-sm text-muted">{meta}</p>
      </div>
    </div>
  );
}
