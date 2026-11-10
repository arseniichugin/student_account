import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
