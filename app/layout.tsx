import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import { HydrationCheck } from "@/components/hydration-check";
import { UNIVERSITY_NAME } from "@/lib/config";
import "./globals.css";

/**
 * Встроенный «сторож» загрузки (работает без React — именно когда JS кабинета не загрузился):
 *  — файл /_next/static/… не загрузился → сообщает серверу (POST /api/client-log, видно в логе сервера),
 *    один раз за минуту перезагружает страницу (помогает, если страница была от прошлой версии сервера),
 *    при повторе показывает плашку;
 *  — через 15 с страница так и не «ожила» (нет гидратации) → сообщает серверу и показывает плашку.
 */
const CLIENT_WATCHDOG = `(function(){
var sent=0,html=document.documentElement;
function log(t,s){try{if(sent++>3||!navigator.sendBeacon)return;navigator.sendBeacon("/api/client-log",JSON.stringify({type:t,src:String(s||"").slice(0,300),path:location.pathname.slice(0,200)}))}catch(e){}}
function show(){if(html.dataset.hydrated)return;var w=document.getElementById("hydration-warning");if(w)w.hidden=false}
window.addEventListener("error",function(e){var t=e.target;if(!t||t.tagName!=="SCRIPT")return;log("script-error",t.src);
try{var k="cabinet-reload",last=+sessionStorage.getItem(k)||0;if(Date.now()-last>60000){sessionStorage.setItem(k,String(Date.now()));location.reload();return}}catch(_){}
show()},true);
setTimeout(function(){if(!html.dataset.hydrated){log("hydration-timeout","");show()}},15000);
})();`;

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
        {/* Предупреждение, если JS кабинета не загрузился: ошибка загрузки скрипта или 15 секунд без гидратации.
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
              '<p class="min-w-0 flex-1">Страница загрузилась не полностью — подсказки и кнопки могут не работать. Если повторяется, сообщите администратору: причина записана в журнале сервера.</p>' +
              '<button type="button" onclick="location.reload()" class="min-h-11 rounded-xl px-3 font-semibold underline">Обновить страницу</button>' +
              '<button type="button" onclick="this.closest(\'#hydration-warning\').hidden=true" aria-label="Закрыть предупреждение" class="flex size-11 items-center justify-center rounded-xl text-lg">×</button>' +
              "</div>",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: CLIENT_WATCHDOG,
          }}
        />
        <HydrationCheck />
        {children}
      </body>
    </html>
  );
}
