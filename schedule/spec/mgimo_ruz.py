#!/usr/bin/env python3
"""
Выгрузка открытого расписания МГИМО из системы РУЗ (https://ruz.mgimo.ru)
в SQLite и CSV.

Ссылки «Учебные занятия по группе / преподавателю» на https://mgimo.ru/study/schedule/
ведут на ruz.mgimo.ru: это типовая система «РУЗ» с JSON-API
(те же эндпоинты, что у РУЗ ВШЭ и других вузов):

    GET /api/search?term=<текст>&type=group|person|auditorium
    GET /api/schedule/<group|person|auditorium>/<id>?start=YYYY.MM.DD&finish=YYYY.MM.DD&lng=1

Готовой выгрузки в CSV или SQL у вуза нет, поэтому скрипт собирает данные
через API и сам складывает их в базу.

Скрипт работает бережно: один поток, пауза между запросами (по умолчанию 1.5 с),
повторы с нарастающей задержкой, кэш ответов на диске (повторный запуск
не запрашивает то, что уже скачано). Если сервер вернёт антибот-проверку,
скрипт остановится, а не станет её обходить.

Использование (только стандартная библиотека, Python 3.9+):

    python mgimo_ruz.py probe                   # проверить, что API отвечает, и показать формат
    python mgimo_ruz.py discover                # собрать список групп / преподавателей / аудиторий
    python mgimo_ruz.py fetch                   # скачать расписание всех групп за семестр
    python mgimo_ruz.py fetch --kinds group person auditorium   # максимально полно
    python mgimo_ruz.py export                  # выгрузить CSV из базы
    python mgimo_ruz.py all                     # discover + fetch + export

Даты по умолчанию: осенний семестр 2026/27 (2026-09-01 .. 2026-12-31),
их можно сменить через --start / --finish.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://ruz.mgimo.ru"
UA = "mgimo-schedule-export/1.0 (personal, non-commercial; polite crawler)"
KINDS = ("group", "person", "auditorium")
# Поисковые запросы для обнаружения объектов: РУЗ ищет по подстроке,
# поэтому прохода по цифрам и буквам хватает, чтобы найти всё.
SEARCH_TERMS = list("0123456789") + list("абвгдежзиклмнопрстуфхцчшщэюя")

# Поля занятия, которые раскладываем по колонкам. Полный исходный JSON
# хранится в колонке raw, так что если у МГИМО поля называются иначе,
# ничего не потеряется.
LESSON_FIELDS = [
    "lessonOid", "date", "dayOfWeek", "dayOfWeekString", "beginLesson", "endLesson",
    "lessonNumberStart", "lessonNumberEnd", "discipline", "disciplineOid",
    "kindOfWork", "kindOfWorkOid", "lecturer", "lecturer_title", "lecturerOid",
    "lecturerEmail", "lecturer_rank", "group", "groupOid", "stream", "streamOid",
    "subGroup", "subGroupOid", "auditorium", "auditoriumOid", "building",
    "buildingOid", "note", "url1", "url1_description", "url2", "url2_description",
]


class AntiBotError(RuntimeError):
    pass


class Client:
    def __init__(self, base: str, cache_dir: Path, delay: float, timeout: float, retries: int):
        self.base = base.rstrip("/")
        self.cache_dir = cache_dir
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self._last = 0.0
        self.n_requests = 0
        cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".json")

    def get_json(self, path: str, params: dict | None = None, use_cache: bool = True):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        cp = self._cache_path(url)
        if use_cache and cp.exists():
            return json.loads(cp.read_text(encoding="utf-8"))

        last_err = None
        for attempt in range(self.retries + 1):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.n_requests += 1
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    body = r.read().decode("utf-8", errors="replace")
                    ctype = r.headers.get("Content-Type", "")
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code in (429, 500, 502, 503, 504):
                    last_err = e
                    time.sleep(self.delay * (2 ** (attempt + 2)))  # 6, 12, 24 c ...
                    continue
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last_err = e
                time.sleep(self.delay * (2 ** (attempt + 2)))
                continue

            if "__js_p_" in body or ("json" not in ctype and body.lstrip().startswith("<")):
                raise AntiBotError(
                    f"Сервер вернул HTML вместо JSON (похоже на антибот-проверку) для {url}. "
                    "Скрипт её не обходит. Откройте ruz.mgimo.ru в браузере и проверьте, "
                    "доступно ли расписание."
                )
            data = json.loads(body)
            cp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        raise ConnectionError(f"Не удалось получить {url}: {last_err}")


# ---------------------------------------------------------------- база данных

SCHEMA = """
CREATE TABLE IF NOT EXISTS entities (
    kind TEXT NOT NULL,            -- group / person / auditorium
    id   TEXT NOT NULL,
    label TEXT,
    description TEXT,
    raw  TEXT,
    PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS fetched (
    kind TEXT, id TEXT, start TEXT, finish TEXT, n_lessons INTEGER, fetched_at TEXT,
    PRIMARY KEY (kind, id, start, finish)
);
CREATE TABLE IF NOT EXISTS lessons (
    lesson_key TEXT PRIMARY KEY,   -- lessonOid, иначе хэш ключевых полей
    {cols},
    raw TEXT
);
CREATE TABLE IF NOT EXISTS lesson_sources (
    lesson_key TEXT, kind TEXT, id TEXT,
    PRIMARY KEY (lesson_key, kind, id)
);
CREATE INDEX IF NOT EXISTS ix_lessons_date ON lessons(date);
CREATE INDEX IF NOT EXISTS ix_lessons_group ON lessons("group");
CREATE INDEX IF NOT EXISTS ix_lessons_lecturer ON lessons(lecturer);
""".replace("{cols}", ",\n    ".join(f'"{c}" TEXT' for c in LESSON_FIELDS))


def open_db(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    return con


def lesson_key(les: dict) -> str:
    if les.get("lessonOid") not in (None, ""):
        # Одно занятие потока приходит отдельно для каждой группы: группу добавляем в ключ
        return f'{les["lessonOid"]}|{les.get("groupOid") or les.get("group") or ""}|{les.get("subGroupOid") or ""}'
    basis = "|".join(str(les.get(k, "")) for k in
                     ("date", "beginLesson", "discipline", "kindOfWork", "lecturer", "group", "subGroup", "auditorium"))
    return "h:" + hashlib.sha1(basis.encode()).hexdigest()


def save_lessons(con: sqlite3.Connection, kind: str, eid: str, lessons: list[dict]) -> int:
    cols = ", ".join(f'"{c}"' for c in LESSON_FIELDS)
    ph = ", ".join("?" for _ in LESSON_FIELDS)
    new = 0
    for les in lessons:
        k = lesson_key(les)
        vals = [None if les.get(c) is None else str(les.get(c)) for c in LESSON_FIELDS]
        cur = con.execute(
            f'INSERT OR IGNORE INTO lessons (lesson_key, {cols}, raw) VALUES (?, {ph}, ?)',
            [k, *vals, json.dumps(les, ensure_ascii=False)],
        )
        new += cur.rowcount
        con.execute("INSERT OR IGNORE INTO lesson_sources VALUES (?, ?, ?)", (k, kind, eid))
    return new


# ---------------------------------------------------------------- команды

def date_chunks(start: dt.date, finish: dt.date, days: int):
    cur = start
    while cur <= finish:
        end = min(cur + dt.timedelta(days=days - 1), finish)
        yield cur, end
        cur = end + dt.timedelta(days=1)


def fmt(d: dt.date) -> str:
    return d.strftime("%Y.%m.%d")


def cmd_probe(cl: Client, args):
    print(f"Проверяю {cl.base} ...")
    for kind, term in (("group", "1"), ("person", "а"), ("auditorium", "1")):
        res = cl.get_json("/api/search", {"term": term, "type": kind}, use_cache=False)
        n = len(res) if isinstance(res, list) else "?"
        print(f"  /api/search type={kind} term={term!r}: {n} результатов")
        if res:
            print("    пример:", json.dumps(res[0], ensure_ascii=False)[:300])
            if kind == "group":
                gid = res[0].get("id")
                today = dt.date.today()
                sch = cl.get_json(f"/api/schedule/group/{gid}",
                                  {"start": fmt(today), "finish": fmt(today + dt.timedelta(days=6)), "lng": 1},
                                  use_cache=False)
                print(f"  /api/schedule/group/{gid} (неделя): {len(sch or [])} занятий")
                if sch:
                    print("    поля занятия:", ", ".join(sorted(sch[0].keys())))
                    print("    пример:", json.dumps(sch[0], ensure_ascii=False)[:500])
    print(f"Запросов сделано: {cl.n_requests}")


def cmd_discover(cl: Client, con: sqlite3.Connection, args):
    for kind in args.kinds:
        before = con.execute("SELECT COUNT(*) FROM entities WHERE kind=?", (kind,)).fetchone()[0]
        for term in SEARCH_TERMS:
            res = cl.get_json("/api/search", {"term": term, "type": kind}) or []
            for e in res:
                eid = str(e.get("id"))
                con.execute("INSERT OR REPLACE INTO entities VALUES (?, ?, ?, ?, ?)",
                            (kind, eid, e.get("label"), e.get("description"), json.dumps(e, ensure_ascii=False)))
            con.commit()
        after = con.execute("SELECT COUNT(*) FROM entities WHERE kind=?", (kind,)).fetchone()[0]
        print(f"{kind}: найдено {after} (новых {after - before})")
    print(f"Запросов к серверу: {cl.n_requests}")


def cmd_fetch(cl: Client, con: sqlite3.Connection, args):
    start = dt.date.fromisoformat(args.start)
    finish = dt.date.fromisoformat(args.finish)
    for kind in args.kinds:
        ents = con.execute("SELECT id, label FROM entities WHERE kind=? ORDER BY label", (kind,)).fetchall()
        if not ents:
            print(f"{kind}: список пуст, сначала запустите discover")
            continue
        print(f"{kind}: {len(ents)} объектов, {start}..{finish}")
        for i, (eid, label) in enumerate(ents, 1):
            for a, b in date_chunks(start, finish, args.chunk_days):
                done = con.execute("SELECT 1 FROM fetched WHERE kind=? AND id=? AND start=? AND finish=?",
                                   (kind, eid, a.isoformat(), b.isoformat())).fetchone()
                if done:
                    continue
                data = cl.get_json(f"/api/schedule/{kind}/{eid}", {"start": fmt(a), "finish": fmt(b), "lng": 1}) or []
                new = save_lessons(con, kind, eid, data)
                con.execute("INSERT OR REPLACE INTO fetched VALUES (?, ?, ?, ?, ?, ?)",
                            (kind, eid, a.isoformat(), b.isoformat(), len(data), dt.datetime.now().isoformat()))
                con.commit()
                print(f"  [{i}/{len(ents)}] {label} {a}..{b}: {len(data)} занятий, новых {new}")
    total = con.execute("SELECT COUNT(*) FROM lessons").fetchone()[0]
    print(f"Всего уникальных записей в базе: {total}. Запросов к серверу: {cl.n_requests}")


def cmd_export(con: sqlite3.Connection, args):
    out = Path(args.csv)
    rows = con.execute(f'SELECT lesson_key, {", ".join(chr(34) + c + chr(34) for c in LESSON_FIELDS)} '
                       'FROM lessons ORDER BY date, beginLesson, "group"')
    with out.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: Excel откроет кириллицу
        w = csv.writer(f, delimiter=";")
        w.writerow(["lesson_key", *LESSON_FIELDS])
        n = 0
        for r in rows:
            w.writerow(r)
            n += 1
    ent_out = out.with_name(out.stem + "_entities.csv")
    with ent_out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["kind", "id", "label", "description"])
        w.writerows(con.execute("SELECT kind, id, label, description FROM entities ORDER BY kind, label"))
    print(f"CSV: {out} ({n} строк), {ent_out}")


def main(argv=None):
    p = argparse.ArgumentParser(description="Выгрузка расписания МГИМО (ruz.mgimo.ru) в SQLite/CSV")
    p.add_argument("command", choices=["probe", "discover", "fetch", "export", "all"])
    p.add_argument("--base", default=BASE)
    p.add_argument("--db", default="mgimo_schedule.sqlite")
    p.add_argument("--csv", default="mgimo_schedule.csv")
    p.add_argument("--cache", default="ruz_cache", help="папка кэша сырых JSON-ответов")
    p.add_argument("--kinds", nargs="+", default=["group"], choices=KINDS,
                   help="что обходить: group (по умолчанию), person, auditorium")
    p.add_argument("--start", default="2026-09-01")
    p.add_argument("--finish", default="2026-12-31")
    p.add_argument("--chunk-days", type=int, default=31, help="размер интервала дат в одном запросе")
    p.add_argument("--delay", type=float, default=1.5, help="пауза между запросами, с (не ставьте меньше 1)")
    p.add_argument("--timeout", type=float, default=30)
    p.add_argument("--retries", type=int, default=3)
    args = p.parse_args(argv)

    cl = Client(args.base, Path(args.cache), max(args.delay, 0.5), args.timeout, args.retries)
    try:
        if args.command == "probe":
            return cmd_probe(cl, args)
        con = open_db(Path(args.db))
        if args.command in ("discover", "all"):
            cmd_discover(cl, con, args)
        if args.command in ("fetch", "all"):
            cmd_fetch(cl, con, args)
        if args.command in ("export", "all"):
            cmd_export(con, args)
    except AntiBotError as e:
        print("СТОП:", e, file=sys.stderr)
        return 2
    except ConnectionError as e:
        print("Нет связи с сервером:", e, file=sys.stderr)
        print("Если включён VPN, попробуйте без него: ruz.mgimo.ru может быть доступен "
              "только из российских сетей или из сети вуза.", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
