/**
 * Небольшой разборщик CSV без зависимостей (RFC 4180):
 * — UTF-8 с BOM и без BOM;
 * — разделитель «;» (по умолчанию) или «,» / табуляция — определяется по строке заголовков;
 * — значения в кавычках, в том числе с разделителем, переводом строки и "" внутри;
 * — пустые строки (в том числе в конце файла) пропускаются.
 */

export type CsvRecord = {
  /** Номер строки файла, с которой начинается запись (заголовок — строка 1). */
  line: number;
  values: string[];
};

export type CsvTable = {
  delimiter: string;
  headers: string[];
  records: CsvRecord[];
};

export class CsvSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

const DELIMITERS = [";", ",", "\t"] as const;

/** Определяет разделитель по первой строке (вне кавычек). При равенстве побеждает «;». */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ";";
  for (const d of DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d;
  return best;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Разбирает CSV целиком. Первая непустая запись — заголовки. */
export function parseCsv(input: string, delimiter?: string): CsvTable {
  const text = stripBom(input);
  const delim = delimiter ?? detectDelimiter(text);
  const rows: CsvRecord[] = [];

  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quotedStartLine = 1;

  const endRecord = () => {
    record.push(field);
    field = "";
    // Пустая строка (или строка из одних разделителей) — не запись.
    if (record.some((v) => v.trim() !== "")) rows.push({ line: recordLine, values: record });
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
      quotedStartLine = line;
    } else if (ch === delim) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw new CsvSyntaxError("кавычка открыта и не закрыта до конца файла", quotedStartLine);
  }
  if (field !== "" || record.length > 0) endRecord();

  const [header, ...records] = rows;
  return {
    delimiter: delim,
    headers: header ? header.values.map((h) => h.trim()) : [],
    records,
  };
}

/** Экранирует значение для CSV с разделителем «;». */
export function csvEscape(value: string, delimiter = ";"): string {
  return /["\n\r]/.test(value) || value.includes(delimiter) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Собирает CSV: UTF-8 с BOM (чтобы Excel открыл кириллицу), разделитель «;», переводы строк CRLF. */
export function toCsv(headers: string[], rows: string[][], delimiter = ";"): string {
  const lines = [headers, ...rows].map((r) => r.map((v) => csvEscape(v, delimiter)).join(delimiter));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
