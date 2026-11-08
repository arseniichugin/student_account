import { NextResponse, type NextRequest } from "next/server";

// «Оптимистичная» проверка: без cookie сессии сразу отправляем на вход,
// не нагружая сервер рендерингом страницы. Это НЕ защита данных —
// настоящая проверка сессии и прав выполняется на сервере в requireStudent() / requireStaff().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sid")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/today/:path*", "/requests/:path*", "/profile/:path*", "/staff/:path*"],
};
