/**
 * Поиск, набранный латиницей: «25SL0001», «orlova», «jhkjdf» (русское слово в английской раскладке).
 * Чистые функции без базы и без серверного кода — их читают поиск деканата и тесты.
 */
import { translit } from "@/lib/university-data/translit";

/** В строке есть латинские буквы. */
export const hasLatin = (s: string): boolean => /[a-z]/i.test(s);

/** Латинские буквы, которые выглядят как кириллические (номер зачётки «25CЛ0001», набранный вперемешку). */
const LOOKALIKES: Record<string, string> = {
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
};

/** «25CO0001» → «25СО0001»: латинские двойники → кириллица, остальное как есть (в верхнем регистре). */
export function latinLookalikesToCyrillic(s: string): string {
  return [...s.toUpperCase()].map((ch) => LOOKALIKES[ch] ?? ch).join("");
}

/** Клавиши QWERTY → ЙЦУКЕН: «jhkjdf» → «орлова». */
const LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з", "[": "х", "]": "ъ",
  a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "э",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю", "`": "ё",
};

/**
 * Запрос, набранный в английской раскладке, — как он выглядел бы в русской. null — запрос не похож
 * на «русское слово в английской раскладке» (нет латиницы или есть символы вне раскладки, например кириллица).
 */
export function qwertyToCyrillic(s: string): string | null {
  if (!hasLatin(s)) return null;
  let out = "";
  for (const ch of s.toLowerCase()) {
    if (ch in LAYOUT) out += LAYOUT[ch];
    else if (/[\s0-9-]/.test(ch)) out += ch;
    else return null;
  }
  return out;
}

/**
 * Ключ для сравнения «как читается латиницей»: кириллица — транслитом (как в логинах, lib/university-data/translit.ts),
 * латиница — как есть, плюс сглаживание частых разночтений (kh/h, x/ks, w/v, j/y). «Орлова» и «orlova» → «orlova»,
 * «25СЛ0001» и «25sl0001» → «25sl0001». Пустая строка — сравнивать нечего.
 */
export function latinKey(s: string): string {
  return translit(s)
    .replace(/-/g, "")
    .replace(/kh/g, "h")
    .replace(/x/g, "ks")
    .replace(/w/g, "v")
    .replace(/j/g, "y");
}

/** Слово запроса годится для поиска по транслиту: только буквы, цифры и дефис (никаких %, _ и прочих знаков). */
export const isTranslitWord = (w: string): boolean => /^[\p{L}\p{N}-]+$/u.test(w) && latinKey(w) !== "";
