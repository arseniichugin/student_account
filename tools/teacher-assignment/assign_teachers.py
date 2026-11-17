#!/usr/bin/env python3
"""Распределение групп по преподавателям в schedule.csv.

Цель: у каждой пары (группа, дисциплина) — ровно один преподаватель на весь год,
без накладок у преподавателя, только в рамках его дисциплин, с равномерной нагрузкой.

Запуск:
    python3 tools/teacher-assignment/assign_teachers.py [путь к schedule.csv]
    python3 tools/teacher-assignment/assign_teachers.py --check [--strict] [путь]

Исключение: если группы одного потока занимаются дисциплиной параллельно, один
преподаватель на весь поток невозможен — у отделённой группы лекции потока ведёт
лектор потока, а остальные занятия — другой преподаватель (см. README.md).

Только стандартная библиотека. Результат детерминирован.
"""

import argparse
import collections
import csv
import io
import itertools
import statistics
import sys

DEFAULT_PATH = "data/university/schedule.csv"
LECTURER_COLUMNS = ["lecturer", "lecturer_title", "lecturerOid", "lecturerEmail", "lecturer_rank"]
# Вес штрафа за неравномерность нагрузки относительно числа изменённых занятий.
BALANCE_WEIGHT = 1.0
MAX_IMPROVE_ROUNDS = 50
# Сколько единиц одной дисциплины можно отдать вне квалификации, прежде чем сдаться.
MAX_OUTSIDE_PER_DISCIPLINE = 3


# ---------- чтение и запись с сохранением формата ----------

def read_schedule(path):
    raw = open(path, "rb").read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    newline = "\r\n" if "\r\n" in text else "\n"
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=";")
    rows = list(reader)
    header, body = rows[0], rows[1:]
    trailing_newline = text.endswith(newline)
    return {"raw": raw, "has_bom": has_bom, "newline": newline,
            "header": header, "rows": body, "trailing": trailing_newline}


def serialize(data):
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, delimiter=";", lineterminator=data["newline"],
                        quoting=csv.QUOTE_MINIMAL)
    writer.writerow(data["header"])
    writer.writerows(data["rows"])
    text = buf.getvalue()
    if not data["trailing"]:
        text = text[: -len(data["newline"])]
    out = text.encode("utf-8")
    return (b"\xef\xbb\xbf" + out) if data["has_bom"] else out


# ---------- модель ----------

def minutes(value):
    h, m = value.split(":")
    return int(h) * 60 + int(m)


class Model:
    def __init__(self, data):
        self.header = data["header"]
        self.rows = data["rows"]
        col = {name: i for i, name in enumerate(self.header)}
        self.col = col
        missing = [c for c in ["lessonOid", "date", "beginLesson", "endLesson",
                               "discipline", "group"] + LECTURER_COLUMNS if c not in col]
        if missing:
            sys.exit(f"В файле нет колонок: {', '.join(missing)}")

        # Преподаватель: ключ = lecturerOid (или краткое ФИО), значения 5 колонок.
        self.teacher_values = {}
        self.teacher_disciplines = collections.defaultdict(set)
        self.lessons = {}  # lessonOid -> dict
        for idx, row in enumerate(self.rows):
            t = self.teacher_key(row)
            if t and t not in self.teacher_values:
                self.teacher_values[t] = [row[col[c]] for c in LECTURER_COLUMNS]
            lid = row[col["lessonOid"]]
            disc = row[col["discipline"]]
            if t:
                self.teacher_disciplines[t].add(disc)
            les = self.lessons.get(lid)
            if les is None:
                les = self.lessons[lid] = {
                    "id": lid, "date": row[col["date"]],
                    "begin": minutes(row[col["beginLesson"]]),
                    "end": minutes(row[col["endLesson"]]),
                    "discipline": disc, "groups": set(), "rows": [], "teacher": t,
                }
            les["groups"].add(row[col["group"]])
            les["rows"].append(idx)

    def teacher_key(self, row):
        oid = row[self.col["lecturerOid"]].strip()
        return oid or row[self.col["lecturer"]].strip()

    def pair_teachers(self):
        """(группа, дисциплина) -> множество преподавателей по текущим строкам."""
        res = collections.defaultdict(set)
        for row in self.rows:
            key = (row[self.col["group"]], row[self.col["discipline"]])
            res[key].add(self.teacher_key(row))
        return res

    def overlaps(self):
        """Список накладок: (преподаватель, дата, занятие1, занятие2)."""
        by_slot = collections.defaultdict(dict)
        for row in self.rows:
            t = self.teacher_key(row)
            if not t:
                continue
            lid = row[self.col["lessonOid"]]
            by_slot[(t, row[self.col["date"]])][lid] = (
                minutes(row[self.col["beginLesson"]]), minutes(row[self.col["endLesson"]]))
        res = []
        for (t, date), lessons in sorted(by_slot.items()):
            items = sorted(lessons.items(), key=lambda kv: (kv[1], kv[0]))
            for i in range(len(items)):
                for j in range(i + 1, len(items)):
                    if items[j][1][0] >= items[i][1][1]:
                        break
                    res.append((t, date, items[i][0], items[j][0]))
        return res


# ---------- компоненты и конфликты ----------

def _lesson_conflicts(lessons):
    """Пары пересекающихся по времени занятий (разные lessonOid) внутри списка."""
    by_date = collections.defaultdict(list)
    for les in lessons:
        by_date[les["date"]].append(les)
    res = []
    for date in sorted(by_date):
        items = sorted(by_date[date], key=lambda l: (l["begin"], l["end"], l["id"]))
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if items[j]["begin"] >= items[i]["end"]:
                    break
                res.append((items[i], items[j]))
    return res


def _make_unit(units, lessons, pairs, discipline, kind):
    lessons = sorted(lessons, key=lambda l: l["id"])
    units.append({
        "id": len(units), "discipline": discipline, "kind": kind,
        "pairs": set(pairs), "lessons": lessons, "size": len(lessons),
        "orig": collections.Counter(l["teacher"] for l in lessons),
    })


def build_components(model):
    """Единицы назначения: каждой — один преподаватель.

    Обычно единица = компонента связности пар (группа, дисциплина), связанных общими
    занятиями потока. Если у групп потока есть параллельные занятия (две группы одного
    потока занимаются дисциплиной в одно время), один преподаватель на всю компоненту
    невозможен. Тогда компонента делится: «ядро» — лекции потока и все занятия
    наибольшего набора групп без параллельных занятий; каждой оставшейся группе —
    отдельная единица из её собственных (не потоковых) занятий.
    """
    parent = {}

    def find(a):
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for les in model.lessons.values():
        pairs = sorted((g, les["discipline"]) for g in les["groups"])
        root = find(pairs[0])
        for p in pairs[1:]:
            r = find(p)
            if r != root:
                parent[max(r, root)] = min(r, root)
                root = min(r, root)

    comps = collections.defaultdict(list)
    for les in model.lessons.values():
        comps[find((min(les["groups"]), les["discipline"]))].append(les)

    units, splits = [], []
    for root in sorted(comps):
        lessons = comps[root]
        disc = root[1]
        groups = sorted({g for l in lessons for g in l["groups"]})
        clashes = _lesson_conflicts(lessons)
        if not clashes:
            _make_unit(units, lessons, [(g, disc) for g in groups], disc, "whole")
            continue
        # Граф «параллельных» групп: группы a и b пересекаются по времени.
        edges = set()
        for a, b in clashes:
            for ga in a["groups"]:
                for gb in b["groups"]:
                    if ga != gb:
                        edges.add(frozenset((ga, gb)))
        best = None
        for mask in range(1, 1 << len(groups)):
            subset = [g for i, g in enumerate(groups) if mask >> i & 1]
            if any(frozenset((a, b)) in edges for i, a in enumerate(subset) for b in subset[i + 1:]):
                continue
            weight = sum(1 for l in lessons if l["groups"] & set(subset))
            key = (len(subset), weight, [-groups.index(g) for g in subset])
            if best is None or key > best[0]:
                best = (key, subset)
        core = set(best[1])
        core_lessons = [l for l in lessons if len(l["groups"]) > 1 or l["groups"] & core]
        _make_unit(units, core_lessons, [(g, disc) for g in groups], disc, "core")
        for g in groups:
            if g in core:
                continue
            own = [l for l in lessons if l["groups"] == {g}]
            _make_unit(units, own, [(g, disc)], disc, "split")
            splits.append((g, disc))
    return units, splits


def build_conflicts(components):
    """Компоненты одной дисциплины, чьи занятия пересекаются по времени."""
    conflicts = collections.defaultdict(set)
    self_conflicts = []
    by_date = collections.defaultdict(list)
    for c in components:
        for les in c["lessons"]:
            by_date[(c["discipline"], les["date"])].append((les["begin"], les["end"], c["id"], les["id"]))
    for key in sorted(by_date):
        items = sorted(by_date[key])
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if items[j][0] >= items[i][1]:
                    break
                a, b = items[i][2], items[j][2]
                if a == b:
                    self_conflicts.append((a, items[i][3], items[j][3]))
                else:
                    conflicts[a].add(b)
                    conflicts[b].add(a)
    return conflicts, self_conflicts


# ---------- распределение ----------

def unit_fits(unit, intervals_by_date):
    """Не пересекается ли единица с уже занятым временем преподавателя."""
    return all(not (b < les["end"] and les["begin"] < e)
               for les in unit["lessons"] for b, e in intervals_by_date.get(les["date"], ()))


def solve_discipline(comps, teachers, conflicts, busy=None):
    """Назначить каждой компоненте преподавателя из teachers без конфликтов.

    1) DSATUR-перебор с возвратами: сначала самые «стеснённые» компоненты,
       кандидаты — по возрастанию стоимости (изменения + нагрузка).
    2) Локальное улучшение: перенос компоненты к другому преподавателю или обмен
       двух компонент, если это уменьшает целевую функцию.
    """
    ids = [c["id"] for c in comps]
    by_id = {c["id"]: c for c in comps}
    total = sum(c["size"] for c in comps)
    target = total / len(teachers)
    assign = {}
    load = {t: 0 for t in teachers}

    def cost(cid, t):
        c = by_id[cid]
        changes = c["size"] - c["orig"].get(t, 0)
        new_load = load[t] + c["size"]
        over = max(0.0, new_load - target)
        return (changes + BALANCE_WEIGHT * over * c["size"] / max(target, 1), t)

    # Время, уже занятое преподавателем в других дисциплинах (если он ведёт несколько).
    blocked = {(c["id"], t) for c in comps for t in teachers
               if busy and t in busy and not unit_fits(c, busy[t])}

    def feasible(cid, t):
        return (cid, t) not in blocked and all(assign.get(o) != t for o in conflicts[cid])

    sys.setrecursionlimit(10000)
    steps = [0]

    def search():
        if len(assign) == len(ids):
            return True
        steps[0] += 1
        if steps[0] > 200000:
            return False
        best, best_key = None, None
        for cid in ids:
            if cid in assign:
                continue
            options = [t for t in teachers if feasible(cid, t)]
            key = (len(options), -len(conflicts[cid]), -by_id[cid]["size"], cid)
            if best_key is None or key < best_key:
                best, best_key, best_opts = cid, key, options
        if not best_opts:
            return False
        for t in sorted(best_opts, key=lambda t: cost(best, t)):
            assign[best] = t
            load[t] += by_id[best]["size"]
            if search():
                return True
            load[t] -= by_id[best]["size"]
            del assign[best]
        return False

    if not search():
        return None

    def objective():
        changes = sum(by_id[c]["size"] - by_id[c]["orig"].get(t, 0) for c, t in assign.items())
        spread = sum((load[t] - target) ** 2 for t in teachers) / max(target, 1)
        return changes + BALANCE_WEIGHT * spread

    current = objective()
    for _ in range(MAX_IMPROVE_ROUNDS):
        improved = False
        for cid in ids:
            old = assign[cid]
            for t in teachers:
                if t == old or not feasible(cid, t):
                    continue
                size = by_id[cid]["size"]
                assign[cid] = t
                load[old] -= size
                load[t] += size
                val = objective()
                if val < current - 1e-9:
                    current, old, improved = val, t, True
                else:
                    assign[cid] = old
                    load[t] -= size
                    load[old] += size
        # обмен двух компонент между преподавателями
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                ta, tb = assign[a], assign[b]
                if ta == tb:
                    continue
                del assign[a], assign[b]
                ok = feasible(a, tb) and feasible(b, ta)
                if ok:
                    assign[a], assign[b] = tb, ta
                    sa, sb = by_id[a]["size"], by_id[b]["size"]
                    load[ta] += sb - sa
                    load[tb] += sa - sb
                    val = objective()
                    if val < current - 1e-9:
                        current, improved = val, True
                        continue
                    load[ta] -= sb - sa
                    load[tb] -= sa - sb
                assign[a], assign[b] = ta, tb
        if not improved:
            break
    return assign


def assign_all(model):
    components, splits = build_components(model)
    conflicts, self_conflicts = build_conflicts(components)
    if self_conflicts:
        for cid, l1, l2 in self_conflicts[:20]:
            print(f"Занятия {l1} и {l2} одной единицы пересекаются по времени", file=sys.stderr)
        sys.exit("Есть пересечения, которые нельзя развести сменой преподавателя")

    by_disc = collections.defaultdict(list)
    for c in components:
        by_disc[c["discipline"]].append(c)

    disc_teachers = collections.defaultdict(list)
    for t, discs in model.teacher_disciplines.items():
        for d in discs:
            disc_teachers[d].append(t)

    # 1) Каждая дисциплина — только квалифицированными преподавателями. Если это
    #    невозможно, ищем наименьший набор единиц (при равенстве — с наименьшим числом
    #    занятий), без которого распределение существует; эти единицы — на шаг 2.
    result, leftovers = {}, []
    busy = collections.defaultdict(lambda: collections.defaultdict(list))
    by_id = {c["id"]: c for c in components}
    for disc in sorted(by_disc):
        comps = by_disc[disc]
        teachers = sorted(disc_teachers.get(disc, []))
        assign = solve_discipline(comps, teachers, conflicts, busy) if teachers else None
        k = 0
        while assign is None:
            k += 1
            if k > MAX_OUTSIDE_PER_DISCIPLINE or k >= len(comps) or not teachers:
                leftovers.extend(comps)
                assign = {}
                break
            options = sorted(itertools.combinations(comps, k),
                             key=lambda rem: (sum(c["size"] for c in rem), [c["id"] for c in rem]))
            for removed in options:
                rest = [c for c in comps if c not in removed]
                assign = solve_discipline(rest, teachers, conflicts, busy)
                if assign is not None:
                    leftovers.extend(removed)
                    break
        result.update(assign)
        for cid, t in assign.items():
            for les in by_id[cid]["lessons"]:
                busy[t][les["date"]].append((les["begin"], les["end"]))

    # 2) Оставшиеся единицы — преподавателю другой дисциплины, у которого нет накладок
    #    по времени. Кафедры в данных нет, поэтому «та же кафедра» приближена так:
    #    сначала преподаватели той же группы дисциплин (иностранные языки / прочие),
    #    затем — с наименьшей нагрузкой.
    load = collections.Counter()
    for cid, t in result.items():
        load[t] += by_id[cid]["size"]

    def is_language(disc):
        return "язык" in disc.lower()

    outside = []
    for unit in sorted(leftovers, key=lambda c: (-c["size"], c["id"])):
        disc = unit["discipline"]
        qualified = set(disc_teachers.get(disc, []))
        candidates = [t for t in sorted(model.teacher_values) if t not in qualified and unit_fits(unit, busy[t])]
        if not candidates:
            sys.exit(f"Не удалось распределить дисциплину «{disc}» без накладок")
        t = min(candidates, key=lambda t: (
            not any(is_language(d) == is_language(disc) for d in model.teacher_disciplines[t]),
            load[t], t))
        result[unit["id"]] = t
        for les in unit["lessons"]:
            busy[t][les["date"]].append((les["begin"], les["end"]))
        load[t] += unit["size"]
        outside.append((disc, unit, t))
    return components, result, outside, splits


def apply(model, components, assign):
    col = model.col
    changed_rows = 0
    for c in components:
        values = model.teacher_values[assign[c["id"]]]
        for les in c["lessons"]:
            for idx in les["rows"]:
                row = model.rows[idx]
                if [row[col[k]] for k in LECTURER_COLUMNS] != values:
                    changed_rows += 1
                    for k, v in zip(LECTURER_COLUMNS, values):
                        row[col[k]] = v
    return changed_rows


# ---------- проверка и сводка ----------

def stream_clash_groups(model):
    """(группа, дисциплина), у которых есть занятие параллельно с другой группой их потока."""
    stream_mates = collections.defaultdict(set)
    for les in model.lessons.values():
        if len(les["groups"]) > 1:
            for g in les["groups"]:
                stream_mates[(g, les["discipline"])] |= les["groups"] - {g}
    by_disc = collections.defaultdict(list)
    for les in model.lessons.values():
        by_disc[les["discipline"]].append(les)
    res = set()
    for disc, lessons in by_disc.items():
        for a, b in _lesson_conflicts(lessons):
            for ga in a["groups"]:
                for gb in b["groups"]:
                    if gb in stream_mates[(ga, disc)]:
                        res.add((ga, disc))
                        res.add((gb, disc))
    return res


def check(model, strict=False):
    """Возвращает (нарушения, допустимые исключения, накладки).

    Исключение (не нарушение без --strict): у пары два преподавателя — один ведёт только
    лекции потока, другой — все остальные занятия группы, и у группы есть занятие
    параллельно с другой группой того же потока (один преподаватель физически невозможен).
    """
    stream_t = collections.defaultdict(set)
    own_t = collections.defaultdict(set)
    for les in model.lessons.values():
        for g in les["groups"]:
            key = (g, les["discipline"])
            (stream_t if len(les["groups"]) > 1 else own_t)[key].add(les["teacher"])
    clash = stream_clash_groups(model)
    multi, allowed = {}, {}
    for key, ts in model.pair_teachers().items():
        if len(ts) <= 1:
            continue
        ok = (not strict and key in clash and len(stream_t[key]) == 1
              and len(own_t[key]) == 1 and stream_t[key] != own_t[key])
        (allowed if ok else multi)[key] = ts
    return multi, allowed, model.overlaps()


def summary(model, components=None, outside=None, splits=None, changed_rows=None, before=None,
            orig_disciplines=None):
    col = model.col
    lessons_per_teacher = collections.Counter()
    groups_per_teacher = collections.defaultdict(set)
    seen = set()
    for row in model.rows:
        t = model.teacher_key(row)
        lid = row[col["lessonOid"]]
        if (t, lid) not in seen:
            seen.add((t, lid))
            lessons_per_teacher[t] += 1
        groups_per_teacher[t].add(row[col["group"]])
    pairs = model.pair_teachers()
    print(f"Строк: {len(model.rows)}, занятий: {len(model.lessons)}, "
          f"пар (группа, дисциплина): {len(pairs)}")
    if components is not None:
        reassigned = sum(1 for p, ts in before.items() if ts != pairs[p])
        print(f"Единиц назначения (связанных пар): {len(components)}")
        print(f"Пар с несколькими преподавателями до: "
              f"{sum(1 for v in before.values() if len(v) > 1)}")
        print(f"Пар, у которых изменился состав преподавателей: {reassigned}")
        print(f"Изменено строк: {changed_rows}")
        print(f"Пар-исключений (параллельные занятия групп одного потока: лекции потока ведёт "
              f"лектор потока, остальное — отдельный преподаватель): {len(splits)}")
        for g, d in splits:
            print(f"  {g} / {d}")
        print(f"Вне квалификации: {len(outside)}")
        for disc, unit, t in outside:
            groups = ", ".join(sorted(g for g, _ in unit["pairs"]))
            own = "; ".join(sorted(orig_disciplines[t]))
            print(f"  {disc} ({groups}, {unit['size']} занятий) -> "
                  f"{model.teacher_values[t][0]} (ведёт: {own})")
    used = len(lessons_per_teacher)
    loads = sorted(lessons_per_teacher.values())
    gcount = sorted(len(v) for v in groups_per_teacher.values())
    print(f"Задействовано преподавателей: {used} из {len(model.teacher_values)}")
    print(f"Нагрузка (занятий за год): мин {loads[0]}, медиана {statistics.median(loads):g}, "
          f"макс {loads[-1]}")
    print(f"Групп у преподавателя: мин {gcount[0]}, медиана {statistics.median(gcount):g}, "
          f"макс {gcount[-1]}")


def main():
    ap = argparse.ArgumentParser(description="Один преподаватель на пару (группа, дисциплина)")
    ap.add_argument("path", nargs="?", default=DEFAULT_PATH)
    ap.add_argument("--check", action="store_true",
                    help="только проверить требования (код 1 при нарушении)")
    ap.add_argument("--strict", action="store_true",
                    help="с --check: считать нарушением и неустранимые исключения потоков")
    args = ap.parse_args()

    data = read_schedule(args.path)
    if serialize(data) != data["raw"]:
        sys.exit("Файл не удаётся записать байт в байт тем же форматом — остановка")
    model = Model(data)

    if args.check:
        multi, allowed, overlaps = check(model, args.strict)
        summary(model)
        print(f"Неустранимых исключений (параллельные занятия групп потока): {len(allowed)}")
        print(f"Пар с несколькими преподавателями: {len(multi)}")
        for (g, d), ts in sorted(multi.items())[:20]:
            print(f"  {g} / {d}: {', '.join(sorted(ts))}")
        print(f"Накладок у преподавателей: {len(overlaps)}")
        for t, date, a, b in overlaps[:20]:
            print(f"  {model.teacher_values[t][0]} {date}: занятия {a} и {b}")
        sys.exit(1 if multi or overlaps else 0)

    before = model.pair_teachers()
    orig_disciplines = {t: set(d) for t, d in model.teacher_disciplines.items()}
    components, assign, outside, splits = assign_all(model)
    changed_rows = apply(model, components, assign)
    model = Model(data)  # пересобрать по новым значениям
    summary(model, components, outside, splits, changed_rows, before,
            orig_disciplines)
    multi, allowed, overlaps = check(model)
    print(f"Проверка: нарушений «один преподаватель на пару» {len(multi)} "
          f"(+ неустранимых исключений {len(allowed)}), накладок {len(overlaps)}")
    if multi or overlaps:
        sys.exit("Результат не прошёл проверку — файл не записан")
    with open(args.path, "wb") as f:
        f.write(serialize(data))
    print(f"Записано: {args.path}")


if __name__ == "__main__":
    main()
