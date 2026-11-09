#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор синтетического расписания для учебного прототипа личного кабинета
студента «Хогвартса».

Основа — спецификация mgimo_schedule_schema.md (модель РУЗ, формат mgimo_ruz.py),
поверх неё — решения, согласованные с заказчиком (см. README.md рядом):
  * 4 факультета (ГР, СЛ, КГ, ПФ) × 4 курса × 3 академические группы;
  * 10 общих предметов + «<Факультет>: специализация» с 3 курса + 10 языков;
  * академическая группа 1-ГР-1, языковая группа 1-ГР-1 (5) — подгруппа одной
    академической, номер языковой группы сквозной внутри курса факультета;
  * Пн–Пт, сетка A у ГР и СЛ, сетка B у КГ и ПФ;
  * зачётная неделя 21–31.12.2026, экзамены 11–31.01.2027.

Запуск из корня репозитория (только стандартная библиотека, Python 3.9+):
    python tools/schedule-generator/generate_hogwarts_schedule.py
        → data/university/schedule.csv и students.csv (заменяемые файлы кабинета)
        → tools/schedule-generator/out/ (SQLite, JSON, справочники — рабочие файлы, не в git)
    python tools/schedule-generator/generate_hogwarts_schedule.py --seed 7 --data /tmp/test --out /tmp/test/out
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import random
import sqlite3
import uuid
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent              # tools/schedule-generator
REPO = ROOT.parent.parent                           # корень репозитория
DATA = REPO / "data" / "university"                 # заменяемые файлы кабинета

# ------------------------------------------------------------------ календарь
SEM_START = dt.date(2026, 9, 1)
SEM_END = dt.date(2026, 12, 31)
WEEK1_MONDAY = dt.date(2026, 8, 31)
HOLIDAYS = {dt.date(2026, 11, 4)}
CREDIT_WEEK_START = dt.date(2026, 12, 21)
SESSION_START = dt.date(2027, 1, 11)
SESSION_END = dt.date(2027, 1, 31)
NOW = dt.datetime(2026, 11, 8, 12, 0)          # «сегодня» для updated_at
DOW_STR = {1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Вс"}
TEACHING_DAYS = (1, 2, 3, 4, 5)

GRIDS = {
    "A": {1: ("09:00", "10:20"), 2: ("10:35", "11:55"), 3: ("12:55", "14:15"), 4: ("14:30", "15:50"),
          5: ("16:00", "17:20"), 6: ("17:30", "18:50"), 7: ("19:00", "20:20"), 8: ("20:30", "21:50")},
    "B": {1: ("09:00", "10:20"), 2: ("10:35", "11:55"), 3: ("12:10", "13:30"), 4: ("14:30", "15:50"),
          5: ("16:00", "17:20"), 6: ("17:30", "18:50"), 7: ("19:00", "20:20"), 8: ("20:30", "21:50")},
}
PARS = {"every": ("odd", "even"), "odd": ("odd",), "even": ("even",)}
LOAD_CAP = 16          # пар в неделю на преподавателя (схема: до 18)
MAX_PER_DAY = 5
# Вымышленный домен: поддомены example.org зарезервированы IANA и не существуют в реальности.
DOMAIN = "hogwarts.example.org"  # почта (студенты: имя.фамилия + 2 цифры года поступления) и ссылки на онлайн-занятия


def mins(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def week_number(d: dt.date) -> int:
    return (d - WEEK1_MONDAY).days // 7 + 1


def week_parity(d: dt.date) -> str:
    return "Н" if week_number(d) % 2 == 1 else "Ч"


def daterange(a: dt.date, b: dt.date):
    d = a
    while d <= b:
        yield d
        d += dt.timedelta(days=1)


def write_text_lf(path: Path, text: str) -> None:
    """Текст с переводами строк LF на любой ОС (CSV пишется отдельно, с CRLF по RFC 4180)."""
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def overlaps(s1, e1, s2, e2) -> bool:
    return s1 < e2 and s2 < e1


# ------------------------------------------------------------------ справочники
FACULTIES = [  # abbr, название, сетка
    ("ГР", "Гриффиндор", "A"),
    ("СЛ", "Слизерин", "A"),
    ("КГ", "Когтевран", "B"),
    ("ПФ", "Пуффендуй", "B"),
]

LANGS = {  # код: (название, дисциплина, кафедра, европейский)
    "en": ("английский", "Английский язык", "Кафедра английского языка", True),
    "de": ("немецкий", "Немецкий язык", "Кафедра немецкого языка", True),
    "fr": ("французский", "Французский язык", "Кафедра французского языка", True),
    "es": ("испанский", "Испанский язык", "Кафедра испанского языка", True),
    "tr": ("турецкий", "Турецкий язык", "Кафедра турецкого языка", False),
    "ar": ("арабский", "Арабский язык", "Кафедра арабского языка", False),
    "hi": ("хинди", "Язык хинди", "Кафедра языка хинди", False),
    "zh": ("китайский", "Китайский язык", "Кафедра китайского языка", False),
    "ko": ("корейский", "Корейский язык", "Кафедра корейского языка", False),
    "ja": ("японский", "Японский язык", "Кафедра японского языка", False),
}
EURO_SECOND = ["de", "fr", "es"]                 # вторые языки после английского
ORIENTAL = ["tr", "ar", "hi", "zh", "ko", "ja"]  # только первым языком, английский — вторым
LANG_L1_PAIRS, LANG_L2_PAIRS = 4, 2

SUBJECTS = {  # код: (дисциплина, кафедра, учёные степени к./д.)
    "transf": ("Трансфигурация", "Кафедра трансфигурации", ("к.ф.-м.н.", "д.ф.-м.н.")),
    "charms": ("Заклинания", "Кафедра заклинаний", ("к.филол.н.", "д.филол.н.")),
    "potions": ("Зельеварение", "Кафедра зельеварения", ("к.х.н.", "д.х.н.")),
    "botany": ("Ботаника", "Кафедра ботаники", ("к.б.н.", "д.б.н.")),
    "astro": ("Астрономия", "Кафедра астрономии", ("к.ф.-м.н.", "д.ф.-м.н.")),
    "history": ("История магии", "Кафедра истории магии", ("к.и.н.", "д.и.н.")),
    "zoo": ("Зоология", "Кафедра зоологии", ("к.б.н.", "д.б.н.")),
    "lit": ("Древняя литература", "Кафедра древней литературы", ("к.филол.н.", "д.филол.н.")),
    "num": ("Нумерология", "Кафедра нумерологии", ("к.ф.-м.н.", "д.ф.-м.н.")),
    "riding": ("Верховая езда", "Кафедра верховой езды", ("к.пед.н.", "д.пед.н.")),
}

# Учебный план: (предмет, вид, чётность). lec — поток, sem/prac — академическая группа.
CURRICULUM = {
    1: dict(
        assess={"transf": "экзамен", "charms": "экзамен", "potions": "экзамен", "botany": "зачёт с оценкой",
                "astro": "зачёт", "history": "зачёт", "riding": "зачёт"},
        items=[("transf", "lec", "every"), ("charms", "lec", "every"), ("potions", "lec", "odd"),
               ("botany", "lec", "even"), ("astro", "lec", "odd"), ("history", "lec", "even"),
               ("transf", "sem", "every"), ("charms", "sem", "every"), ("potions", "prac", "every"),
               ("botany", "prac", "odd"), ("astro", "prac", "even"), ("history", "sem", "odd"),
               ("riding", "prac", "every")]),
    2: dict(
        assess={"transf": "экзамен", "potions": "экзамен", "zoo": "экзамен", "charms": "зачёт с оценкой",
                "botany": "зачёт", "history": "зачёт с оценкой", "riding": "зачёт"},
        items=[("transf", "lec", "every"), ("zoo", "lec", "every"), ("charms", "lec", "odd"),
               ("potions", "lec", "even"), ("botany", "lec", "odd"), ("history", "lec", "even"),
               ("transf", "sem", "every"), ("charms", "sem", "every"), ("potions", "prac", "every"),
               ("zoo", "sem", "odd"), ("botany", "prac", "even"), ("history", "sem", "odd"),
               ("riding", "prac", "every")]),
    3: dict(
        assess={"transf": "экзамен", "spec": "экзамен", "lit": "экзамен", "potions": "зачёт с оценкой",
                "zoo": "зачёт", "num": "зачёт"},
        items=[("transf", "lec", "every"), ("lit", "lec", "every"), ("spec", "lec", "every"),
               ("potions", "lec", "odd"), ("zoo", "lec", "even"), ("num", "lec", "odd"),
               ("transf", "sem", "every"), ("potions", "prac", "every"), ("zoo", "sem", "odd"),
               ("lit", "sem", "even"), ("num", "sem", "every"), ("spec", "sem", "every")]),
    4: dict(
        assess={"spec": "экзамен", "num": "экзамен", "charms": "зачёт с оценкой", "astro": "зачёт",
                "lit": "зачёт", "history": "зачёт"},
        items=[("charms", "lec", "every"), ("num", "lec", "every"), ("spec", "lec", "every"),
               ("astro", "lec", "odd"), ("lit", "lec", "even"), ("history", "lec", "odd"),
               ("charms", "sem", "every"), ("num", "sem", "every"), ("spec", "sem", "every"),
               ("spec", "sem", "every"), ("lit", "sem", "even"), ("astro", "prac", "odd"),
               ("history", "sem", "odd")]),
}
KIND_NAMES = {"lec": "Лекция", "sem": "Семинар", "prac": "Практическое занятие", "lang": "Практическое занятие"}


def room_kind_for(subj: str, kind: str) -> str:
    if kind == "lec":
        return "Лекционная"
    if kind == "prac":
        return {"potions": "Лаборатория", "botany": "Лаборатория", "astro": "Обсерватория",
                "riding": "Манеж"}[subj]
    return "Семинарская"


def allowed_slots(room_kind: str):
    if room_kind == "Обсерватория":
        return {4, 5, 6}       # наблюдения — во второй половине дня
    return {1, 2, 3, 4, 5}


# ------------------------------------------------------------------ имена
MALE_NAMES = ["Александр", "Алексей", "Андрей", "Антон", "Арсений", "Артём", "Борис", "Вадим", "Валентин",
              "Василий", "Виктор", "Владимир", "Глеб", "Григорий", "Даниил", "Денис", "Дмитрий", "Евгений",
              "Егор", "Иван", "Игорь", "Илья", "Кирилл", "Константин", "Лев", "Максим", "Марк", "Матвей",
              "Михаил", "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман", "Семён", "Сергей",
              "Станислав", "Степан", "Тимофей", "Фёдор", "Юрий", "Ярослав"]
FEMALE_NAMES = ["Алина", "Алиса", "Анастасия", "Анна", "Валерия", "Варвара", "Вера", "Вероника", "Виктория",
                "Галина", "Дарья", "Ева", "Екатерина", "Елена", "Елизавета", "Злата", "Ирина", "Кира",
                "Ксения", "Лариса", "Любовь", "Людмила", "Маргарита", "Марина", "Мария", "Милана", "Надежда",
                "Наталья", "Ольга", "Полина", "Светлана", "София", "Таисия", "Татьяна", "Ульяна", "Юлия", "Яна"]
PATRONYMICS = {  # имя отца: (мужское, женское)
    "Александр": ("Александрович", "Александровна"), "Алексей": ("Алексеевич", "Алексеевна"),
    "Андрей": ("Андреевич", "Андреевна"), "Анатолий": ("Анатольевич", "Анатольевна"),
    "Аркадий": ("Аркадьевич", "Аркадьевна"), "Борис": ("Борисович", "Борисовна"),
    "Вадим": ("Вадимович", "Вадимовна"), "Валерий": ("Валерьевич", "Валерьевна"),
    "Василий": ("Васильевич", "Васильевна"), "Виктор": ("Викторович", "Викторовна"),
    "Владимир": ("Владимирович", "Владимировна"), "Вячеслав": ("Вячеславович", "Вячеславовна"),
    "Геннадий": ("Геннадьевич", "Геннадьевна"), "Григорий": ("Григорьевич", "Григорьевна"),
    "Дмитрий": ("Дмитриевич", "Дмитриевна"), "Евгений": ("Евгеньевич", "Евгеньевна"),
    "Иван": ("Иванович", "Ивановна"), "Игорь": ("Игоревич", "Игоревна"), "Илья": ("Ильич", "Ильинична"),
    "Константин": ("Константинович", "Константиновна"), "Леонид": ("Леонидович", "Леонидовна"),
    "Максим": ("Максимович", "Максимовна"), "Михаил": ("Михайлович", "Михайловна"),
    "Николай": ("Николаевич", "Николаевна"), "Олег": ("Олегович", "Олеговна"),
    "Павел": ("Павлович", "Павловна"), "Пётр": ("Петрович", "Петровна"), "Роман": ("Романович", "Романовна"),
    "Сергей": ("Сергеевич", "Сергеевна"), "Станислав": ("Станиславович", "Станиславовна"),
    "Степан": ("Степанович", "Степановна"), "Фёдор": ("Фёдорович", "Фёдоровна"),
    "Юрий": ("Юрьевич", "Юрьевна"), "Ярослав": ("Ярославович", "Ярославовна"),
}
SURNAMES = """Абрамов Агеев Акимов Алексеев Андреев Анисимов Антонов Арсеньев Афанасьев Баранов Белов Белоусов
Беляев Богданов Болдырев Борисов Быков Васильев Веселов Виноградов Власов Волков Воронин Воронцов Гаврилов
Герасимов Голубев Гончаров Горбунов Горелов Григорьев Гусев Давыдов Данилов Дементьев Денисов Дмитриев
Доронин Дорофеев Евдокимов Егоров Ершов Ефимов Жданов Жуков Журавлёв Забелин Зайцев Захаров Зимин Зиновьев
Зуев Иванов Игнатьев Ильин Исаев Казаков Калинин Карпов Кириллов Киселёв Климов Ковалёв Козлов Колесников
Комаров Кондратьев Коновалов Копылов Корнилов Королёв Котов Крылов Кудрявцев Кузнецов Кулагин Куликов Лазарев
Лапин Лебедев Левин Литвинов Лобанов Логинов Лукин Львов Макаров Максимов Малышев Маслов Матвеев Медведев
Мельников Миронов Михайлов Моисеев Морозов Муравьёв Назаров Никитин Никифоров Новиков Носов Овчинников Орлов
Осипов Павлов Панов Петров Платонов Покровский Поляков Пономарёв Попов Прохоров Раевский Родионов Романов
Рябов Савельев Савин Сазонов Самойлов Сафонов Селезнёв Семёнов Сергеев Симонов Смирнов Соболев Соколов
Соловьёв Сорокин Степанов Субботин Суворов Тарасов Тимофеев Титов Тихонов Третьяков Трофимов Уваров Устинов
Фадеев Федотов Филатов Фомин Фролов Харитонов Чернов Шаповалов Шаров Шестаков Широков Шубин Щербаков Юдин
Яковлев Яшин Белозерский Вишневский Островский Ковальчук Черных Седых Мартынюк Задорожный""".split()

TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r",
                     "s", "t", "u", "f", "kh", "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya"]))


def translit(s: str) -> str:
    return "".join(TRANSLIT.get(c, c) for c in s.lower())


def female_surname(s: str) -> str:
    if s.endswith(("ский", "цкий")):
        return s[:-2] + "ая"
    if s.endswith("ный"):
        return s[:-2] + "ая"
    if s.endswith(("ов", "ев", "ёв", "ин", "ын")):
        return s + "а"
    return s


def split_chunks(n: int, lo: int = 5, hi: int = 9) -> list[int]:
    """Разбить n человек на группы размером lo..hi, как можно ровнее."""
    if n < lo:
        raise ValueError(n)
    k = math.ceil(n / hi)
    base, extra = divmod(n, k)
    sizes = [base + 1] * extra + [base] * (k - extra)
    assert all(lo <= x <= hi for x in sizes), (n, sizes)
    return sizes


class PlacementError(RuntimeError):
    pass


# ================================================================== генератор
class Generator:
    def __init__(self, seed: int):
        self.seed = seed
        self.rng = random.Random(seed)
        self._ids = {}
        self.used_fio = set()
        self.used_emails = set()

    def nid(self, table: str, start: int = 1) -> int:
        self._ids[table] = self._ids.get(table, start - 1) + 1
        return self._ids[table]

    def uuid4(self) -> str:
        return str(uuid.UUID(int=self.rng.getrandbits(128), version=4))

    # -------------------------------------------------------------- люди
    def make_person(self):
        rng = self.rng
        while True:
            male = rng.random() < 0.5
            last = rng.choice(SURNAMES)
            father = rng.choice(list(PATRONYMICS))
            if male:
                first = rng.choice(MALE_NAMES)
                middle = PATRONYMICS[father][0]
            else:
                first = rng.choice(FEMALE_NAMES)
                middle = PATRONYMICS[father][1]
                last = female_surname(last)
            fio = f"{last} {first} {middle}"
            if fio not in self.used_fio:
                self.used_fio.add(fio)
                return last, first, middle, fio, f"{last} {first[0]}.{middle[0]}."

    def email(self, *variants: str) -> str:
        """Первый свободный вариант адреса; если все заняты — последний вариант с номером."""
        for cand in variants:
            if cand not in self.used_emails:
                break
        else:
            i = 1
            while cand in self.used_emails:
                i += 1
                cand = f"{variants[-1]}{i}"
        self.used_emails.add(cand)
        return f"{cand}@{DOMAIN}"

    # -------------------------------------------------------------- справочники
    def build_reference(self):
        rng = self.rng
        self.faculties = []
        for abbr, short, grid in FACULTIES:
            self.faculties.append(dict(oid=self.nid("faculty"), gid=self.uuid4(), abbr=abbr, short=short,
                                       name=f"Факультет {short}", grid=grid))
        self.fac_by_abbr = {f["abbr"]: f for f in self.faculties}

        # кафедры
        self.chairs = []

        def add_chair(name, faculty_oid=None, is_language=False, degrees=("к.филол.н.", "д.филол.н.")):
            c = dict(oid=self.nid("chair"), name=name, faculty_oid=faculty_oid, is_language=is_language,
                     degrees=degrees)
            self.chairs.append(c)
            return c

        self.subject_chair = {k: add_chair(v[1], degrees=v[2]) for k, v in SUBJECTS.items()}
        self.spec_chair = {f["abbr"]: add_chair(f"Кафедра специализации факультета {f['short']}", f["oid"],
                                                degrees=("к.пед.н.", "д.пед.н."))
                           for f in self.faculties}
        self.lang_chair = {k: add_chair(v[2], is_language=True) for k, v in LANGS.items()}
        self.chair_by_oid = {c["oid"]: c for c in self.chairs}

        # дисциплины
        self.disciplines = []
        self.disc = {}

        def add_disc(key, name, chair, is_language, hours, assessment):
            d = dict(oid=self.nid("discipline", 501), key=key, name=name, chair_oid=chair["oid"],
                     is_language=is_language, hours=hours, assessment=assessment)
            self.disciplines.append(d)
            self.disc[key] = d
            return d

        weight = {"every": 1.0, "odd": 0.5, "even": 0.5}
        for key, (name, _, _) in SUBJECTS.items():
            course = min(c for c, cur in CURRICULUM.items() if key in cur["assess"])
            hours = sum(weight[p] for s, _, p in CURRICULUM[course]["items"] if s == key)
            add_disc(key, name, self.subject_chair[key], False, hours, CURRICULUM[course]["assess"][key])
        for f in self.faculties:
            hours = sum(weight[p] for s, _, p in CURRICULUM[3]["items"] if s == "spec")
            add_disc(("spec", f["abbr"]), f"{f['short']}: специализация", self.spec_chair[f["abbr"]], False,
                     hours, "экзамен")
        for code, (lname, dname, _, _) in LANGS.items():
            add_disc(("lang", code), dname, self.lang_chair[code], True, LANG_L1_PAIRS, "экзамен")
        self.disc_by_oid = {d["oid"]: d for d in self.disciplines}

        # виды занятий
        self.kinds = {}
        for name, abbr, is_ass, level in [("Лекция", "лек.", 0, "stream"), ("Семинар", "сем.", 0, "group"),
                                          ("Практическое занятие", "пр.", 0, "group"),
                                          ("Консультация", "конс.", 0, "group"), ("Экзамен", "экз.", 1, "group"),
                                          ("Зачёт", "зач.", 1, "group"), ("Факультатив", "факульт.", 0, "group")]:
            self.kinds[name] = dict(oid=self.nid("kind"), name=name, abbr=abbr, is_assessment=is_ass,
                                    audience_level=level)

        # программы
        self.programs = {}
        for i, f in enumerate(self.faculties, 1):
            self.programs[f["oid"]] = dict(oid=self.nid("program"), code=f"99.03.0{i}",
                                           name=f"Магические науки и практики, профиль «{f['short']}»",
                                           level="бакалавриат", form="очная", faculty_oid=f["oid"])
        self.build_rooms()

    # -------------------------------------------------------------- корпуса и аудитории
    def build_rooms(self):
        rng = self.rng
        self.buildings = {}
        for key, name, abbr, addr in [("main", "Главный корпус", "ГК", "Замковая ул., 1"),
                                      ("second", "Второй корпус", "К2", "Замковая ул., 3"),
                                      ("obs", "Обсерватория", "Обс", "Замковая ул., 1, стр. 5"),
                                      ("manege", "Манеж", "Ман", "Замковая ул., 7")]:
            self.buildings[key] = dict(oid=self.nid("building"), name=name, abbr=abbr, address=addr)
        self.types = {}
        for name, abbr in [("Лекционная", "лек"), ("Семинарская", "сем"), ("Лингафонный кабинет", "линг"),
                           ("Компьютерный класс", "комп"), ("Спортзал", "спорт"), ("Онлайн", "онлайн"),
                           ("Лаборатория", "лаб"), ("Обсерватория", "обс"), ("Манеж", "ман"),
                           ("Административное помещение", "адм")]:
            self.types[name] = dict(oid=self.nid("aud_type"), name=name, abbr=abbr)

        # номерной фонд: главный корпус — ЭКNN (этаж 1–4, крыло 0/1, 01–79), второй — ЭNN (этаж 1–5, 01–45)
        free = {}
        for floor in range(1, 5):
            for wing in (0, 1):
                free[("main", floor, wing)] = sorted(rng.sample(range(1, 80), 24))
        for floor in range(1, 6):
            free[("second", floor, None)] = sorted(rng.sample(range(1, 46), 16))

        self.rooms = []

        def number(b, floor, wing, n):
            return f"{floor}{wing}{n:02d}" if b == "main" else f"{floor}{n:02d}"

        def take(loc):
            nums = free[loc]
            n = nums.pop(rng.randrange(len(nums)))
            return n

        def add_room(loc, type_name, capacity, purpose=None):
            b, floor, wing = loc
            n = take(loc)
            r = dict(oid=self.nid("room"), number=number(b, floor, wing, n), building=b, type=type_name,
                     capacity=capacity, floor=floor, wing=wing, purpose=purpose,
                     bookable=type_name != "Административное помещение")
            self.rooms.append(r)
            return r

        # административные помещения в разных частях вуза
        admin = [("Ректорат", ("main", 2, 0)), ("Приёмная ректора", ("main", 2, 0)),
                 ("Проректор по учебной работе", ("main", 2, 0)),
                 ("Управление учебно-организационной работы", ("main", 2, 1)),
                 ("Бухгалтерия", ("main", 3, 1)), ("Отдел кадров", ("main", 3, 1)),
                 ("Медпункт", ("main", 1, 0)), ("Студенческий офис", ("second", 1, None)),
                 ("Библиотека", ("second", 2, None)), ("Читальный зал", ("second", 2, None)),
                 ("Деканат факультета Гриффиндор", ("main", 3, 0)),
                 ("Деканат факультета Слизерин", ("main", 1, 1)),
                 ("Деканат факультета Когтевран", ("second", 5, None)),
                 ("Деканат факультета Пуффендуй", ("second", 1, None))]
        dean_loc = {"ГР": ("main", 3, 0), "СЛ": ("main", 1, 1), "КГ": ("second", 5, None), "ПФ": ("second", 1, None)}
        for f in self.faculties:
            admin.append((self.spec_chair[f["abbr"]]["name"], dean_loc[f["abbr"]]))
        main_locs = [k for k in free if k[0] == "main"]
        for key, c in self.subject_chair.items():
            admin.append((c["name"], rng.choice(main_locs)))
        lang_locs = [("second", 3, None), ("second", 4, None), ("main", 4, 0), ("main", 4, 1)]
        for code, c in self.lang_chair.items():
            admin.append((c["name"], rng.choice(lang_locs)))
        for purpose, loc in admin:
            add_room(loc, "Административное помещение", rng.choice([6, 8, 10, 12]), purpose)

        # учебные аудитории
        for loc in [("main", 1, 0)] * 6 + [("main", 2, 0)] * 3 + [("main", 2, 1)] * 3:
            add_room(loc, "Лекционная", rng.choice([80, 90, 100, 120, 150]))
        for loc in [("main", 1, 1)] * 6 + [("main", 2, 1)] * 4:
            add_room(loc, "Лаборатория", rng.choice([24, 26, 28, 30]))
        for loc in [("main", 3, 1), ("main", 3, 1), ("second", 2, None), ("second", 2, None)]:
            add_room(loc, "Компьютерный класс", rng.choice([20, 24, 30]))
        for loc in list(free):
            b, floor, _ = loc
            while free[loc]:
                if (b == "main" and floor >= 3) or (b == "second" and floor >= 3):
                    lang = rng.random() < (0.5 if b == "main" else 1.0)
                else:
                    lang = False
                if lang:
                    add_room(loc, "Лингафонный кабинет", rng.choice([10, 12, 12, 14, 16]))
                else:
                    add_room(loc, "Семинарская", rng.choice([24, 26, 28, 30, 32, 35]))

        for i in (1, 2):
            self.rooms.append(dict(oid=self.nid("room"), number=f"Обсерватория-{i}", building="obs",
                                   type="Обсерватория", capacity=30, floor=None, wing=None, purpose=None,
                                   bookable=True))
        for i in (1, 2, 3):
            self.rooms.append(dict(oid=self.nid("room"), number=f"Манеж-{i}", building="manege", type="Манеж",
                                   capacity=30, floor=None, wing=None, purpose=None, bookable=True))
        self.room_by_oid = {r["oid"]: r for r in self.rooms}
        self.rooms_by_type = defaultdict(list)
        for r in self.rooms:
            if r["bookable"]:
                self.rooms_by_type[r["type"]].append(r)

    # -------------------------------------------------------------- группы и студенты
    def build_groups(self):
        rng = self.rng
        self.groups = {}          # oid -> group
        self.streams = {}
        self.students = []
        orient_cycle = []
        record_seq = Counter()

        def next_oriental3():
            nonlocal orient_cycle
            picked = []
            while len(picked) < 3:
                if not orient_cycle:
                    orient_cycle = ORIENTAL[:]
                    rng.shuffle(orient_cycle)
                cand = orient_cycle.pop(0)
                if cand in picked:
                    orient_cycle.append(cand)
                    continue
                picked.append(cand)
            return picked

        for f in self.faculties:
            for course in range(1, 5):
                st = dict(oid=self.nid("stream"), name=f"{course}-{f['abbr']}, поток 1", faculty=f, course=course,
                          groups=[])
                self.streams[st["oid"]] = st
                profiles = ["EN", "MIX", "OR"]
                rng.shuffle(profiles)
                lang_no = 0
                for gi in range(1, 4):
                    segments = self.make_segments(profiles[gi - 1], next_oriental3)
                    n = sum(len_ for len_, _, _ in segments)
                    g = dict(oid=self.nid("group", 1001), gid=self.uuid4(), number=f"{course}-{f['abbr']}-{gi}",
                             type="academic", faculty=f, course=course, size=n, stream=st["oid"],
                             program=self.programs[f["oid"]]["oid"], language=None, level=None, parent=None,
                             short=None, profile=profiles[gi - 1], lang_groups=[])
                    self.groups[g["oid"]] = g
                    st["groups"].append(g["oid"])
                    # студенты и языковые группы
                    student_l1 = {}
                    student_l2 = {}
                    offset = 0
                    seg_groups = []
                    for seg_n, l1_chunks, l2_chunks in segments:
                        idx = list(range(offset, offset + seg_n))
                        offset += seg_n
                        seg_groups.append((idx, l1_chunks, l2_chunks))
                    for level, store in (("первый", student_l1), ("второй", student_l2)):
                        for idx, l1_chunks, l2_chunks in seg_groups:
                            chunks = l1_chunks if level == "первый" else l2_chunks
                            order = idx[:]
                            rng.shuffle(order)
                            pos = 0
                            for code, size in chunks:
                                lang_no += 1
                                lg = dict(oid=self.nid("group", 1001), gid=self.uuid4(),
                                          number=f"{course}-{f['abbr']}-{gi} ({lang_no})", type="language",
                                          faculty=f, course=course, size=size, stream=None,
                                          program=g["program"], language=code, level=level, parent=g["oid"],
                                          short=f"({lang_no})", lang_groups=[])
                                self.groups[lg["oid"]] = lg
                                g["lang_groups"].append(lg["oid"])
                                for s in order[pos:pos + size]:
                                    store[s] = lg["oid"]
                                pos += size
                            assert pos == len(order)
                    adm = 2026 - course + 1
                    for s in range(n):
                        last, first, middle, fio, short = self.make_person()
                        record_seq[(adm, f["abbr"])] += 1
                        self.students.append(dict(
                            oid=self.nid("student", 260001), last=last, first=first, middle=middle, fio=fio,
                            short=short, email=self.email(f"{translit(first)}.{translit(last)}{adm % 100:02d}",
                                             f"{translit(first)}.{translit(middle)[0]}.{translit(last)}{adm % 100:02d}"),
                            record_book=f"{adm % 100:02d}{f['abbr']}{record_seq[(adm, f['abbr'])]:04d}",
                            group=g["oid"], langs=[student_l1[s], student_l2[s]]))

    def make_segments(self, profile, next_oriental3):
        """Сегменты академической группы: (кол-во, [(язык, размер) первого], [(язык, размер) второго])."""
        rng = self.rng
        if profile == "EN":       # все учат английский первым
            n = rng.randint(18, 24)
            l2 = split_chunks(n)
            langs = rng.sample(EURO_SECOND, len(l2))
            return [(n, [("en", x) for x in split_chunks(n)], list(zip(langs, l2)))]
        if profile == "MIX":      # часть — английский первым, часть — европейский первым + английский вторым
            e = rng.randint(8, 9)
            u = rng.randint(max(10, 18 - e), min(13, 24 - e))
            u_sizes = split_chunks(u)
            return [(e, [("en", e)], [(rng.choice(EURO_SECOND), e)]),
                    (u, list(zip(rng.sample(EURO_SECOND, len(u_sizes)), u_sizes)),
                     [("en", x) for x in split_chunks(u)])]
        # OR: неевропейские языки первым, английский вторым
        langs = next_oriental3()
        sizes = [rng.randint(6, 8) for _ in langs]
        n = sum(sizes)
        return [(n, list(zip(langs, sizes)), [("en", x) for x in split_chunks(n)])]

    # -------------------------------------------------------------- преподаватели
    def new_lecturer(self, chair, senior=False):
        rng = self.rng
        if senior:
            rank = rng.choices(["доцент", "профессор"], [6, 4])[0]
        elif chair["is_language"]:
            rank = rng.choices(["ассистент", "ст. преподаватель", "доцент", "профессор"], [3, 5, 2, 0.3])[0]
        else:
            rank = rng.choices(["ассистент", "ст. преподаватель", "доцент", "профессор"], [2, 5, 3, 0.5])[0]
        cand, doct = chair["degrees"]
        degree = {"профессор": doct, "доцент": cand,
                  "ст. преподаватель": cand if rng.random() < 0.4 else None, "ассистент": None}[rank]
        last, first, middle, fio, short = self.make_person()
        t = dict(oid=self.nid("lecturer", 2001), last=last, first=first, middle=middle, fio=fio, short=short,
                 chair_oid=chair["oid"], rank=rank, degree=degree, title=f"{rank} {fio}",
                 email=self.email(f"{translit(first)[0]}.{translit(last)}",
                                  f"{translit(first)[0]}.{translit(middle)[0]}.{translit(last)}"),
                 senior=rank in ("доцент", "профессор"))
        self.lecturers[t["oid"]] = t
        self.chair_teachers[chair["oid"]].append(t)
        return t

    # -------------------------------------------------------------- недельный шаблон
    def build_units(self):
        """Единицы размещения: один слот недели для аудитории (поток/группа/все языковые группы уровня)."""
        lec_units, lang_units, grp_units = [], [], []

        def mk_item(disc, kind, parity, room_kind, size, audience, senior):
            return dict(disc=disc["oid"], chair=disc["chair_oid"], kind=KIND_NAMES[kind], parity=parity,
                        room_kind=room_kind, size=size, audience=audience, pref=(disc["oid"], audience),
                        senior=senior, allowed=allowed_slots(room_kind))

        def pair(items):
            every = [i for i in items if i["parity"] == "every"]
            odd = [i for i in items if i["parity"] == "odd"]
            even = [i for i in items if i["parity"] == "even"]
            units = [[i] for i in every]
            while odd and even:
                units.append([odd.pop(0), even.pop(0)])
            units += [[i] for i in odd + even]
            return units

        for st in self.streams.values():
            f, course = st["faculty"], st["course"]
            cur = CURRICULUM[course]
            size = sum(self.groups[g]["size"] for g in st["groups"])

            def disc_of(subj):
                return self.disc[("spec", f["abbr"])] if subj == "spec" else self.disc[subj]

            lec_items = [mk_item(disc_of(s), k, p, room_kind_for(s, k), size, ("stream", st["oid"]), True)
                         for s, k, p in cur["items"] if k == "lec"]
            for u in pair(lec_items):
                lec_units.append(dict(groups=list(st["groups"]), grid=f["grid"], items=u))
            for goid in st["groups"]:
                g = self.groups[goid]
                items = [mk_item(disc_of(s), k, p, room_kind_for(s, k), g["size"], ("group", goid), False)
                         for s, k, p in cur["items"] if k != "lec"]
                for u in pair(items):
                    grp_units.append(dict(groups=[goid], grid=f["grid"], items=u))
                for level, npairs in (("первый", LANG_L1_PAIRS), ("второй", LANG_L2_PAIRS)):
                    lgs = [self.groups[x] for x in g["lang_groups"] if self.groups[x]["level"] == level]
                    for _ in range(npairs):
                        items = [mk_item(self.disc[("lang", lg["language"])], "lang", "every",
                                         "Лингафонный кабинет", lg["size"], ("group", lg["oid"]), False)
                                 for lg in lgs]
                        lang_units.append(dict(groups=[goid], grid=f["grid"], items=items))
        return lec_units, lang_units, grp_units

    def day_cost(self, g, day, extra_slot=None, extra_pars=()):
        occ = self.gocc[g][day]
        cost = 0.0
        for p in ("odd", "even"):
            slots = {s for s, ps in occ.items() if p in ps}
            if extra_slot is not None and p in extra_pars:
                slots.add(extra_slot)
            if not slots:
                continue
            n = len(slots)
            win = max(slots) - min(slots) + 1 - n
            cost += win * 8 + n * n + (6 if n > 4 else 0) + (3 if min(slots) >= 3 else 0)
        return cost

    def build_templates(self):
        rng = self.rng
        self.lecturers = {}
        self.chair_teachers = defaultdict(list)
        self.tbusy = defaultdict(list)    # (teacher, day, par) -> [(s, e)]
        self.rbusy = defaultdict(list)    # (room, day, par)
        self.load = Counter()
        self.pref_teacher = {}
        self.pref_room = {}
        self.gocc = defaultdict(lambda: defaultdict(dict))  # group -> day -> slot -> set(par)
        self.templates = []

        lec_units, lang_units, grp_units = self.build_units()
        self.pref_need = Counter()
        for u in lec_units + lang_units + grp_units:
            for it in u["items"]:
                self.pref_need[it["pref"]] += 1
        # за каждой языковой группой заранее закрепляем одного преподавателя (с запасом по нагрузке)
        lang_keys = sorted({(it["pref"], it["chair"]) for u in lang_units for it in u["items"]})
        rng.shuffle(lang_keys)
        assigned = Counter()
        for key, chair_oid in lang_keys:
            need = self.pref_need[key]
            chair = self.chair_by_oid[chair_oid]
            fit = [t for t in self.chair_teachers[chair_oid] if assigned[t["oid"]] + need <= LOAD_CAP - 2]
            t = max(fit, key=lambda t: assigned[t["oid"]] + rng.uniform(0, 3)) if fit else self.new_lecturer(chair)
            assigned[t["oid"]] += need
            self.pref_teacher[key] = t["oid"]
        for lst in (lec_units, lang_units, grp_units):
            rng.shuffle(lst)
        for unit in lec_units + lang_units + grp_units:
            self.place(unit)

    def place(self, unit):
        rng = self.rng
        upars = set()
        for it in unit["items"]:
            upars |= set(PARS[it["parity"]])
        allowed = set.intersection(*[it["allowed"] for it in unit["items"]])
        cands = []
        for day in TEACHING_DAYS:
            for slot in sorted(allowed):
                ok = True
                delta = 0.0
                for g in unit["groups"]:
                    occ = self.gocc[g][day]
                    if occ.get(slot, set()) & upars:
                        ok = False
                        break
                    for p in upars:
                        if sum(1 for ps in occ.values() if p in ps) >= MAX_PER_DAY:
                            ok = False
                    if not ok:
                        break
                    delta += self.day_cost(g, day, slot, upars) - self.day_cost(g, day)
                if not ok:
                    continue
                delta += {5: 1.5, 6: 3}.get(slot, 0) + rng.random() * 0.8
                cands.append((delta, day, slot))
        if not cands:
            raise PlacementError("нет свободного слота")
        cands.sort()
        best = cands[0][0]
        is_lang = any(self.disc_by_oid[it["disc"]]["is_language"] for it in unit["items"])
        for mode in (2, 1, 0):
            # языковой группе важнее один преподаватель на весь семестр, чем идеальный слот
            pool = cands if mode == 0 or (mode == 2 and is_lang) else [c for c in cands if c[0] <= best + 6]
            for _, day, slot in pool:
                res = self.try_assign(unit, day, slot, mode)
                if res is not None:
                    for g in unit["groups"]:
                        self.gocc[g][day].setdefault(slot, set()).update(upars)
                    for it, t, r in res:
                        self.pref_teacher.setdefault(it["pref"], t["oid"])
                        self.pref_room.setdefault(it["pref"], r["oid"])
                        self.templates.append(dict(
                            oid=self.nid("template"), day=day, slot=slot, parity=it["parity"], disc=it["disc"],
                            kind=it["kind"], lecturer=t["oid"], room=r["oid"], audience=it["audience"],
                            grid=unit["grid"], groups=list(unit["groups"]), size=it["size"]))
                    return
        raise PlacementError("не удалось назначить преподавателя/аудиторию")

    def fits(self, t, pars, need=1):
        """Нагрузка считается отдельно для нечётной и чётной недели; need — сколько пар резервируем."""
        return all(self.load[(t, p)] + need <= LOAD_CAP for p in pars)

    def t_free(self, t, day, pars, s, e):
        return all(not any(overlaps(s, e, a, b) for a, b in self.tbusy[(t, day, p)]) for p in pars)

    def r_free(self, r, day, pars, s, e):
        return all(not any(overlaps(s, e, a, b) for a, b in self.rbusy[(r, day, p)]) for p in pars)

    def try_assign(self, unit, day, slot, mode):
        rng = self.rng
        s, e = (mins(x) for x in GRIDS[unit["grid"]][slot])
        booked = []   # для отката
        res = []

        def rollback():
            for kind, key, val, w in booked:
                if kind == "t":
                    self.tbusy[key].remove(val)
                elif kind == "r":
                    self.rbusy[key].remove(val)
                else:
                    for p in key[1]:
                        self.load[(key[0], p)] -= 1

        for it in unit["items"]:
            pars = PARS[it["parity"]]
            chair = self.chair_by_oid[it["chair"]]
            teacher = None
            pref = self.pref_teacher.get(it["pref"])
            if pref is not None and self.t_free(pref, day, pars, s, e) and self.fits(pref, pars):
                teacher = self.lecturers[pref]
            elif not (mode == 2 and pref is not None):
                cands = [t for t in self.chair_teachers[chair["oid"]]
                         if (t["senior"] or not it["senior"])
                         and self.fits(t["oid"], pars, self.pref_need[it["pref"]] if pref is None else 1)
                         and self.t_free(t["oid"], day, pars, s, e)]
                if cands:
                    cands.sort(key=lambda t: -(self.load[(t["oid"], "odd")] + self.load[(t["oid"], "even")]) / 2
                               + rng.uniform(0, 6))
                    teacher = cands[0]
                elif mode == 0:
                    teacher = self.new_lecturer(chair, senior=it["senior"])
            if teacher is None:
                rollback()
                return None
            room = None
            pr = self.pref_room.get(it["pref"])
            if pr is not None and self.r_free(pr, day, pars, s, e):
                room = self.room_by_oid[pr]
            else:
                rc = [r for r in self.rooms_by_type[it["room_kind"]]
                      if r["capacity"] >= it["size"] and self.r_free(r["oid"], day, pars, s, e)]
                if rc:
                    rc.sort(key=lambda r: r["capacity"] + rng.uniform(0, 8))
                    room = rc[0]
            if room is None:
                rollback()
                return None
            for p in pars:
                self.tbusy[(teacher["oid"], day, p)].append((s, e))
                booked.append(("t", (teacher["oid"], day, p), (s, e), 0))
                self.rbusy[(room["oid"], day, p)].append((s, e))
                booked.append(("r", (room["oid"], day, p), (s, e), 0))
            for p in pars:
                self.load[(teacher["oid"], p)] += 1
            booked.append(("l", (teacher["oid"], pars), None, 0))
            res.append((it, teacher, room))
        return res

    # -------------------------------------------------------------- развёртывание в даты
    def audience_acad(self, audience):
        typ, oid = audience
        if typ == "stream":
            return list(self.streams[oid]["groups"])
        g = self.groups[oid]
        return [g["parent"]] if g["type"] == "language" else [oid]

    def audience_size(self, audience):
        typ, oid = audience
        if typ == "stream":
            return sum(self.groups[g]["size"] for g in self.streams[oid]["groups"])
        return self.groups[oid]["size"]

    def grid_of(self, audience):
        typ, oid = audience
        f = self.streams[oid]["faculty"] if typ == "stream" else self.groups[oid]["faculty"]
        return f["grid"]

    def make_lesson(self, date, slot, disc, kind, lecturer, room, audience, template=None):
        grid = self.grid_of(audience)
        b, e = GRIDS[grid][slot]
        return dict(oid=self.nid("lesson", 100001), template=template, date=date, slot=slot, begin=b, end=e,
                    disc=disc, kind=kind, lecturer=lecturer, room=room, audience=audience,
                    acad=self.audience_acad(audience), grid=grid, is_online=False, url1=None, url1d=None,
                    status="normal", note=None, updated_at=dt.datetime(2026, 8, 28, 12, 0))

    def expand(self):
        self.lessons = []
        days = [d for d in daterange(SEM_START, SEM_END) if d.isoweekday() in TEACHING_DAYS and d not in HOLIDAYS]
        for t in self.templates:
            for d in days:
                if d.isoweekday() != t["day"]:
                    continue
                par = "odd" if week_number(d) % 2 == 1 else "even"
                if t["parity"] != "every" and t["parity"] != par:
                    continue
                self.lessons.append(self.make_lesson(d, t["slot"], t["disc"], t["kind"], t["lecturer"], t["room"],
                                                     t["audience"], t["oid"]))

    # -------------------------------------------------------------- зачёты
    def assessment_of(self, disc_oid, group):
        d = self.disc_by_oid[disc_oid]
        if d["is_language"]:
            return "экзамен" if group["level"] == "первый" else "зачёт"
        key = "spec" if isinstance(d["key"], tuple) else d["key"]
        return CURRICULUM[group["course"]]["assess"][key]

    def build_credits(self):
        last = {}
        for l in self.lessons:
            if l["audience"][0] != "group" or l["kind"] not in ("Семинар", "Практическое занятие"):
                continue
            key = (l["audience"][1], l["disc"])
            if key not in last or (l["date"], l["slot"]) > (last[key]["date"], last[key]["slot"]):
                last[key] = l
        self.credit_count = 0
        for (goid, disc), l in last.items():
            a = self.assessment_of(disc, self.groups[goid])
            if a.startswith("зачёт"):
                l["kind"] = "Зачёт"
                l["note"] = "Зачёт с оценкой" if a == "зачёт с оценкой" else None
                self.credit_count += 1

    # -------------------------------------------------------------- сессия
    def build_session(self):
        rng = self.rng
        days = [d for d in daterange(SESSION_START, SESSION_END) if d.isoweekday() in TEACHING_DAYS]
        exam_days = [d for d in days if d.isoweekday() != 1 and d > SESSION_START]  # консультация — в будний день
        tb = defaultdict(list)   # (teacher, date) -> [(s, e)]
        rb = defaultdict(list)   # (room, date) -> [(s, e)]
        gb = defaultdict(list)   # (acad, date) -> [(s, e, tag)]
        self.session_lessons = []
        acad = [g for g in self.groups.values() if g["type"] == "academic"]
        rng.shuffle(acad)

        def room_for(kind, size, d, s, e):
            rc = [r for r in self.rooms_by_type[kind] if r["capacity"] >= size
                  and not any(overlaps(s, e, a, b) for a, b in rb[(r["oid"], d)])]
            return min(rc, key=lambda r: r["capacity"] + rng.uniform(0, 8)) if rc else None

        def free(lst, s, e, tag=None):
            return not any(overlaps(s, e, x[0], x[1]) for x in lst if tag is None or x[2] != tag)

        for g in acad:
            grid = g["faculty"]["grid"]
            cur = CURRICULUM[g["course"]]
            exams = []
            for subj, a in cur["assess"].items():
                if a != "экзамен":
                    continue
                disc = self.disc[("spec", g["faculty"]["abbr"])] if subj == "spec" else self.disc[subj]
                examiner = self.pref_teacher[(disc["oid"], ("stream", g["stream"]))]
                exams.append([(disc["oid"], g["oid"], g["size"], examiner, "Семинарская")])
            parts = []
            for lg_oid in g["lang_groups"]:
                lg = self.groups[lg_oid]
                if lg["level"] != "первый":
                    continue
                disc = self.disc[("lang", lg["language"])]
                parts.append((disc["oid"], lg_oid, lg["size"], self.pref_teacher[(disc["oid"], ("group", lg_oid))],
                              "Лингафонный кабинет"))
            exams.append(parts)
            def rollback(booking):
                for b in booking:
                    if b[0] != "lesson":
                        b[0][b[1]].remove(b[2])

            def try_exam(ex, d, tag):
                """Экзамен в день d + консультация за 1–2 дня; возвращает бронирования или None."""
                cds = [d - dt.timedelta(days=k) for k in (1, 2)]
                cds = [c for c in cds if c >= SESSION_START and c.isoweekday() in TEACHING_DAYS]
                rng.shuffle(cds)
                for cd in cds:
                    booking = []
                    ok = True
                    for disc, aud, size, teacher, rkind in ex:
                        done = False
                        for s_no in (1, 2, 3, 4):
                            es, ee = (mins(x) for x in GRIDS[grid][s_no])
                            if not free(tb[(teacher, d)], es, ee) or not free(gb[(g["oid"], d)], es, ee, tag):
                                continue
                            room = room_for(rkind, size, d, es, ee)
                            if room is None:
                                continue
                            for c_no in (3, 4, 5, 6):
                                cs, ce = (mins(x) for x in GRIDS[grid][c_no])
                                if not free(tb[(teacher, cd)], cs, ce) or not free(gb[(g["oid"], cd)], cs, ce, tag):
                                    continue
                                croom = room_for(rkind, size, cd, cs, ce)
                                if croom is None:
                                    continue
                                for key, store, val in [((teacher, d), tb, (es, ee)), ((room["oid"], d), rb, (es, ee)),
                                                        ((g["oid"], d), gb, (es, ee, tag)),
                                                        ((teacher, cd), tb, (cs, ce)), ((croom["oid"], cd), rb, (cs, ce)),
                                                        ((g["oid"], cd), gb, (cs, ce, tag))]:
                                    store[key].append(val)
                                    booking.append((store, key, val))
                                booking.append(("lesson", (d, s_no, disc, "Экзамен", teacher, room["oid"], aud)))
                                booking.append(("lesson", (cd, c_no, disc, "Консультация", teacher, croom["oid"], aud)))
                                done = True
                                break
                            if done:
                                break
                        if not done:
                            ok = False
                            break
                    if ok:
                        return booking
                    rollback(booking)
                return None

            # все наборы дат с интервалом ≥ 3 дней; перебираем наборы и порядок экзаменов с откатом
            k = len(exams)
            date_sets = []

            def gen_sets(start, acc):
                if len(acc) == k:
                    date_sets.append(list(acc))
                    return
                for i in range(start, len(exam_days)):
                    if not acc or (exam_days[i] - acc[-1]).days >= 3:
                        gen_sets(i + 1, acc + [exam_days[i]])

            gen_sets(0, [])
            rng.shuffle(date_sets)
            placed_all = False
            for ds in date_sets[:400]:
                order = exams[:]
                rng.shuffle(order)
                bookings = []
                for ei, (ex, d) in enumerate(zip(order, ds)):
                    b = try_exam(ex, d, (g["oid"], ei))
                    if b is None:
                        break
                    bookings.append(b)
                if len(bookings) == k:
                    for booking in bookings:
                        for b in booking:
                            if b[0] == "lesson":
                                dd, sn, disc, kind, teacher, room, aud = b[1]
                                self.session_lessons.append(
                                    self.make_lesson(dd, sn, disc, kind, teacher, room, ("group", aud)))
                    placed_all = True
                    break
                for booking in bookings:
                    rollback(booking)
            if not placed_all:
                raise PlacementError(f"экзамены для {g['number']} не помещаются")
        self.lessons.extend(self.session_lessons)

    # -------------------------------------------------------------- изменения и онлайн
    def build_changes(self):
        rng = self.rng
        idx_t, idx_r, idx_g = defaultdict(list), defaultdict(list), defaultdict(list)

        def add(l):
            s, e = mins(l["begin"]), mins(l["end"])
            idx_t[(l["lecturer"], l["date"])].append((s, e, l["oid"]))
            if l["room"] is not None:
                idx_r[(l["room"], l["date"])].append((s, e, l["oid"]))
            for g in l["acad"]:
                idx_g[(g, l["date"])].append((s, e, l["oid"]))

        def remove(l):
            for idx, keys in ((idx_t, [l["lecturer"]]), (idx_r, [l["room"]]), (idx_g, l["acad"])):
                for k in keys:
                    idx[(k, l["date"])] = [x for x in idx[(k, l["date"])] if x[2] != l["oid"]]

        def free(idx, key, d, s, e):
            return not any(overlaps(s, e, a, b) for a, b, _ in idx[(key, d)])

        for l in self.lessons:
            add(l)
        wl = Counter((l["lecturer"], week_number(l["date"])) for l in self.lessons if l["date"] <= SEM_END)
        WEEK_CAP = 18

        def day_ok(g, d, grid, new_slot):
            """После добавления пары у группы не больше 5 пар и не больше одного окна."""
            start2slot = {mins(b): n for n, (b, _) in GRIDS[grid].items()}
            slots = {start2slot[a] for a, _, _ in idx_g[(g, d)]} | {new_slot}
            return len(slots) <= MAX_PER_DAY and max(slots) - min(slots) + 1 - len(slots) <= 1

        teach_days = {d for d in daterange(SEM_START, CREDIT_WEEK_START - dt.timedelta(days=1))
                      if d.isoweekday() in TEACHING_DAYS and d not in HOLIDAYS}
        pool = [l for l in self.lessons if l["date"] < CREDIT_WEEK_START and l["date"] >= dt.date(2026, 9, 7)
                and l["kind"] in ("Лекция", "Семинар", "Практическое занятие")]
        weights = [3.0 if 10 <= week_number(l["date"]) <= 13 else 1.0 for l in pool]
        target = int(len(pool) * 0.035)
        picked = set()
        while len(picked) < target:
            picked.add(rng.choices(range(len(pool)), weights)[0])
        self.change_stats = Counter()

        def stamp(l):
            ua = dt.datetime.combine(l["date"], dt.time(rng.randint(8, 20), rng.choice([0, 15, 30, 45])))
            ua -= dt.timedelta(days=rng.randint(1, 6))
            if ua > NOW:
                ua = NOW - dt.timedelta(days=rng.randint(0, 6), hours=rng.randint(0, 6))
            l["updated_at"] = ua

        for i in sorted(picked):
            l = pool[i]
            kind = rng.choices(["cancelled", "replaced", "moved"], [30, 35, 35])[0]
            s, e = mins(l["begin"]), mins(l["end"])
            if kind == "replaced":
                chair = self.disc_by_oid[l["disc"]]["chair_oid"]
                senior = l["kind"] == "Лекция"
                cands = [t for t in self.chair_teachers[chair] if t["oid"] != l["lecturer"]
                         and (t["senior"] or not senior) and free(idx_t, t["oid"], l["date"], s, e)
                         and wl[(t["oid"], week_number(l["date"]))] < WEEK_CAP]
                if not cands:
                    kind = "cancelled"
                else:
                    old = self.lecturers[l["lecturer"]]
                    new = rng.choice(cands)
                    remove(l)
                    wl[(l["lecturer"], week_number(l["date"]))] -= 1
                    l["lecturer"] = new["oid"]
                    wl[(l["lecturer"], week_number(l["date"]))] += 1
                    add(l)
                    l["status"], l["note"] = "replaced", f"Замена преподавателя (было: {old['short']})"
            if kind == "moved":
                old_date, old_slot = l["date"], l["slot"]
                offsets = [k for k in range(-4, 8) if k != 0]
                rng.shuffle(offsets)
                done = False
                remove(l)
                for k in offsets:
                    d2 = l["date"] + dt.timedelta(days=k)
                    if d2 not in teach_days:
                        continue
                    if week_number(d2) != week_number(l["date"]) and wl[(l["lecturer"], week_number(d2))] >= WEEK_CAP:
                        continue
                    for sn in rng.sample(range(1, 7), 6):
                        b, en = GRIDS[l["grid"]][sn]
                        s2, e2 = mins(b), mins(en)
                        if not free(idx_t, l["lecturer"], d2, s2, e2):
                            continue
                        if not all(free(idx_g, g, d2, s2, e2) and day_ok(g, d2, l["grid"], sn) for g in l["acad"]):
                            continue
                        room = l["room"]
                        if not free(idx_r, room, d2, s2, e2):
                            rtype = self.room_by_oid[room]["type"]
                            alt = [r for r in self.rooms_by_type[rtype]
                                   if r["capacity"] >= self.audience_size(l["audience"])
                                   and free(idx_r, r["oid"], d2, s2, e2)]
                            if not alt:
                                continue
                            room = rng.choice(alt)["oid"]
                        wl[(l["lecturer"], week_number(l["date"]))] -= 1
                        wl[(l["lecturer"], week_number(d2))] += 1
                        l.update(date=d2, slot=sn, begin=b, end=en, room=room, status="moved",
                                 note=f"Перенесено с {old_date:%d.%m} ({old_slot} пара)")
                        done = True
                        break
                    if done:
                        break
                add(l)
                if not done:
                    kind = "cancelled"
            if kind == "cancelled":
                remove(l)
                wl[(l["lecturer"], week_number(l["date"]))] -= 1
                l["status"] = "cancelled"
                l["note"] = rng.choice(["Занятие отменено", "Отмена: преподаватель на конференции",
                                        "Отмена: болезнь преподавателя", "Отмена: аудитория на ремонте"])
            stamp(l)
            self.change_stats[l["status"]] += 1

        # онлайн: ~1.5% занятий семестра — лекции и семинары (не лаборатории, манеж, обсерватория, языки)
        sem_total = sum(1 for l in self.lessons if l["date"] <= SEM_END)
        online_pool = [l for l in self.lessons if l["kind"] in ("Лекция", "Семинар") and l["status"] == "normal"
                       and l["date"] < CREDIT_WEEK_START]
        self.online_count = min(len(online_pool), int(sem_total * 0.015))
        for l in rng.sample(online_pool, self.online_count):
            l.update(is_online=True, room=None, url1=f"https://{DOMAIN}/meet/{l['oid']}",
                     url1d="Ссылка на конференцию")

    # -------------------------------------------------------------- мероприятия
    def build_events(self):
        rng = self.rng
        halls = self.rooms_by_type["Лекционная"]
        obs = self.rooms_by_type["Обсерватория"][0]
        manege = self.rooms_by_type["Манеж"][0]
        spec = [
            ("Встреча деканатов с первокурсниками", dt.date(2026, 9, 3), "19:00", "20:30", rng.choice(halls),
             "Управление учебно-организационной работы", "Знакомство с деканатами, кураторами и личным кабинетом."),
            ("Ночь в обсерватории: наблюдение Сатурна", dt.date(2026, 9, 24), "20:00", "22:00", obs,
             "Кафедра астрономии", "Открытые наблюдения для всех курсов. Тёплая одежда обязательна."),
            ("Ярмарка языковых клубов", dt.date(2026, 10, 1), "19:00", "21:00", rng.choice(halls),
             "Студенческий офис", "Клубы всех десяти языков: разговорные встречи, кино, настольные игры."),
            ("Открытый турнир по верховой езде", dt.date(2026, 10, 16), "19:00", "21:00", manege,
             "Кафедра верховой езды", "Командный зачёт между факультетами."),
            ("Открытая лекция «Трансфигурация в XXI веке»", dt.date(2026, 10, 29), "19:00", "20:30",
             rng.choice(halls), "Кафедра трансфигурации", "Лекция приглашённого профессора, вход свободный."),
            ("Межфакультетский кубок по нумерологии", dt.date(2026, 11, 19), "19:00", "21:00", rng.choice(halls),
             "Кафедра нумерологии", "Командная олимпиада, по одной команде от курса факультета."),
            ("Финал конкурса эссе по древней литературе", dt.date(2026, 12, 3), "19:00", "20:30",
             rng.choice(halls), "Кафедра древней литературы", "Чтение работ финалистов и награждение."),
            ("Праздничный концерт факультетов", dt.date(2026, 12, 24), "19:00", "21:30", rng.choice(halls),
             "Студенческий офис", "Номера от всех четырёх факультетов."),
        ]
        self.events = [dict(oid=self.nid("event"), title=t, date=d, begin=b, end=e, room=r["oid"], organizer=o,
                            description=desc) for t, d, b, e, r, o, desc in spec]

    # -------------------------------------------------------------- запуск
    def run(self):
        self.build_reference()
        self.build_groups()
        self.build_templates()
        self.expand()
        self.build_credits()
        self.build_session()
        self.build_changes()
        self.build_events()
        self.lessons.sort(key=lambda l: (l["date"], l["begin"], l["oid"]))

    # ============================================================== вывод
    def ruz_rows(self, l):
        """Строки «занятие × группа» в формате API РУЗ."""
        t = self.lecturers[l["lecturer"]]
        room = self.room_by_oid[l["room"]] if l["room"] is not None else None
        b = self.buildings[room["building"]] if room else None
        base = {
            "lessonOid": l["oid"], "date": l["date"].strftime("%Y.%m.%d"), "dayOfWeek": l["date"].isoweekday(),
            "dayOfWeekString": DOW_STR[l["date"].isoweekday()], "beginLesson": l["begin"], "endLesson": l["end"],
            "lessonNumberStart": l["slot"], "lessonNumberEnd": l["slot"],
            "discipline": self.disc_by_oid[l["disc"]]["name"], "disciplineOid": l["disc"],
            "kindOfWork": l["kind"], "kindOfWorkOid": self.kinds[l["kind"]]["oid"],
            "lecturer": t["short"], "lecturer_title": t["title"], "lecturerOid": t["oid"],
            "lecturerEmail": t["email"], "lecturer_rank": t["rank"],
        }
        tail = {
            "subGroup": None, "subGroupOid": None,
            "auditorium": room["number"] if room else None, "auditoriumOid": room["oid"] if room else None,
            "building": b["name"] if b else None, "buildingOid": b["oid"] if b else None,
            "note": l["note"], "url1": l["url1"], "url1_description": l["url1d"], "url2": None,
            "url2_description": None,
        }
        typ, oid = l["audience"]
        if typ == "stream":
            st = self.streams[oid]
            for g in st["groups"]:
                yield {**base, "group": self.groups[g]["number"], "groupOid": g, "stream": st["name"],
                       "streamOid": oid, **tail}
        else:
            yield {**base, "group": self.groups[oid]["number"], "groupOid": oid, "stream": None, "streamOid": None,
                   **tail}

    def entities(self):
        out = []
        for g in sorted(self.groups.values(), key=lambda g: g["oid"]):
            f = g["faculty"]
            if g["type"] == "academic":
                desc = f"{f['name']}, {g['course']} курс, бакалавриат, академическая группа"
            else:
                desc = (f"{f['name']}, {g['course']} курс, группа {self.groups[g['parent']]['number']}, "
                        f"языковая группа: {LANGS[g['language']][0]} язык ({g['level']})")
            out.append(dict(id=g["oid"], label=g["number"], description=desc, type="group"))
        for t in sorted(self.lecturers.values(), key=lambda t: t["oid"]):
            out.append(dict(id=t["oid"], label=t["fio"],
                            description=f"{t['rank']}, {self.chair_by_oid[t['chair_oid']]['name']}", type="person"))
        for r in self.rooms:
            if not r["bookable"]:
                continue
            b = self.buildings[r["building"]]
            where = f"{b['name']}" + (f", {r['floor']} этаж" if r["floor"] else "") + \
                    (f", крыло {r['wing']}" if r["wing"] is not None else "")
            out.append(dict(id=r["oid"], label=r["number"],
                            description=f"{where}; {r['type'].lower()}, {r['capacity']} мест", type="auditorium"))
        return out

    def write(self, out: Path, data: Path):
        out.mkdir(parents=True, exist_ok=True)
        data.mkdir(parents=True, exist_ok=True)
        write_text_lf(out / "schema.sql", DDL)
        write_text_lf(ROOT / "schema.sql", DDL)
        dbp = out / "schedule.sqlite"
        if dbp.exists():
            dbp.unlink()
        con = sqlite3.connect(dbp)
        con.executescript(DDL)
        ins = lambda table, rows: con.executemany(
            f"INSERT INTO {table} VALUES ({','.join('?' * len(rows[0]))})", rows) if rows else None
        ins("faculties", [(f["oid"], f["gid"], f["abbr"], f["name"], f["grid"]) for f in self.faculties])
        ins("chairs", [(c["oid"], c["name"], None, c["faculty_oid"], int(c["is_language"])) for c in self.chairs])
        ins("buildings", [(b["oid"], b["name"], b["abbr"], b["address"]) for b in self.buildings.values()])
        ins("auditorium_types", [(t["oid"], t["name"], t["abbr"]) for t in self.types.values()])
        ins("auditoriums", [(r["oid"], r["number"], self.buildings[r["building"]]["oid"], self.types[r["type"]]["oid"],
                             r["capacity"], r["floor"], r["wing"], r["purpose"], int(r["bookable"]))
                            for r in self.rooms])
        ins("kinds_of_work", [(k["oid"], k["name"], k["abbr"], k["is_assessment"], k["audience_level"])
                              for k in self.kinds.values()])
        ins("disciplines", [(d["oid"], d["name"], d["chair_oid"], int(d["is_language"]), d["hours"], d["assessment"])
                            for d in self.disciplines])
        cur_rows = set()
        weight = {"every": 1.0, "odd": 0.5, "even": 0.5}
        for f in self.faculties:
            for course, cur in CURRICULUM.items():
                ppw = Counter()
                for s, _, p in cur["items"]:
                    ppw[s] += weight[p]
                for s, a in cur["assess"].items():
                    d = self.disc[("spec", f["abbr"])] if s == "spec" else self.disc[s]
                    cur_rows.add((f["oid"], course, d["oid"], "", ppw[s], a))
        for g in self.groups.values():
            if g["type"] == "language":
                d = self.disc[("lang", g["language"])]
                cur_rows.add((g["faculty"]["oid"], g["course"], d["oid"], g["level"],
                              LANG_L1_PAIRS if g["level"] == "первый" else LANG_L2_PAIRS,
                              "экзамен" if g["level"] == "первый" else "зачёт"))
        ins("curriculum", sorted(cur_rows))
        ins("lecturers", [(t["oid"], t["last"], t["first"], t["middle"], t["fio"], t["short"], t["chair_oid"],
                           t["rank"], t["degree"], t["title"], t["email"]) for t in self.lecturers.values()])
        ins("programs", [(p["oid"], p["code"], p["name"], p["level"], p["form"], p["faculty_oid"])
                         for p in self.programs.values()])
        ins("groups", [(g["oid"], g["gid"], g["number"], g["short"], g["type"], g["faculty"]["oid"], g["program"],
                        g["course"], 2026 - g["course"] + 1,
                        LANGS[g["language"]][0] if g["language"] else None, g["level"], g["parent"], g["size"])
                       for g in self.groups.values()])
        ins("streams", [(s["oid"], s["name"], s["faculty"]["oid"], s["course"]) for s in self.streams.values()])
        ins("stream_groups", [(s["oid"], g) for s in self.streams.values() for g in s["groups"]])
        ins("students", [(s["oid"], s["last"], s["first"], s["middle"], s["fio"], s["short"], s["email"],
                          s["record_book"], s["group"]) for s in self.students])
        ins("student_groups", [(s["oid"], g) for s in self.students for g in s["langs"]])
        ins("schedule_templates", [(t["oid"], t["day"], t["slot"], t["parity"], t["disc"], self.kinds[t["kind"]]["oid"],
                                    t["lecturer"], t["room"], t["audience"][0], t["audience"][1],
                                    SEM_START.isoformat(), SEM_END.isoformat()) for t in self.templates])
        ins("lessons", [(l["oid"], l["template"], l["date"].isoformat(), l["date"].isoweekday(),
                         week_number(l["date"]), week_parity(l["date"]), l["slot"], l["slot"], l["begin"], l["end"],
                         l["disc"], self.kinds[l["kind"]]["oid"], l["lecturer"], l["room"], int(l["is_online"]),
                         l["url1"], l["url1d"], l["status"], l["note"],
                         l["updated_at"].strftime("%Y-%m-%d %H:%M:%S")) for l in self.lessons])
        ins("lesson_audience", [(l["oid"], l["audience"][0], l["audience"][1]) for l in self.lessons])
        ins("events", [(e["oid"], e["title"], e["date"].isoformat(), e["begin"], e["end"], e["room"], e["organizer"],
                        e["description"]) for e in self.events])
        con.commit()
        con.close()

        # плоский CSV и JSON
        cols = ["lessonOid", "date", "dayOfWeek", "dayOfWeekString", "beginLesson", "endLesson", "lessonNumberStart",
                "lessonNumberEnd", "discipline", "disciplineOid", "kindOfWork", "kindOfWorkOid", "lecturer",
                "lecturer_title", "lecturerOid", "lecturerEmail", "lecturer_rank", "group", "groupOid", "stream",
                "streamOid", "subGroup", "subGroupOid", "auditorium", "auditoriumOid", "building", "buildingOid",
                "note", "url1", "url1_description", "url2", "url2_description"]
        rows = []
        for l in self.lessons:
            for r in self.ruz_rows(l):
                r["status"] = l["status"]
                rows.append(r)
        rows.sort(key=lambda r: (r["date"], r["beginLesson"], r["group"]))
        # Заменяемый файл кабинета: формат mgimo_ruz.py + колонка status (normal/moved/cancelled/replaced)
        with (data / "schedule.csv").open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh, delimiter=";")
            w.writerow(["lesson_key", *cols, "status"])
            for r in rows:
                w.writerow([f"{r['lessonOid']}|{r['groupOid']}|", *["" if r[c] is None else r[c] for c in cols],
                            r["status"]])
        ents = self.entities()
        with (out / "entities.csv").open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh, delimiter=";")
            w.writerow(["kind", "id", "label", "description"])
            for e in sorted(ents, key=lambda e: (e["type"], e["label"])):
                w.writerow([e["type"], e["id"], e["label"], e["description"]])
        with (out / "schedule.json").open("w", encoding="utf-8", newline=chr(10)) as fh:
            fh.write("[\n" + ",\n".join(json.dumps({**{c: r[c] for c in cols}, "status": r["status"]},
                                                   ensure_ascii=False) for r in rows) + "\n]\n")
        write_text_lf(out / "entities.json", json.dumps(ents, ensure_ascii=False, indent=1))
        studs = []
        for s in self.students:
            g = self.groups[s["group"]]
            studs.append(dict(
                studentOid=s["oid"], fio=s["fio"], shortFIO=s["short"], email=s["email"], recordBook=s["record_book"],
                faculty=g["faculty"]["name"], facultyAbbr=g["faculty"]["abbr"], course=g["course"],
                program=self.programs[g["faculty"]["oid"]]["name"], group=g["number"], groupOid=g["oid"],
                stream=self.streams[g["stream"]]["name"], streamOid=g["stream"],
                # личное расписание в schedule.json = строки, у которых groupOid входит в этот список
                scheduleGroupOids=[g["oid"], *s["langs"]],
                languageGroups=[dict(groupOid=x, group=self.groups[x]["number"],
                                     language=LANGS[self.groups[x]["language"]][0],
                                     level=self.groups[x]["level"]) for x in s["langs"]]))
        write_text_lf(out / "students.json", json.dumps(studs, ensure_ascii=False, indent=1))
        # Заменяемый файл кабинета: список студентов в виде таблицы для Excel (;, UTF-8 с BOM).
        # Группы указываются названиями — так же, как в колонке group файла schedule.csv.
        with (data / "students.csv").open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh, delimiter=";")
            w.writerow(["ID студента", "Фамилия", "Имя", "Отчество", "Email", "Номер зачётки", "Факультет",
                        "Код факультета", "Курс", "Направление", "Академическая группа",
                        "Языковая группа 1", "Языковая группа 2"])
            for st in studs:
                parts = st["fio"].split(" ", 2) + ["", "", ""]
                langs = [x["group"] for x in st["languageGroups"]] + ["", ""]
                w.writerow([st["studentOid"], parts[0], parts[1], parts[2], st["email"], st["recordBook"],
                            st["faculty"], st["facultyAbbr"], st["course"], st["program"], st["group"],
                            langs[0], langs[1]])
        self.n_rows = len(rows)


DDL = """-- Схема синтетического расписания (SQLite / PostgreSQL-совместимые типы)
-- Поля по mgimo_schedule_schema.md, раздел 4; дополнения отмечены «доп.».
CREATE TABLE faculties (
    faculty_oid INTEGER PRIMARY KEY, faculty_gid TEXT, abbr TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    bell_schedule TEXT NOT NULL CHECK (bell_schedule IN ('A', 'B')));
CREATE TABLE chairs (
    chair_oid INTEGER PRIMARY KEY, name TEXT NOT NULL, abbr TEXT,
    faculty_oid INTEGER REFERENCES faculties(faculty_oid), is_language INTEGER NOT NULL CHECK (is_language IN (0, 1)));
CREATE TABLE buildings (building_oid INTEGER PRIMARY KEY, name TEXT NOT NULL, abbr TEXT, address TEXT NOT NULL);
CREATE TABLE auditorium_types (type_oid INTEGER PRIMARY KEY, name TEXT NOT NULL, abbr TEXT);
CREATE TABLE auditoriums (
    auditorium_oid INTEGER PRIMARY KEY, number TEXT NOT NULL,
    building_oid INTEGER NOT NULL REFERENCES buildings(building_oid),
    type_oid INTEGER NOT NULL REFERENCES auditorium_types(type_oid), capacity INTEGER NOT NULL,
    floor INTEGER,            -- доп.: этаж
    wing INTEGER,             -- доп.: крыло (0/1, только главный корпус)
    purpose TEXT,             -- доп.: назначение служебного помещения (деканат, кафедра…)
    is_bookable INTEGER NOT NULL CHECK (is_bookable IN (0, 1))); -- доп.: 0 — под занятия не используется
CREATE TABLE kinds_of_work (
    kind_oid INTEGER PRIMARY KEY, name TEXT NOT NULL, abbr TEXT NOT NULL,
    is_assessment INTEGER NOT NULL CHECK (is_assessment IN (0, 1)),
    audience_level TEXT NOT NULL CHECK (audience_level IN ('stream', 'group', 'language_group')));
CREATE TABLE disciplines (
    discipline_oid INTEGER PRIMARY KEY, name TEXT NOT NULL, chair_oid INTEGER NOT NULL REFERENCES chairs(chair_oid),
    is_language INTEGER NOT NULL CHECK (is_language IN (0, 1)), hours_per_week REAL NOT NULL,
    assessment TEXT NOT NULL CHECK (assessment IN ('экзамен', 'зачёт', 'зачёт с оценкой')));
-- доп.: учебный план — какие дисциплины на каком курсе и с какой формой контроля
CREATE TABLE curriculum (
    faculty_oid INTEGER NOT NULL REFERENCES faculties(faculty_oid), course INTEGER NOT NULL,
    discipline_oid INTEGER NOT NULL REFERENCES disciplines(discipline_oid),
    language_level TEXT NOT NULL,   -- '' для неязыковых, 'первый' / 'второй' для языков
    pairs_per_week REAL NOT NULL,
    assessment TEXT NOT NULL CHECK (assessment IN ('экзамен', 'зачёт', 'зачёт с оценкой')),
    PRIMARY KEY (faculty_oid, course, discipline_oid, language_level));
CREATE TABLE lecturers (
    lecturer_oid INTEGER PRIMARY KEY, last_name TEXT NOT NULL, first_name TEXT NOT NULL, middle_name TEXT NOT NULL,
    fio TEXT NOT NULL, short_fio TEXT NOT NULL, chair_oid INTEGER NOT NULL REFERENCES chairs(chair_oid),
    rank TEXT NOT NULL CHECK (rank IN ('ассистент', 'ст. преподаватель', 'доцент', 'профессор')),
    degree TEXT, title_full TEXT, email TEXT);
CREATE TABLE programs (
    program_oid INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('бакалавриат', 'магистратура', 'специалитет')),
    form_of_education TEXT NOT NULL CHECK (form_of_education IN ('очная', 'очно-заочная', 'заочная')),
    faculty_oid INTEGER NOT NULL REFERENCES faculties(faculty_oid));
CREATE TABLE groups (
    group_oid INTEGER PRIMARY KEY, group_gid TEXT, number TEXT NOT NULL UNIQUE,
    number_short TEXT,        -- доп.: номер языковой группы без академической, «(5)»
    group_type TEXT NOT NULL CHECK (group_type IN ('academic', 'language')),
    faculty_oid INTEGER NOT NULL REFERENCES faculties(faculty_oid),
    program_oid INTEGER NOT NULL REFERENCES programs(program_oid), course INTEGER NOT NULL,
    admission_year INTEGER NOT NULL, language TEXT,
    language_level TEXT CHECK (language_level IN ('первый', 'второй')),
    parent_group_oid INTEGER REFERENCES groups(group_oid), size INTEGER NOT NULL);
CREATE TABLE subgroups (
    subgroup_oid INTEGER PRIMARY KEY, group_oid INTEGER NOT NULL REFERENCES groups(group_oid),
    name TEXT NOT NULL, size INTEGER NOT NULL);
CREATE TABLE streams (
    stream_oid INTEGER PRIMARY KEY, name TEXT NOT NULL, faculty_oid INTEGER NOT NULL REFERENCES faculties(faculty_oid),
    course INTEGER NOT NULL);
CREATE TABLE stream_groups (
    stream_oid INTEGER NOT NULL REFERENCES streams(stream_oid), group_oid INTEGER NOT NULL REFERENCES groups(group_oid),
    PRIMARY KEY (stream_oid, group_oid));
CREATE TABLE students (
    student_oid INTEGER PRIMARY KEY, last_name TEXT NOT NULL, first_name TEXT NOT NULL, middle_name TEXT NOT NULL,
    fio TEXT NOT NULL, short_fio TEXT NOT NULL, email TEXT NOT NULL UNIQUE, record_book TEXT NOT NULL UNIQUE,
    academic_group_oid INTEGER NOT NULL REFERENCES groups(group_oid));
CREATE TABLE student_groups (
    student_oid INTEGER NOT NULL REFERENCES students(student_oid),
    group_oid INTEGER NOT NULL REFERENCES groups(group_oid), PRIMARY KEY (student_oid, group_oid));
CREATE TABLE schedule_templates (
    template_oid INTEGER PRIMARY KEY, day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
    lesson_number INTEGER NOT NULL CHECK (lesson_number BETWEEN 1 AND 8),
    parity TEXT NOT NULL CHECK (parity IN ('every', 'odd', 'even')),
    discipline_oid INTEGER NOT NULL REFERENCES disciplines(discipline_oid),
    kind_oid INTEGER NOT NULL REFERENCES kinds_of_work(kind_oid),
    lecturer_oid INTEGER NOT NULL REFERENCES lecturers(lecturer_oid),
    auditorium_oid INTEGER REFERENCES auditoriums(auditorium_oid),
    audience_type TEXT NOT NULL CHECK (audience_type IN ('stream', 'group', 'subgroup')), audience_oid INTEGER NOT NULL,
    valid_from TEXT NOT NULL, valid_to TEXT NOT NULL);
CREATE TABLE lessons (
    lesson_oid INTEGER PRIMARY KEY, template_oid INTEGER REFERENCES schedule_templates(template_oid),
    date TEXT NOT NULL, day_of_week INTEGER NOT NULL, week_number INTEGER NOT NULL,
    week_parity TEXT NOT NULL CHECK (week_parity IN ('Н', 'Ч')),
    lesson_number_start INTEGER NOT NULL CHECK (lesson_number_start BETWEEN 1 AND 8),
    lesson_number_end INTEGER NOT NULL CHECK (lesson_number_end BETWEEN 1 AND 8),
    begin_time TEXT NOT NULL, end_time TEXT NOT NULL,
    discipline_oid INTEGER NOT NULL REFERENCES disciplines(discipline_oid),
    kind_oid INTEGER NOT NULL REFERENCES kinds_of_work(kind_oid),
    lecturer_oid INTEGER NOT NULL REFERENCES lecturers(lecturer_oid),
    auditorium_oid INTEGER REFERENCES auditoriums(auditorium_oid),
    is_online INTEGER NOT NULL CHECK (is_online IN (0, 1)), url1 TEXT, url1_description TEXT,
    status TEXT NOT NULL CHECK (status IN ('normal', 'moved', 'cancelled', 'replaced')), note TEXT,
    updated_at TEXT NOT NULL);
CREATE TABLE lesson_audience (
    lesson_oid INTEGER NOT NULL REFERENCES lessons(lesson_oid),
    audience_type TEXT NOT NULL CHECK (audience_type IN ('stream', 'group', 'subgroup')),
    audience_oid INTEGER NOT NULL, PRIMARY KEY (lesson_oid, audience_type, audience_oid));
CREATE TABLE events (
    event_oid INTEGER PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, begin_time TEXT NOT NULL,
    end_time TEXT NOT NULL, auditorium_oid INTEGER REFERENCES auditoriums(auditorium_oid), organizer TEXT,
    description TEXT);
CREATE INDEX ix_lessons_date ON lessons(date);
CREATE INDEX ix_lessons_lecturer ON lessons(lecturer_oid);
CREATE INDEX ix_lessons_auditorium ON lessons(auditorium_oid);
CREATE INDEX ix_lesson_audience ON lesson_audience(audience_type, audience_oid);
CREATE INDEX ix_student_groups_group ON student_groups(group_oid);
CREATE INDEX ix_students_group ON students(academic_group_oid);

-- доп.: личное расписание — к каким занятиям относится каждый студент
-- (занятия его академической группы, его потока и только его языковых групп)
CREATE VIEW student_lessons AS
    SELECT s.student_oid, la.lesson_oid, s.academic_group_oid AS via_group_oid, 'academic' AS via
    FROM students s
    JOIN lesson_audience la ON la.audience_type = 'group' AND la.audience_oid = s.academic_group_oid
    UNION ALL
    SELECT sg.student_oid, la.lesson_oid, sg.group_oid, 'language'
    FROM student_groups sg
    JOIN lesson_audience la ON la.audience_type = 'group' AND la.audience_oid = sg.group_oid
    UNION ALL
    SELECT s.student_oid, la.lesson_oid, s.academic_group_oid, 'stream'
    FROM students s
    JOIN stream_groups st ON st.group_oid = s.academic_group_oid
    JOIN lesson_audience la ON la.audience_type = 'stream' AND la.audience_oid = st.stream_oid;

-- доп.: личное расписание целиком, готовое для кабинета:
--   SELECT * FROM student_schedule WHERE student_oid = ? AND date BETWEEN ? AND ? ORDER BY date, begin_time;
CREATE VIEW student_schedule AS
    SELECT sl.student_oid, st.fio AS student_fio, st.record_book,
           l.lesson_oid, l.date, l.day_of_week, l.week_number, l.week_parity,
           l.lesson_number_start, l.lesson_number_end, l.begin_time, l.end_time,
           d.name AS discipline, k.name AS kind_of_work, k.is_assessment,
           t.short_fio AS lecturer, t.title_full AS lecturer_title, t.email AS lecturer_email,
           a.number AS auditorium, b.name AS building, l.is_online, l.url1, l.url1_description,
           l.status, l.note, l.updated_at,
           g.number AS group_number, sl.via
    FROM student_lessons sl
    JOIN students st ON st.student_oid = sl.student_oid
    JOIN lessons l ON l.lesson_oid = sl.lesson_oid
    JOIN disciplines d ON d.discipline_oid = l.discipline_oid
    JOIN kinds_of_work k ON k.kind_oid = l.kind_oid
    JOIN lecturers t ON t.lecturer_oid = l.lecturer_oid
    LEFT JOIN auditoriums a ON a.auditorium_oid = l.auditorium_oid
    LEFT JOIN buildings b ON b.building_oid = a.building_oid
    JOIN groups g ON g.group_oid = sl.via_group_oid;
"""


# ================================================================== проверки (раздел 10 + доп.)
def validate(out: Path, gen: Generator) -> str:
    con = sqlite3.connect(out / "schedule.sqlite")
    q = lambda sql: con.execute(sql).fetchall()
    res = []

    def check(title, sql, expect_zero=True):
        rows = q(sql)
        n = len(rows)
        ok = (n == 0) if expect_zero else True
        res.append((title, n, ok))
        return rows

    check("1. Преподаватель в двух местах одновременно (по номеру пары, SQL из схемы)", """
        SELECT lecturer_oid, date, lesson_number_start, COUNT(*) FROM lessons WHERE status <> 'cancelled'
        GROUP BY lecturer_oid, date, lesson_number_start HAVING COUNT(*) > 1""")
    check("1b. Преподаватель: пересечение по реальному времени (сетки A и B)", """
        SELECT a.lesson_oid FROM lessons a JOIN lessons b ON a.lecturer_oid = b.lecturer_oid AND a.date = b.date
          AND a.lesson_oid < b.lesson_oid AND a.begin_time < b.end_time AND b.begin_time < a.end_time
        WHERE a.status <> 'cancelled' AND b.status <> 'cancelled'""")
    check("2. Аудитория занята дважды (по номеру пары, SQL из схемы)", """
        SELECT auditorium_oid, date, lesson_number_start, COUNT(*) FROM lessons
        WHERE auditorium_oid IS NOT NULL AND status <> 'cancelled'
        GROUP BY auditorium_oid, date, lesson_number_start HAVING COUNT(*) > 1""")
    check("2b. Аудитория: пересечение по реальному времени", """
        SELECT a.lesson_oid FROM lessons a JOIN lessons b ON a.auditorium_oid = b.auditorium_oid AND a.date = b.date
          AND a.lesson_oid < b.lesson_oid AND a.begin_time < b.end_time AND b.begin_time < a.end_time
        WHERE a.status <> 'cancelled' AND b.status <> 'cancelled'""")
    check("3. Занятия в воскресенье, 04.11 или вне семестра/сессии", """
        SELECT * FROM lessons WHERE day_of_week = 7 OR date = '2026-11-04'
           OR date NOT BETWEEN '2026-09-01' AND '2027-01-31'
           OR (date > '2026-12-31' AND date < '2027-01-11')""")
    check("3b. Занятия в субботу (у нас пятидневка)", "SELECT * FROM lessons WHERE day_of_week = 6")
    check("4. Номер недели не совпадает с датой", """
        SELECT * FROM lessons WHERE week_number <> CAST((julianday(date) - julianday('2026-08-31')) / 7 AS INT) + 1
           OR week_parity <> CASE WHEN week_number % 2 = 1 THEN 'Н' ELSE 'Ч' END
           OR day_of_week <> CASE CAST(strftime('%w', date) AS INT) WHEN 0 THEN 7 ELSE CAST(strftime('%w', date) AS INT) END""")
    check("5. Пересечения у студента (через students / student_groups / stream_groups / lesson_audience)", """
        WITH sl AS (
          SELECT s.student_oid, la.lesson_oid FROM students s
            JOIN lesson_audience la ON la.audience_type = 'group' AND la.audience_oid = s.academic_group_oid
          UNION ALL
          SELECT sg.student_oid, la.lesson_oid FROM student_groups sg
            JOIN lesson_audience la ON la.audience_type = 'group' AND la.audience_oid = sg.group_oid
          UNION ALL
          SELECT s.student_oid, la.lesson_oid FROM students s
            JOIN stream_groups st ON st.group_oid = s.academic_group_oid
            JOIN lesson_audience la ON la.audience_type = 'stream' AND la.audience_oid = st.stream_oid)
        SELECT sl.student_oid, l.date, l.lesson_number_start, COUNT(*) FROM sl JOIN lessons l USING (lesson_oid)
        WHERE l.status <> 'cancelled' GROUP BY 1, 2, 3 HAVING COUNT(*) > 1""")
    check("6. Вместимость аудитории меньше размера аудитории занятия", """
        WITH sz AS (
          SELECT la.lesson_oid, CASE la.audience_type
            WHEN 'stream' THEN (SELECT SUM(g.size) FROM stream_groups sg JOIN groups g USING (group_oid)
                                WHERE sg.stream_oid = la.audience_oid)
            ELSE (SELECT size FROM groups WHERE group_oid = la.audience_oid) END AS n
          FROM lesson_audience la)
        SELECT l.lesson_oid FROM lessons l JOIN sz USING (lesson_oid) JOIN auditoriums a USING (auditorium_oid)
        WHERE a.capacity < sz.n OR a.is_bookable = 0""")
    grid_rows = []
    for f in gen.faculties:
        for n, (b, e) in GRIDS[f["grid"]].items():
            grid_rows.append(f"('{f['abbr']}', {n}, '{b}', '{e}')")
    check("7. Длительность ≠ 80 мин или время не по сетке факультета", f"""
        WITH grid(abbr, n, b, e) AS (VALUES {', '.join(grid_rows)})
        SELECT l.lesson_oid FROM lessons l JOIN lesson_audience la USING (lesson_oid)
          LEFT JOIN streams s ON la.audience_type = 'stream' AND s.stream_oid = la.audience_oid
          LEFT JOIN groups g ON la.audience_type = 'group' AND g.group_oid = la.audience_oid
          JOIN faculties f ON f.faculty_oid = COALESCE(s.faculty_oid, g.faculty_oid)
          LEFT JOIN grid ON grid.abbr = f.abbr AND grid.n = l.lesson_number_start
        WHERE grid.b IS NULL OR grid.b <> l.begin_time OR grid.e <> l.end_time
           OR (CAST(substr(end_time, 1, 2) AS INT) * 60 + CAST(substr(end_time, 4, 2) AS INT))
            - (CAST(substr(begin_time, 1, 2) AS INT) * 60 + CAST(substr(begin_time, 4, 2) AS INT)) <> 80""")
    check("8. Кафедра преподавателя ≠ кафедра дисциплины", """
        SELECT l.lesson_oid FROM lessons l JOIN disciplines d USING (discipline_oid)
          JOIN lecturers t USING (lecturer_oid) WHERE t.chair_oid <> d.chair_oid""")
    check("9a. Лекция не у потока / семинар или язык не у группы", """
        SELECT l.lesson_oid FROM lessons l JOIN kinds_of_work k USING (kind_oid) JOIN lesson_audience la USING (lesson_oid)
        LEFT JOIN groups g ON la.audience_type = 'group' AND g.group_oid = la.audience_oid
        JOIN disciplines d USING (discipline_oid)
        WHERE (k.name = 'Лекция' AND la.audience_type <> 'stream')
           OR (k.name <> 'Лекция' AND la.audience_type <> 'group')
           OR (d.is_language = 1 AND g.group_type <> 'language')
           OR (d.is_language = 0 AND k.name <> 'Лекция' AND g.group_type <> 'academic')""")
    check("9b. Экзамен вне сессии", """
        SELECT * FROM lessons l JOIN kinds_of_work k USING (kind_oid)
        WHERE k.name IN ('Экзамен', 'Консультация') AND l.date NOT BETWEEN '2027-01-11' AND '2027-01-31'""")
    exam_sql = """
        SELECT l.lesson_oid, l.date, l.discipline_oid, la.audience_oid,
               COALESCE(g.parent_group_oid, g.group_oid) AS acad
        FROM lessons l JOIN kinds_of_work k USING (kind_oid) JOIN lesson_audience la USING (lesson_oid)
        JOIN groups g ON g.group_oid = la.audience_oid WHERE k.name = '{}'"""
    exams = q(exam_sql.format("Экзамен"))
    consults = q(exam_sql.format("Консультация"))
    by_acad = defaultdict(set)
    for _, d, _, _, acad in exams:
        by_acad[acad].add(d)
    bad_spacing = 0
    for acad, ds in by_acad.items():
        ds = sorted(dt.date.fromisoformat(x) for x in ds)
        bad_spacing += sum(1 for a, b in zip(ds, ds[1:]) if (b - a).days < 3)
    res.append(("9c. Между экзаменами группы меньше 2 свободных дней (или 2 экзамена в день)", bad_spacing,
                bad_spacing == 0))
    cons = {(aud, disc): dt.date.fromisoformat(d) for _, d, disc, aud, _ in consults}
    bad_cons = 0
    for _, d, disc, aud, _ in exams:
        c = cons.get((aud, disc))
        if c is None or not 1 <= (dt.date.fromisoformat(d) - c).days <= 2:
            bad_cons += 1
    res.append(("9d. Нет консультации за 1–2 дня до экзамена", bad_cons, bad_cons == 0))
    check("10. Нагрузка преподавателя > 18 пар в неделю", """
        SELECT lecturer_oid, week_number, COUNT(*) FROM lessons WHERE status <> 'cancelled' AND date <= '2026-12-31'
        GROUP BY 1, 2 HAVING COUNT(*) > 18""")
    check("11. Размер группы вне диапазона (академ. 18–24, языковая 5–9)", """
        SELECT * FROM groups WHERE (group_type = 'academic' AND size NOT BETWEEN 18 AND 24)
           OR (group_type = 'language' AND size NOT BETWEEN 5 AND 9)""")
    check("11b. Размер группы ≠ числу студентов", """
        SELECT g.group_oid FROM groups g LEFT JOIN (
            SELECT academic_group_oid AS group_oid, COUNT(*) n FROM students GROUP BY 1
            UNION ALL SELECT group_oid, COUNT(*) FROM student_groups GROUP BY 1) c USING (group_oid)
        WHERE c.n IS NULL OR c.n <> g.size""")
    check("11c. Неевропейский язык вторым или английский+английский", """
        SELECT * FROM groups WHERE group_type = 'language' AND language_level = 'второй'
           AND language NOT IN ('английский', 'немецкий', 'французский', 'испанский')""")

    # дневная нагрузка и окна (по академической группе, семестр)
    rows = q("""
        WITH ga AS (
          SELECT la.lesson_oid, g.group_oid AS acad FROM lesson_audience la
            JOIN stream_groups sg ON la.audience_type = 'stream' AND sg.stream_oid = la.audience_oid
            JOIN groups g ON g.group_oid = sg.group_oid
          UNION ALL
          SELECT la.lesson_oid, COALESCE(g.parent_group_oid, g.group_oid) FROM lesson_audience la
            JOIN groups g ON la.audience_type = 'group' AND g.group_oid = la.audience_oid)
        SELECT ga.acad, l.date, l.lesson_number_start FROM ga JOIN lessons l USING (lesson_oid)
        WHERE l.status <> 'cancelled' AND l.date <= '2026-12-31'""")
    days = defaultdict(set)
    for acad, d, n in rows:
        days[(acad, d)].add(n)
    loads = Counter(len(v) for v in days.values())
    wins = Counter(max(v) - min(v) + 1 - len(v) for v in days.values())
    over = sum(c for k, c in loads.items() if k > MAX_PER_DAY)
    res.append(("12. Дней с > 5 пар у группы", over, over == 0))
    wins2 = sum(c for k, c in wins.items() if k > 1)
    res.append(("12b. Дней с > 1 окна у группы (мягкое правило)", wins2, True))

    total = q("SELECT COUNT(*) FROM lessons")[0][0]
    st = dict(q("SELECT status, COUNT(*) FROM lessons GROUP BY status"))
    online = q("SELECT COUNT(*) FROM lessons WHERE is_online = 1")[0][0]
    sem = q("SELECT COUNT(*) FROM lessons WHERE date <= '2026-12-31'")[0][0]
    counts = {t: q(f"SELECT COUNT(*) FROM {t}")[0][0] for t in
              ["faculties", "chairs", "auditoriums", "lecturers", "disciplines", "groups", "streams", "students",
               "schedule_templates", "lessons", "events"]}
    teach_load = q("""SELECT AVG(n), MAX(n) FROM (SELECT lecturer_oid, week_number, COUNT(*) n FROM lessons
                      WHERE date <= '2026-12-31' AND status <> 'cancelled' AND week_number BETWEEN 2 AND 17 GROUP BY 1, 2)""")[0]
    con.close()

    lines = ["# Отчёт проверки сгенерированных данных", "",
             f"seed = {gen.seed}; сформировано {dt.datetime.now():%Y-%m-%d %H:%M}", "",
             "## Жёсткие правила (раздел 6.1 и раздел 10 схемы)", "", "| Проверка | Нарушений | Итог |", "|---|---|---|"]
    for title, n, ok in res:
        lines.append(f"| {title} | {n} | {'OK' if ok else 'ОШИБКА'} |")
    lines += ["", "## Объём", "", "| Таблица | Записей |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in counts.items()]
    lines += [f"| строк в schedule.csv / schedule.json | {gen.n_rows} |", "",
              "## Правдоподобие", "",
              f"- Занятий в семестре: {sem}, в сессии: {total - sem} (экзамены и консультации).",
              f"- Изменения: перенесено {st.get('moved', 0)}, отменено {st.get('cancelled', 0)}, "
              f"замена преподавателя {st.get('replaced', 0)} — {100 * (total - st.get('normal', 0)) / sem:.1f}% занятий семестра.",
              f"- Онлайн-занятий: {online} ({100 * online / sem:.1f}%).",
              f"- Зачётов на зачётной неделе: {gen.credit_count}.",
              f"- Пар у группы в день: " + ", ".join(f"{k} — {v} дн." for k, v in sorted(loads.items())),
              f"- Окон в день: " + ", ".join(f"{k} — {v} дн." for k, v in sorted(wins.items())),
              f"- Нагрузка преподавателя (полные недели): в среднем {teach_load[0]:.1f}, максимум {teach_load[1]} пар в неделю.",
              ]
    return "\n".join(lines) + "\n", all(ok for _, _, ok in res)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Синтетическое расписание «Хогвартса» по mgimo_schedule_schema.md")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", default=str(ROOT / "out"), help="рабочие файлы: SQLite, JSON, справочники")
    ap.add_argument("--data", default=str(DATA), help="заменяемые файлы кабинета: schedule.csv, students.csv")
    args = ap.parse_args(argv)
    out = Path(args.out)
    gen = None
    for attempt in range(20):
        gen = Generator(args.seed + attempt)
        try:
            gen.run()
            break
        except PlacementError as e:
            print(f"seed {args.seed + attempt}: {e}, пробую следующий")
    else:
        raise SystemExit("не удалось построить расписание")
    gen.write(out, Path(args.data))
    report, ok = validate(out, gen)
    write_text_lf(out / "validation_report.md", report)
    if Path(args.data).resolve() == DATA.resolve():
        write_text_lf(ROOT / "validation_report.md", report)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
