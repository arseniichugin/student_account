"use client"; // Границы ошибок — только клиентские компоненты

import "@fontsource-variable/inter";
import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

/**
 * Последний рубеж: ошибка в корневом layout. Заменяет его целиком, поэтому свои <html> и <body>,
 * стили и шрифт. Тема — та же: токены из globals.css переключаются по prefers-color-scheme.
 * metadata здесь не поддерживается — заголовок вкладки задаём тегом <title>.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">
        <title>Сервис временно недоступен</title>
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
