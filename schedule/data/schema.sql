-- Схема синтетического расписания (SQLite / PostgreSQL-совместимые типы)
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
