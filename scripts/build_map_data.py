#!/usr/bin/env python3
"""Собирает campus-data.json для интерактивной карты.

Если генератор расписания уже создал data/mgimo_schedule.sqlite, берём аудитории оттуда
(номера, тип, вместимость, назначение служебных помещений). Иначе синтезируем фонд
по тем же правилам нумерации:
  * Главный корпус: ЭКNN — этаж 1–4, крыло 0/1, аудитория 01–79;
  * Второй корпус: ЭNN — этаж 1–5, аудитория 01–45;
  * Обсерватория-N и Манеж-N — отдельные здания.
Раскладка на плане: нечётные номера — северная сторона коридора, чётные — южная,
номер растёт от лестничного узла к торцу крыла.
"""
import json
import sys
import random
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent / "public" / "campus-map"
DB = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data" / "mgimo_schedule.sqlite"

BUILDINGS = [
    {"id": "main", "name": "Главный корпус", "abbr": "ГК", "address": "Замковая ул., 1", "floors": [1, 2, 3, 4],
     "wings": [0, 1], "maxRoom": 79, "scheme": "ЭКNN: этаж · крыло (0 — западное, 1 — восточное) · номер 01–79"},
    {"id": "second", "name": "Второй корпус", "abbr": "К2", "address": "Замковая ул., 3", "floors": [1, 2, 3, 4, 5],
     "wings": [None], "maxRoom": 45, "scheme": "ЭNN: этаж · номер 01–45"},
    {"id": "obs", "name": "Обсерватория", "abbr": "Обс", "address": "Замковая ул., 1, стр. 5", "floors": [1],
     "wings": [None], "maxRoom": 2, "scheme": "Обсерватория-N"},
    {"id": "manege", "name": "Манеж", "abbr": "Ман", "address": "Замковая ул., 7", "floors": [1],
     "wings": [None], "maxRoom": 3, "scheme": "Манеж-N"},
]
BNAME = {b["name"]: b["id"] for b in BUILDINGS}


def from_db():
    con = sqlite3.connect(DB)
    rows = con.execute("""SELECT a.auditorium_oid, a.number, b.name, t.name, a.capacity, a.floor, a.wing,
                                 a.purpose, a.is_bookable
                          FROM auditoriums a JOIN buildings b USING (building_oid)
                          JOIN auditorium_types t USING (type_oid)""").fetchall()
    con.close()
    return [dict(id=r[0], number=r[1], building=BNAME[r[2]], type=r[3], capacity=r[4], floor=r[5] or 1,
                 wing=r[6], purpose=r[7], bookable=bool(r[8])) for r in rows]


def synth():
    rng = random.Random(2026)
    rooms, oid = [], 0
    admin = {("main", 2, 0): ["Ректорат", "Приёмная ректора", "Проректор по учебной работе"],
             ("main", 2, 1): ["Управление учебно-организационной работы"],
             ("main", 3, 1): ["Бухгалтерия", "Отдел кадров"], ("main", 1, 0): ["Медпункт"],
             ("main", 3, 0): ["Деканат факультета Гриффиндор", "Кафедра специализации факультета Гриффиндор"],
             ("main", 1, 1): ["Деканат факультета Слизерин", "Кафедра специализации факультета Слизерин",
                              "Кафедра зельеварения"],
             ("second", 5, None): ["Деканат факультета Когтевран", "Кафедра специализации факультета Когтевран"],
             ("second", 1, None): ["Деканат факультета Пуффендуй", "Кафедра специализации факультета Пуффендуй",
                                   "Студенческий офис"],
             ("second", 2, None): ["Библиотека", "Читальный зал"],
             ("second", 3, None): ["Кафедра английского языка", "Кафедра немецкого языка", "Кафедра французского языка"],
             ("second", 4, None): ["Кафедра испанского языка", "Кафедра турецкого языка", "Кафедра арабского языка",
                                   "Кафедра языка хинди"],
             ("main", 4, 0): ["Кафедра китайского языка", "Кафедра корейского языка"],
             ("main", 4, 1): ["Кафедра японского языка", "Кафедра трансфигурации", "Кафедра заклинаний"]}
    admin[("main", 3, 0)] = ["Деканат факультета Гриффиндор", "Кафедра специализации факультета Гриффиндор",
                             "Кафедра истории магии", "Кафедра древней литературы"]
    admin[("main", 2, 1)] += ["Кафедра нумерологии", "Кафедра астрономии"]
    admin[("main", 1, 0)] += ["Кафедра ботаники", "Кафедра зоологии", "Кафедра верховой езды"]
    for b, floors, wings, mx, cnt in [("main", range(1, 5), (0, 1), 79, 24), ("second", range(1, 6), (None,), 45, 16)]:
        for f in floors:
            for w in wings:
                nums = sorted(rng.sample(range(1, mx + 1), cnt))
                purposes = list(admin.get((b, f, w), []))
                for n in nums:
                    oid += 1
                    num = f"{f}{w}{n:02d}" if b == "main" else f"{f}{n:02d}"
                    if purposes and rng.random() < 0.35:
                        rooms.append(dict(id=oid, number=num, building=b, type="Административное помещение",
                                          capacity=10, floor=f, wing=w, purpose=purposes.pop(0), bookable=False))
                        continue
                    if b == "main" and f == 1 and w == 0 and n < 40:
                        t, c = "Лекционная", rng.choice([80, 100, 120, 150])
                    elif b == "main" and w == 1 and f <= 2 and n < 30:
                        t, c = "Лаборатория", rng.choice([24, 28, 30])
                    elif f >= 3 and (b == "second" or rng.random() < .5):
                        t, c = "Лингафонный кабинет", rng.choice([10, 12, 14, 16])
                    else:
                        t, c = "Семинарская", rng.choice([24, 28, 30, 35])
                    rooms.append(dict(id=oid, number=num, building=b, type=t, capacity=c, floor=f, wing=w,
                                      purpose=None, bookable=True))
    for i in (1, 2):
        oid += 1
        rooms.append(dict(id=oid, number=f"Обсерватория-{i}", building="obs", type="Обсерватория", capacity=30,
                          floor=1, wing=None, purpose=None, bookable=True))
    for i in (1, 2, 3):
        oid += 1
        rooms.append(dict(id=oid, number=f"Манеж-{i}", building="manege", type="Манеж", capacity=30,
                          floor=1, wing=None, purpose=None, bookable=True))
    return rooms


def main():
    rooms = from_db() if DB.exists() else synth()
    src = "data/mgimo_schedule.sqlite" if DB.exists() else "синтез по правилам нумерации"
    data = {"source": src, "buildings": BUILDINGS, "rooms": rooms}
    js = json.dumps(data, ensure_ascii=False, indent=1)
    (HERE / "campus-data.json").write_text(js, encoding="utf-8")
    (HERE / "campus-data.js").write_text("window.CAMPUS_DATA = " + js + ";\n", encoding="utf-8")
    print(f"{len(rooms)} помещений, источник: {src}")


if __name__ == "__main__":
    main()
