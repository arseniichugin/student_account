/**
 * Ссылка на онлайн-занятие показывается кнопкой, только если это http(s). База не нужна.
 */
import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "@/lib/safe-url";

describe("safeExternalUrl", () => {
  it("http и https — можно", () => {
    expect(safeExternalUrl("https://hogwarts.example.org/meet/1?x=1")).toBe("https://hogwarts.example.org/meet/1?x=1");
    expect(safeExternalUrl(" HTTP://Example.org/a ")).toBe("http://example.org/a");
  });

  it("другие схемы, относительные и битые адреса — null", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.org/x",
      "//evil.example.org/x",
      "/relative/path",
      "https://",
      "not a url",
      "",
      null,
      undefined,
    ]) {
      expect(safeExternalUrl(url)).toBeNull();
    }
  });
});
