// Транслитерация кириллицы латиницей для логинов (упрощённая, как в загранпаспортах).
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "yi", є: "ye", ґ: "g",
};

/** «ГР» → «gr», «Мат-Фак» → «mat-fak». Остаются только латиница, цифры, «-» и «_». */
export function translit(value: string): string {
  let out = "";
  for (const ch of value.toLowerCase()) {
    if (ch in MAP) out += MAP[ch];
    else if (/[a-z0-9_-]/.test(ch)) out += ch;
    else if (/\s|\./.test(ch)) out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "");
}
