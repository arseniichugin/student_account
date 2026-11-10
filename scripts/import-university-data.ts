/**
 * Импорт данных вуза из заменяемых файлов: students.csv, schedule.csv, campus-map.json.
 *
 *   npm run data:import                         — из data/university
 *   npm run data:import -- --dir путь/к/папке   — из другой папки (или env UNIVERSITY_DATA_DIR)
 *   npm run data:import -- --check              — только проверить файлы, базу не трогать
 *   npm run data:import -- --credentials файл   — куда записать логины и пароли (или env CREDENTIALS_FILE)
 *
 * Переменные окружения: DATABASE_URL, DEMO_PASSWORD (пароль тестовых аккаунтов и деканатов,
 * по умолчанию Hogwarts2026), TEST_STUDENT_LOGINS (логины тестовых студентов через запятую).
 * Формат файлов и что делает импорт — data/university/README.md.
 */
import "dotenv/config";
import path from "node:path";
import { createPrismaClient } from "@/lib/prisma-client";
import { DEFAULT_DEMO_PASSWORD, ImportError, importUniversityData, testLoginsFromEnv } from "@/lib/university-data/import";
import { loadUniversityData, universityDataDir } from "@/lib/university-data/load";
import { formatIssue } from "@/lib/university-data/validate";
import { plural } from "@/lib/utils";

const MAX_ERRORS_SHOWN = 30;
const MAX_WARNINGS_SHOWN = 10;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

const n = (x: number) => x.toLocaleString("ru-RU");

async function main(): Promise<number> {
  const started = Date.now();
  const dir = path.resolve(argValue("--dir") ?? universityDataDir());
  const checkOnly = process.argv.includes("--check");
  const credentialsPath = path.resolve(argValue("--credentials") ?? process.env.CREDENTIALS_FILE ?? "credentials.csv");

  console.log(`Проверяю файлы в ${dir}…`);
  const result = loadUniversityData(dir);

  if (result.warningCount > 0) {
    console.log(`\nПредупреждения (${result.warningCount}) — импорт они не останавливают:`);
    for (const w of result.warnings.slice(0, MAX_WARNINGS_SHOWN)) console.log(`  ⚠ ${formatIssue(w)}`);
    if (result.warningCount > MAX_WARNINGS_SHOWN) console.log(`  …и ещё ${result.warningCount - MAX_WARNINGS_SHOWN}`);
  }

  if (!result.ok) {
    console.error(`\nОшибки в файлах:`);
    for (const e of result.errors.slice(0, MAX_ERRORS_SHOWN)) console.error(`  ✖ ${formatIssue(e)}`);
    if (result.errorCount > MAX_ERRORS_SHOWN) console.error(`  …и ещё ${n(result.errorCount - MAX_ERRORS_SHOWN)}`);
    console.error(`\nНайдено ${n(result.errorCount)} ${plural(result.errorCount, ["ошибка", "ошибки", "ошибок"])}, база не изменена.`);
    console.error("Исправьте файлы и запустите импорт ещё раз. Формат файлов — data/university/README.md.");
    return 1;
  }

  const d = result.data;
  console.log(
    `\nФайлы в порядке:\n` +
      `  students.csv     ${n(d.students.length)} студентов, факультетов ${d.faculties.length}, групп ${d.groups.length}\n` +
      `  schedule.csv     ${n(d.scheduleRows)} ${plural(d.scheduleRows, ["строка", "строки", "строк"])} → ` +
      `${n(d.lessons.length)} занятий, преподавателей ${d.teachers.length}, дисциплин ${d.disciplines.length}\n` +
      `  campus-map.json  корпусов ${d.buildings.filter((b) => b.onMap).length}, аудиторий ${d.rooms.filter((r) => r.onMap).length}`,
  );
  if (checkOnly) {
    console.log("\nРежим --check: база не изменялась.");
    return 0;
  }

  const db = createPrismaClient();
  try {
    console.log("\nЗагружаю в базу (одна транзакция: всё или ничего)…");
    const summary = await importUniversityData(db, d, {
      demoPassword: process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD,
      testLogins: testLoginsFromEnv(),
      credentialsPath,
      log: (m) => console.log(`  ${m}`),
    });

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `\nГотово за ${seconds} с.\n` +
        `  Студентов: ${n(summary.students)} (новых аккаунтов ${n(summary.createdAccounts)}, удалено ${n(summary.removedStudents)})\n` +
        `  Занятий: ${n(summary.lessons)} (связей «занятие — группа» ${n(summary.lessonGroups)})`,
    );
    if (summary.resetTestStudents > 0) {
      console.log(
        `  Бывшим тестовым студентам выдан новый случайный пароль: ${n(summary.resetTestStudents)} ` +
          "(демо-пароль у них больше не работает)",
      );
    }
    if (summary.warnings.length > 0) {
      console.log(`\nПроверьте (${summary.warnings.length}):`);
      for (const w of summary.warnings.slice(0, MAX_WARNINGS_SHOWN)) console.log(`  ⚠ ${w}`);
      if (summary.warnings.length > MAX_WARNINGS_SHOWN) console.log(`  …и ещё ${n(summary.warnings.length - MAX_WARNINGS_SHOWN)}`);
    }
    console.log("\nТестовые аккаунты для жюри (пароль — DEMO_PASSWORD):");
    for (const s of summary.testStudents) {
      console.log(`  студент  ${s.login.padEnd(30)} ${s.fullName}, ${s.faculty}, ${s.course} курс, ${s.group}`);
    }
    for (const s of summary.staff) console.log(`  деканат  ${s.login.padEnd(30)} ${s.fullName}, ${s.faculty}`);
    console.log(process.env.DEMO_PASSWORD ? "  Пароль: из DEMO_PASSWORD" : `  Пароль: ${DEFAULT_DEMO_PASSWORD}`);

    const rows = `${n(summary.credentialsRows)} ${plural(summary.credentialsRows, ["строка", "строки", "строк"])}`;
    console.log(`\nЛогины и пароли (${rows}) записаны в ${summary.credentialsPath}`);
    console.log("  ⚠ Файл содержит пароли: НЕ коммитьте его и не публикуйте. Он уже есть в .gitignore и .dockerignore.");
    return 0;
  } catch (e) {
    if (e instanceof ImportError) {
      console.error(`\n✖ ${e.message}\nБаза не изменена.`);
      return 1;
    }
    console.error("\n✖ Не удалось загрузить данные в базу. Транзакция отменена, база не изменена.");
    console.error(e instanceof Error ? e.message : e);
    return 2;
  } finally {
    await db.$disconnect();
  }
}

main().then((code) => process.exit(code));
