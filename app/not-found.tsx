import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <SearchX className="size-12 text-muted" aria-hidden />
      <h1 className="mt-4 text-[22px] font-bold">Страница не найдена</h1>
      <p className="mt-2 text-[15px] text-muted">
        Такой страницы нет или у вас нет к ней доступа.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        На главную
      </Link>
    </main>
  );
}
