/**
 * Поиск, набранный латиницей (lib/latin-search.ts): буквы-двойники, раскладка, транслит. База не нужна.
 */
import { describe, expect, it } from "vitest";
import { hasLatin, isTranslitWord, latinKey, latinLookalikesToCyrillic, qwertyToCyrillic } from "@/lib/latin-search";

describe("Поиск латиницей", () => {
  it("латинские двойники → кириллица для номера зачётки", () => {
    expect(latinLookalikesToCyrillic("25CO0001")).toBe("25СО0001");
    expect(latinLookalikesToCyrillic("abcehkmoptxy")).toBe("АВСЕНКМОРТХУ");
    expect(latinLookalikesToCyrillic("25СЛ0001")).toBe("25СЛ0001");
    expect(hasLatin("25СЛ0001")).toBe(false);
    expect(hasLatin("25SL0001")).toBe(true);
  });

  it("английская раскладка → русская; не похоже на раскладку — null", () => {
    expect(qwertyToCyrillic("jhkjdf")).toBe("орлова");
    expect(qwertyToCyrillic("Jhkjdf tdf")).toBe("орлова ева");
    expect(qwertyToCyrillic("orlova")).toBe("щкдщмф");
    expect(qwertyToCyrillic("Орлова")).toBeNull();
    expect(qwertyToCyrillic("o%")).toBeNull();
  });

  it("ключ транслита: кириллица и латиница сравниваются одинаково, % и _ — не слова", () => {
    expect(latinKey("Орлова")).toBe(latinKey("orlova"));
    expect(latinKey("25СЛ0001")).toBe("25sl0001");
    expect(latinKey("25SL0001")).toBe("25sl0001");
    expect(latinKey("Харитонов")).toBe(latinKey("Haritonov"));
    expect(isTranslitWord("orlova")).toBe(true);
    expect(isTranslitWord("%")).toBe(false);
    expect(isTranslitWord("o_")).toBe(false);
  });
});
