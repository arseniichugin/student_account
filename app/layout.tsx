import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import { HydrationCheck } from "@/components/hydration-check";
import { UNIVERSITY_NAME } from "@/lib/config";
import "./globals.css";

// Функция, а не константа: название вуза (env UNIVERSITY_NAME) берётся при запросе, а не при сборке.
export function generateMetadata(): Metadata {
  return {
    title: {
      default: `${UNIVERSITY_NAME} · цифровой деканат`,
      template: `%s · ${UNIVERSITY_NAME}`,
    },
    description:
      `Концепт личного кабинета студента вымышленного университета «${UNIVERSITY_NAME}» для конкурса. ` +
      "Не является официальным сервисом. Все данные вымышлены.",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">
        {/* Предупреждение, если JS кабинета не загрузился: ошибка загрузки скрипта или 8 секунд без гидратации.
            Частая причина — обрыв соединения при пробросе порта или сервер от прошлой сборки. */}
        <div
          id="hydration-warning"
          hidden
          role="alert"
          className="sticky top-0 z-50 border-b border-warning bg-warning-soft px-4 py-2 text-sm text-warning"
          // Разметка без React: кнопки должны работать именно тогда, когда JavaScript кабинета не загрузился
          dangerouslySetInnerHTML={{
            __html:
              '<div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">' +
              '<p class="min-w-0 flex-1">Страница загрузилась не полностью — подсказки и кнопки могут не работать.</p>' +
              '<button type="button" onclick="location.reload()" class="min-h-11 rounded-xl px-3 font-semibold underline">Обновить страницу</button>' +
              '<button type="button" onclick="this.closest(\'#hydration-warning\').hidden=true" aria-label="Закрыть предупреждение" class="flex size-11 items-center justify-center rounded-xl text-lg">×</button>' +
              "</div>",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function s(){if(document.documentElement.dataset.hydrated)return;var w=document.getElementById("hydration-warning");if(w)w.hidden=false}window.addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="SCRIPT")s()},true);setTimeout(s,8000)})();`,
          }}
        />
        <HydrationCheck />
        {children}
      </body>
    </html>
  );
}
