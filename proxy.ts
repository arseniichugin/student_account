import { NextResponse, type NextRequest } from "next/server";

// «Оптимистичная» проверка: без cookie сессии сразу отправляем на вход,
// не нагружая сервер рендерингом страницы. Это НЕ защита данных —
// настоящая проверка сессии и прав выполняется на сервере в requireStudent() / requireStaff() /
// requireTeacher() / requireUser().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sid")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // API (/api/*) сюда не входит: обработчик сам отвечает 401 без сессии, а не перенаправляет.
  matcher: [
    "/today/:path*",
    "/schedule/:path*",
    "/grades/:path*",
    "/map/:path*",
    "/requests/:path*",
    "/profile/:path*",
    "/staff/:path*",
    "/journal/:path*",
    "/teacher/:path*",
  ],
};
