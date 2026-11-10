/*
 * Интерактивная карта кампуса «Хогвартса» для личного кабинета. Без зависимостей.
 * Подключение: campus-map.css, затем campus-data.js (window.CAMPUS_DATA) или данные из campus-data.json,
 * затем этот файл.
 *   const map = HogwartsMap.mount(document.getElementById('map'), { data: window.CAMPUS_DATA, onSelect });
 *   map.focus('1047');      // открыть аудиторию из расписания; ссылка page.html#room=1047 делает то же
 *   map.destroy();          // убрать карту из контейнера (например, при размонтировании компонента)
 *
 * Параметры mount: data — { buildings, rooms }; onSelect(room) — пользователь выбрал помещение;
 * onClear() — закрыл карточку помещения; hash: false — не читать и не менять #room=… в адресе
 * (в кабинете адресом управляет страница: /map?room=…); headingLevel — уровень заголовка плана
 * (по умолчанию 2: на странице над картой есть h1); insets() — { top, bottom }: сколько пикселей
 * сверху и снизу окна закрыто шапкой и нижним меню (чтобы выбранная аудитория не пряталась под ними).
 *
 * Доступность: фокус после перерисовки возвращается на нажатую кнопку; после выбора помещения —
 * на заголовок карточки; Esc закрывает карточку, фокус — на ячейку аудитории.
 *
 * Безопасность: данные карты заменяемые, значит недоверенные. В DOM они попадают ТОЛЬКО через
 * textContent и setAttribute (функции h() и el()) — браузер не разбирает их как HTML.
 * Не используйте innerHTML / insertAdjacentHTML / outerHTML: тест tests/campus-map.test.ts это проверяет.
 *
 * Нумерация (как в генераторе расписания):
 *   Главный корпус — ЭКNN: этаж 1–4, крыло 0 (западное) / 1 (восточное), номер 01–79;
 *   Второй корпус — ЭNN: этаж 1–5, номер 01–45; Обсерватория-N, Манеж-N — отдельные здания.
 * Раскладка этажа (по образцу поэтажных планов МГИМО): номера идут от холла по внешней стороне
 * коридора до торца и возвращаются по внутренней стороне; ширина кабинета зависит от его размера.
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const TYPE_CLASS = {
    'Лекционная': 'lec', 'Семинарская': 'sem', 'Лингафонный кабинет': 'lang', 'Компьютерный класс': 'comp',
    'Лаборатория': 'lab', 'Обсерватория': 'obs', 'Манеж': 'man', 'Административное помещение': 'adm'
  };
  const LEGEND = [
    ['dean', 'Деканаты'], ['chair', 'Кафедры'], ['lec', 'Лекционные залы'], ['sem', 'Семинарские'],
    ['lang', 'Лингафонные'], ['lab', 'Лаборатории'], ['comp', 'Компьютерные'], ['obs', 'Обсерватория'],
    ['man', 'Манеж'], ['adm', 'Администрация и службы']
  ];
  const WIDTH = { lec: 92, lab: 62, comp: 58, sem: 50, lang: 38, adm: 38, dean: 46, chair: 38 };
  const DEPTH = 62, COR = 26, CAP = 46, WALL = 5, TECH = 50;
  const WING = { 0: 'западное крыло', 1: 'восточное крыло' };

  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const cat = r => r.purpose && /^Деканат/.test(r.purpose) ? 'dean'
    : r.purpose && /^Кафедра/.test(r.purpose) ? 'chair' : (own(TYPE_CLASS, r.type) ? TYPE_CLASS[r.type] : 'sem');
  const seq = r => { const m = r.number.match(/(\d{2})$/); return m ? +m[1] : 0; };
  const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, cls, parent, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* Порядок кабинетов в блоке: первая половина — внешняя сторона (от холла к торцу),
     вторая — внутренняя (от торца обратно к холлу). */
  function splitSides(list) {
    const s = list.slice().sort((a, b) => seq(a) - seq(b));
    // делим по длине, а не по количеству: стороны коридора выходят почти равными, вставок меньше
    const total = sideLen(s);
    let k = 0, acc = 0, best = Infinity;
    for (let i = 0; i <= s.length; i++) {
      const d = Math.abs(total - 2 * acc);
      if (d < best) { best = d; k = i; }
      if (i < s.length) acc += WIDTH[cat(s[i])];
    }
    return { outer: s.slice(0, k), inner: s.slice(k) };
  }
  function sideLen(list) { return list.reduce((a, r) => a + WIDTH[cat(r)], 0); }

  /* Раскладка одной стороны коридора: кабинеты по возрастанию + технические помещения.
     Свободная длина уходит под технические помещения нормального размера (не больше одного на четыре
     кабинета, ширина 40–70); остаток слегка расширяет кабинеты — узких полосок не бывает. */
  function layoutSide(sideList, L) {
    const items = sideList.map(r => ({ r, w: WIDTH[cat(r)] }));
    const gap = L - sideLen(sideList);
    const n = Math.min(Math.round(gap / TECH), Math.max(1, Math.round(sideList.length / 4)));
    const tw = n ? Math.min(Math.max(gap / n, 40), 70) : 0;
    const rest = gap - n * tw;
    if (items.length) items.forEach(it => { it.w += rest / items.length; });
    for (let k = 0; k < n; k++) {
      const at = Math.min(items.length, Math.round((k + 1) * (items.length - k) / (n + 1)) + k);
      items.splice(at, 0, { tech: true, w: tw });
    }
    return items;
  }

  let mountNo = 0;
  const narrowOf = el => el.clientWidth > 0 && el.clientWidth < 700;

  function mount(root, opts) {
    opts = opts || {};
    const data = opts.data || window.CAMPUS_DATA;
    if (!data) throw new Error('HogwartsMap: нет данных (campus-data.js / campus-data.json)');
    const useHash = opts.hash !== false;
    const LEVEL = Math.min(Math.max(opts.headingLevel || 2, 1), 5);
    const hx = (offset) => 'h' + Math.min(LEVEL + offset, 6);
    const insets = () => { try { return Object.assign({ top: 0, bottom: 0 }, opts.insets && opts.insets()); } catch { return { top: 0, bottom: 0 }; } };
    const uid = 'hm' + (++mountNo);
    const B = Object.fromEntries(data.buildings.map(b => [b.id, b]));
    // помещения неизвестного корпуса пропускаем, а не падаем на них
    const rooms = data.rooms.filter(r => own(B, r.building));
    rooms.forEach(r => { r.floor = r.floor || 1; });
    const byNumber = Object.fromEntries(rooms.map(r => [norm(r.number), r]));
    const state = { building: null, floor: 1, selected: null, filter: new Set() };

    root.classList.add('hm');
    root.replaceChildren();
    const bar = h('div', 'hm-bar', root);
    const search = h('input', 'hm-search', bar);
    Object.assign(search, { type: 'search', placeholder: 'Аудитория, деканат, кафедра…' });
    search.setAttribute('aria-label', 'Поиск помещения');
    search.setAttribute('aria-controls', uid + '-results');
    const bSel = h('select', 'hm-select', bar); bSel.setAttribute('aria-label', 'Корпус');
    h('option', null, bSel, 'Весь кампус').value = '';
    data.buildings.forEach(b => { h('option', null, bSel, b.name).value = b.id; });
    // этажи — кнопки-переключатели (aria-pressed): вкладок с панелями здесь нет
    const fTabs = h('div', 'hm-floors', bar); fTabs.setAttribute('role', 'group'); fTabs.setAttribute('aria-label', 'Этаж');
    const results = h('ul', 'hm-results', root); results.hidden = true; results.id = uid + '-results';
    // число найденного озвучивается экранным диктором
    const live = h('p', 'hm-sr', root); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    const campusBox = h('div', 'hm-campus', root);
    const stage = h('div', 'hm-stage', root);
    const crumbs = h('div', 'hm-crumbs', stage);
    const legend = h('div', 'hm-legend', stage);
    const svgWrap = h('div', 'hm-svg', stage);
    // карточка — сразу под планом: на телефоне аудитория и её описание помещаются на одном экране
    const card = h('aside', 'hm-card', stage); card.hidden = true; card.setAttribute('aria-labelledby', uid + '-card-title');
    const about = h('div', 'hm-about', stage);
    const dir = h('details', 'hm-dir', root);

    const notice = h('p', 'hm-notice', root); notice.hidden = true; root.insertBefore(notice, results);
    const chips = {};
    state.fit = narrowOf(root);   // на узком экране этаж сразу вписан по ширине
    LEGEND.forEach(([cls, name]) => {
      const b = h('button', 'hm-chip t-' + cls, legend);
      chips[cls] = b;
      h('i', null, b); h('span', null, b, name);
      b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.onclick = () => {
        if (state.filter.has(cls)) state.filter.delete(cls); else state.filter.add(cls);
        b.setAttribute('aria-pressed', state.filter.has(cls));
        render();
      };
    });
    h('summary', null, dir, 'Все деканаты и кафедры');
    [['dean', 'Деканаты'], ['chair', 'Кафедры']].forEach(([c, title]) => {
      h(hx(0), null, dir, title);
      const ul = h('ul', null, dir);
      rooms.filter(r => cat(r) === c).sort((a, b) => a.purpose.localeCompare(b.purpose, 'ru')).forEach(r => {
        const b = h('button', 'hm-dir-item t-' + c, h('li', null, ul)); b.type = 'button';
        h('span', null, b, r.purpose);
        h('small', null, b, `${r.number} · ${B[r.building].abbr}, ${r.floor} эт.`);
        b.onclick = () => select(r, 'list');
      });
    });

    function setView(bid, floor) {
      state.building = bid || null;
      state.floor = floor || (bid ? B[bid].floors[0] : 1);
      bSel.value = state.building || '';
      render();
    }

    /* ---------------- изометрическая схема кампуса ---------------- */
    const BOXES = {
      main: [[100, 0, 380, 70, 4], [100, 70, 160, 330, 4], [320, 70, 380, 330, 4], [215, -26, 265, 0, 1]],
      second: [[490, -10, 720, 50, 5], [380, 16, 490, 32, 2]],
      obs: [[-40, -240, 20, -180, 7], [-28, -228, 8, -192, 9]],
      manege: [[470, 170, 720, 260, 2]]
    };
    const ISO = (x, y, z) => [(x - y) * 0.866, (x + y) * 0.5 - z];
    function drawCampus() {
      campusBox.replaceChildren();
      const svg = el('svg', { class: 'hm-iso', viewBox: '-230 -330 900 640', role: 'img', 'aria-label': 'Схема кампуса' }, campusBox);
      const pts = arr => arr.map(p => p.join(',')).join(' ');
      el('polygon', { points: pts([ISO(-130, -290, 0), ISO(820, -290, 0), ISO(820, 440, 0), ISO(-130, 440, 0)]), class: 'hm-iso-ground' }, svg);
      // улица и пешеходные дорожки — только между реальными входами и выходами зданий
      const line = (ptsArr, cls) => el('polyline', { points: pts(ptsArr.map(([x, y]) => ISO(x, y, 0))), class: cls }, svg);
      line([[-130, 410], [820, 410]], 'hm-iso-street');
      // площадь перед главным входом (северный фасад холла)
      el('polygon', { points: pts([ISO(150, -150, 0), ISO(330, -150, 0), ISO(330, -4, 0), ISO(150, -4, 0)]), class: 'hm-iso-plaza' }, svg);
      const pl = ISO(240, -95, 0);
      el('text', { x: pl[0], y: pl[1] + 4, 'text-anchor': 'middle', class: 'hm-iso-plaza-t' }, svg, 'Площадь');
      [
        [[124, 0], [124, -150]],                           // выход ГК к обсерватории
        [[-10, -180], [-10, -150], [760, -150]],           // от обсерватории вдоль площади и северного фасада
        [[760, -150], [760, 410]],                         // восточная аллея к Замковой ул.
        [[520, 50], [520, 120], [760, 120]],               // выход Второго корпуса на улицу
        [[690, 260], [690, 410]],                          // вход в манеж с Замковой ул.
        [[60, -150], [60, 410]]                            // западная аллея к улице
      ].forEach(pth => line(pth, 'hm-iso-road'));
      const st = ISO(230, 410, 0);
      el('text', { x: st[0], y: st[1] + 26, class: 'hm-iso-street-t', 'text-anchor': 'middle', transform: `rotate(30 ${st[0]} ${st[1] + 26})` }, svg, 'Замковая ул.');
      const ids = Object.keys(BOXES).filter(id => own(B, id));   // корпуса, которых нет в данных, не рисуем
      const all = [];
      ids.forEach(id => BOXES[id].forEach(bx => all.push({ id, bx })));
      all.sort((a, b) => (a.bx[0] + a.bx[1] + a.bx[2] + a.bx[3]) - (b.bx[0] + b.bx[1] + b.bx[2] + b.bx[3]));
      const groups = {};
      ids.forEach(id => {
        const g = el('g', { class: 'hm-iso-bld' + (state.building === id ? ' sel' : ''), tabindex: 0, role: 'button',
          'aria-label': B[id].name, 'aria-pressed': String(state.building === id), 'data-bid': id });
        const open = () => { setView(id); refocus('.hm-iso-bld[data-bid="' + id + '"]', campusBox); };
        g.onclick = open;
        g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
        el('title', null, g, B[id].name);
        groups[id] = g;
      });
      // невидимая область нажатия вокруг корпуса: на телефоне башня обсерватории и манеж меньше пальца
      ids.forEach(id => {
        const [x0, y0, x1, y1, fl] = BOXES[id][0], m = id === 'obs' ? 60 : 20, z = fl * 14 + m;
        const hull = [ISO(x0 - m, y0 - m, z), ISO(x1 + m, y0 - m, z), ISO(x1 + m, y0 - m, 0), ISO(x1 + m, y1 + m, 0), ISO(x0 - m, y1 + m, 0), ISO(x0 - m, y1 + m, z)];
        el('polygon', { class: 'hm-hit', points: pts(hull) }, groups[id]);
      });
      all.forEach(({ id, bx }) => {
        const [x0, y0, x1, y1, fl] = bx, z = fl * 14, g = groups[id];
        svg.appendChild(g);
        el('polygon', { class: 'f-s', points: pts([ISO(x0, y1, 0), ISO(x1, y1, 0), ISO(x1, y1, z), ISO(x0, y1, z)]) }, g);
        el('polygon', { class: 'f-e', points: pts([ISO(x1, y0, 0), ISO(x1, y1, 0), ISO(x1, y1, z), ISO(x1, y0, z)]) }, g);
        el('polygon', { class: 'f-t', points: pts([ISO(x0, y0, z), ISO(x1, y0, z), ISO(x1, y1, z), ISO(x0, y1, z)]) }, g);
      });
      const labels = { main: [240, 200, 56], second: [605, 20, 70], obs: [-10, -210, 126], manege: [595, 215, 28] };
      Object.entries(labels).filter(([id]) => own(B, id)).forEach(([id, [x, y, z]]) => {
        const [lx, ly] = ISO(x, y, z);
        el('text', { x: lx, y: ly, class: 'hm-iso-letter' + (state.building === id ? ' sel' : ''), 'text-anchor': 'middle' }, svg, B[id].abbr);
      });
      const bb = svg.getBBox ? (() => { try { return svg.getBBox(); } catch { return null; } })() : null;
      if (bb && bb.width) svg.setAttribute('viewBox', `${bb.x - 30} ${bb.y - 40} ${bb.width + 60} ${bb.height + 70}`);
      campusBox.classList.toggle('compact', !!state.building);
      const cap = h('p', 'hm-iso-cap', campusBox, state.building ? '' : 'Нажмите на корпус, чтобы открыть поэтажный план');
      if (state.building) cap.remove();
    }

    /* ---------------- поэтажный план ---------------- */
    function roomCell(svg, r, x, y, w, hgt) {
      const c = cat(r);
      const dim = state.filter.size && !state.filter.has(c);
      const g = el('g', {
        class: `hm-room t-${c}${dim ? ' dim' : ''}${state.selected === r ? ' sel' : ''}`,
        tabindex: 0, role: 'button', 'aria-label': `${r.number}, ${r.purpose || r.type}`, 'data-number': r.number
      }, svg);
      if (state.selected === r) g.setAttribute('aria-current', 'true');
      el('rect', { x, y, width: w, height: hgt }, g);
      const badge = { dean: 'Д', chair: 'К', adm: 'С' }[c];
      const vertical = w < 40 && hgt > w;
      // номер отодвигаем от значка в правом верхнем углу
      const tx = x + w / 2 - (badge && !vertical ? 5 : 0), ty = y + hgt / 2 + (badge && vertical ? 7 : 0);
      if (r.building === 'obs' || r.building === 'manege') {   // длинные названия — в две строки
        const [name, no] = r.number.split('-');
        const t = el('text', { x: tx, y: ty - 8, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
        el('tspan', { x: tx, dy: 0 }, t, name);
        el('tspan', { x: tx, dy: 18 }, t, '№ ' + no);
      } else {
        el('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          transform: vertical ? `rotate(-90 ${tx} ${ty})` : null }, g, r.number);
      }
      if (badge) {
        const bx = x + w - 9, by = y + 9;
        el('circle', { cx: bx, cy: by, r: 7, class: 'hm-badge' }, g);
        el('text', { x: bx, y: by, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-badge-t' }, g, badge);
      }
      el('title', null, g, `${r.number} — ${r.purpose || r.type}${r.bookable ? `, ${r.capacity} мест` : ''}`);
      g.onclick = () => select(r, 'plan');
      g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r, 'plan'); } };
    }
    const TECH_NAMES = ['Кладовая', 'Техническое помещение', 'Подсобное помещение', 'Электрощитовая', 'Хозблок'];
    let techNo = 0;
    function techCell(svg, x, y, w, hgt) {
      const g = el('g', { class: 'hm-tech' }, svg);
      el('rect', { x, y, width: w, height: hgt, class: 'hm-filler' }, g);
      const vertical = w < 40 && hgt > w;
      el('text', { x: x + w / 2, y: y + hgt / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-tech-t',
        transform: vertical ? `rotate(-90 ${x + w / 2} ${y + hgt / 2})` : null }, g, 'тех.');
      el('title', null, g, TECH_NAMES[techNo++ % TECH_NAMES.length]);
    }
    function service(svg, kind, x, y, w, hgt, label) {
      const g = el('g', { class: 'hm-svc' }, svg);
      el('rect', { x, y, width: w, height: hgt }, g);
      const cx = x + w / 2, cy = y + hgt / 2;
      if (kind === 'stairs') {
        for (let i = 1; i < 6; i++) el('line', { x1: x + 4, x2: x + w - 4, y1: y + i * hgt / 6, y2: y + i * hgt / 6, class: 'hm-steps' }, g);
        el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-svc-t big' }, g, '⇅');
      } else if (kind === 'wc') {
        el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-svc-t' }, g, 'WC');
      } else if (kind === 'vest') {
        g.setAttribute('class', 'hm-svc hm-vest');
        el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-cor-t' }, g, 'Вход');
      } else if (kind === 'lift') {
        el('rect', { x: cx - 9, y: cy - 9, width: 18, height: 18, class: 'hm-lift' }, g);
        el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-svc-t' }, g, '⇵');
      }
      el('title', null, g, label || { stairs: 'Лестница', wc: 'Туалеты', lift: 'Лифт', vest: 'Тамбур, выход на улицу' }[kind]);
    }
    function door(svg, x, y, w, hgt) { el('rect', { x, y, width: w, height: hgt, class: 'hm-door' }, svg); }
    function exitArrow(svg, x, y, dir, label) {
      const g = el('g', { class: 'hm-exit' }, svg);
      const d = { up: 'M0 14 L0 -2 M-8 6 L0 -4 L8 6', down: 'M0 -14 L0 2 M-8 -6 L0 4 L8 -6', left: 'M14 0 L-2 0 M6 -8 L-4 0 L6 8', right: 'M-14 0 L2 0 M-6 -8 L4 0 L-6 8' }[dir];
      el('path', { d, transform: `translate(${x} ${y})` }, g);
      const ty = dir === 'up' ? y - 14 : dir === 'down' ? y + 26 : y + 24;
      label.split('\n').forEach((t, i) => el('text', { x, y: ty + i * 13, 'text-anchor': 'middle', class: 'hm-exit-t' }, g, t));
    }

    /* Блок коридорного типа: стены, коридор, две стороны кабинетов, торцевые лестницы. */
    function block(svg, list, x, y, orient, minLen, caps) {
      const { outer, inner } = splitSides(list);
      const L = Math.max(sideLen(outer), sideLen(inner), minLen);
      const W = DEPTH * 2 + COR, capA = caps[0] ? CAP : 0, capB = caps[1] ? CAP : 0;
      const len = capA + L + capB;
      const R = orient === 'v' ? { x, y, w: W, h: len } : { x, y, w: len, h: W };
      el('rect', { x: R.x, y: R.y, width: R.w, height: R.h, class: 'hm-floorplate' }, svg);
      const place = (side, sideList, reverse) => {
        // side 0 — слева (план вертикальный) / сверху (горизонтальный), side 1 — справа / снизу
        const items = layoutSide(sideList, L);
        let pos = 0;
        (reverse ? items.slice().reverse() : items).forEach(it => {
          if (it.tech) techCell(svg, ...rect(side, pos, it.w)); else roomCell(svg, it.r, ...rect(side, pos, it.w));
          pos += it.w;
        });
      };
      function rect(side, from, size) {
        const off = side === 0 ? 0 : DEPTH + COR;
        return orient === 'v' ? [x + off, y + capA + from, DEPTH, size] : [x + capA + from, y + off, size, DEPTH];
      }
      place(0, outer, false);
      place(1, inner, false);
      el('text', orient === 'v'
        ? { x: x + DEPTH + COR / 2, y: y + capA + L / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-cor-t', transform: `rotate(-90 ${x + DEPTH + COR / 2} ${y + capA + L / 2})` }
        : { x: x + capA + L / 2, y: y + DEPTH + COR / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hm-cor-t' }, svg, caps.label || '');
      caps.forEach((c, i) => {
        if (!c) return;
        const at = i === 0 ? 0 : capA + L;
        const half = (W - COR) / 2;
        if (orient === 'v') { service(svg, c[0], x, y + at, half, CAP); service(svg, c[1], x + half + COR, y + at, half, CAP); }
        else { service(svg, c[0], x + at, y, CAP, half); service(svg, c[1], x + at, y + half + COR, CAP, half); }
      });
      el('rect', { x: R.x, y: R.y, width: R.w, height: R.h, class: 'hm-wall' }, svg);
      return R;
    }

    function blockLen(b) { return buildingLen(b) + (b.id === 'second' ? 2 * TECH : TECH); }
    function routeOf(room) {
      const b = B[room.building];
      if (room.building === 'obs') return `${b.name} — отдельная башня (${b.address}), вход с южной стороны, от Главного корпуса по западной аллее.`;
      if (room.building === 'manege') return `${b.name} — отдельное здание (${b.address}), вход с Замковой ул. в восточной части фасада.`;
      const block = rooms.filter(r => r.building === b.id && r.floor === room.floor && (b.id !== 'main' || r.wing === room.wing));
      const { outer, inner } = splitSides(block);
      const side = outer.includes(room) ? 0 : 1;
      const doorNo = layoutSide(side === 0 ? outer : inner, blockLen(b)).findIndex(it => it.r === room) + 1;
      if (b.id === 'main') {
        // идём из холла на юг: левый ряд плана (запад) — по правую руку
        const yard = (room.wing === 0) === (side === 1);
        return `${b.name} → ${room.floor} этаж → из центрального холла в ${WING[room.wing]} → ` +
          `${doorNo}-я дверь по ${side === 0 ? 'правую' : 'левую'} руку, считая технические (окна ${yard ? 'во внутренний двор' : 'на улицу'}).`;
      }
      return `${b.name} → ${room.floor} этаж → от западной лестницы${room.floor === 1 ? ' и входа' : ''} на восток → ` +
        `${doorNo}-я дверь по ${side === 0 ? 'левую руку, северная' : 'правую руку, южная'} сторона, считая технические.`;
    }
    // длина крыла одна на все этажи корпуса — этажи совпадают по контуру
    function buildingLen(b) {
      let m = 0;
      b.floors.forEach(f => b.wings.forEach(w => {
        const s = splitSides(rooms.filter(r => r.building === b.id && r.floor === f && (w == null || r.wing === w)));
        m = Math.max(m, sideLen(s.outer), sideLen(s.inner));
      }));
      return m;
    }
    function drawFloor(svg) {
      const b = B[state.building], f = state.floor;
      const list = rooms.filter(r => r.building === b.id && r.floor === f);
      let W = 900, H = 700;
      if (b.id === 'main') {
        const w0 = list.filter(r => r.wing === 0), w1 = list.filter(r => r.wing === 1);
        const L = blockLen(b);
        const BW = DEPTH * 2 + COR, GAP = 230, HALLH = 120, X0 = 70, Y0 = 70;
        const hallW = BW * 2 + GAP;
        // центральный холл: лестницы, лифты, туалеты, вестибюль
        el('rect', { x: X0, y: Y0, width: hallW, height: HALLH, class: 'hm-floorplate' }, svg);
        service(svg, 'stairs', X0, Y0, 56, HALLH / 2);
        service(svg, 'wc', X0, Y0 + HALLH / 2, 56, HALLH / 2);
        service(svg, 'stairs', X0 + hallW - 56, Y0, 56, 44);
        service(svg, 'wc', X0 + hallW - 56, Y0 + HALLH - 44, 56, 44);   // между ними — проход к галерее
        // лифты у южной стены холла между проходами в крылья, северная стена свободна под входы
        service(svg, 'lift', X0 + hallW / 2 - 50, Y0 + HALLH - 44, 40, 40);
        service(svg, 'lift', X0 + hallW / 2 + 10, Y0 + HALLH - 44, 40, 40);
        el('text', { x: X0 + hallW / 2, y: Y0 + 46, 'text-anchor': 'middle', class: 'hm-hall-t' }, svg, f === 1 ? 'Вестибюль' : 'Центральный холл');
        el('rect', { x: X0, y: Y0, width: hallW, height: HALLH, class: 'hm-wall' }, svg);
        const DW = 44;
        if (f === 1) {   // главный вход — по центру северной стены
          door(svg, X0 + hallW / 2 - DW / 2, Y0 - 3, DW, 6);
          exitArrow(svg, X0 + hallW / 2, Y0 - 30, 'up', 'Главный вход');
          door(svg, X0 + 80, Y0 - 3, DW, 6);   // западный выход — к обсерватории
          exitArrow(svg, X0 + 80 + DW / 2, Y0 - 30, 'up', 'Выход к обсерватории');
        }
        if (f <= 2) {    // галерея — направо из восточного торца холла, между лестницей и туалетом
          door(svg, X0 + hallW - 3, Y0 + 46, 6, HALLH - 92);
          exitArrow(svg, X0 + hallW + 62, Y0 + HALLH / 2, 'right', 'Галерея\nво Второй корпус');
        }
        const capsW = [null, ['stairs', 'wc']]; capsW.label = `Западное крыло · ${f}0NN`;
        const capsE = [null, ['wc', 'stairs']]; capsE.label = `Восточное крыло · ${f}1NN`;
        block(svg, w0, X0, Y0 + HALLH - WALL, 'v', L, capsW);
        block(svg, w1, X0 + BW + GAP, Y0 + HALLH - WALL, 'v', L, capsE);
        // проёмы из холла в крылья
        el('rect', { x: X0 + DEPTH + 2, y: Y0 + HALLH - WALL - 2, width: COR - 4, height: WALL + 4, class: 'hm-door' }, svg);
        el('rect', { x: X0 + BW + GAP + DEPTH + 2, y: Y0 + HALLH - WALL - 2, width: COR - 4, height: WALL + 4, class: 'hm-door' }, svg);
        const cy = Y0 + HALLH + L / 2 + CAP / 2;
        el('text', { x: X0 + BW + GAP / 2, y: cy, 'text-anchor': 'middle', class: 'hm-yard' }, svg, 'Внутренний двор');
        W = X0 + hallW + 140; H = Y0 + HALLH + L + CAP + 40;
      } else if (b.id === 'second') {
        const L = blockLen(b);
        const X0 = 160, Y0 = 60;
        const caps = [['stairs', f === 1 ? 'vest' : 'wc'], ['wc', 'stairs']]; caps.label = `${f} этаж · ${f}NN`;
        const R = block(svg, list, X0, Y0, 'h', L, caps);
        if (f === 1) {  // вход с улицы — южная стена левого торца, через тамбур
          door(svg, X0 + 8, Y0 + R.h - 3, CAP - 16, 6);
          exitArrow(svg, X0 + CAP / 2, Y0 + R.h + 18, 'down', 'Выход на улицу');
        }
        if (f <= 2) {   // галерея входит в торец коридора, между лестницей и туалетом
          door(svg, X0 - 3, Y0 + DEPTH + 2, 6, COR - 4);
          exitArrow(svg, X0 - 70, Y0 + DEPTH + COR / 2, 'left', 'Галерея\nв Главный корпус');
        }
        W = X0 + R.w + 40; H = Y0 + R.h + 80;
      } else if (b.id === 'obs') {
        const cx = 300, cy = 230, rr = 170;
        const oct = Array.from({ length: 8 }, (_, i) => {
          const a = Math.PI / 8 + i * Math.PI / 4; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)].join(',');
        }).join(' ');
        el('polygon', { points: oct, class: 'hm-floorplate' }, svg);
        list.sort((a, b) => a.number.localeCompare(b.number)).forEach((r, i) =>
          roomCell(svg, r, i === 0 ? cx - 132 : cx + 36, cy - 62, 96, 124));
        el('circle', { cx, cy, r: 22, class: 'hm-telescope' }, svg);
        el('text', { x: cx, y: cy + 40, 'text-anchor': 'middle', class: 'hm-cor-t' }, svg, 'Телескоп');
        el('polygon', { points: oct, class: 'hm-wall' }, svg);
        door(svg, cx - 22, cy + rr * Math.cos(Math.PI / 8) - 4, 44, 8);
        exitArrow(svg, cx, cy + rr + 18, 'down', 'Выход к Главному корпусу');
        W = 600; H = 470;
      } else {
        const X0 = 60, Y0 = 60, AW = 220, AH = 200;
        const n = list.length;
        const outerW = n * AW + 120;
        const SH = 80, OH = AH + SH + 30;
        el('rect', { x: X0, y: Y0, width: outerW, height: OH, rx: 18, class: 'hm-floorplate' }, svg);
        list.sort((a, b) => a.number.localeCompare(b.number)).forEach((r, i) => roomCell(svg, r, X0 + 10 + i * AW, Y0 + 10, AW - 10, AH));
        let sx = X0 + 10;
        [['Конюшня', AW * 1.6], ['Амуниция', AW * 0.7], ['Раздевалки', AW * 0.7]].forEach(([t, w]) => {
          el('rect', { x: sx, y: Y0 + AH + 20, width: w - 10, height: SH, class: 'hm-filler' }, svg);
          el('text', { x: sx + (w - 10) / 2, y: Y0 + AH + 20 + SH / 2 + 4, 'text-anchor': 'middle', class: 'hm-cor-t' }, svg, t);
          sx += w;
        });
        service(svg, 'wc', X0 + outerW - 100, Y0 + 10, 90, AH / 2 - 5);
        el('rect', { x: X0, y: Y0, width: outerW, height: OH, rx: 18, class: 'hm-wall' }, svg);
        // вход — в правой свободной части, не через подсобки
        const ex = X0 + outerW - 55;
        door(svg, ex - 22, Y0 + OH - 3, 44, 6);
        exitArrow(svg, ex, Y0 + OH + 18, 'down', 'Вход с Замковой ул.');
        W = X0 + outerW + 50; H = Y0 + OH + 70;
      }
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      return { W, H, list };
    }

    function aboutText(b, list) {
      about.replaceChildren();
      const inB = rooms.filter(r => r.building === b.id);
      const deans = inB.filter(r => cat(r) === 'dean').map(r => r.purpose.replace('Деканат факультета ', ''));
      const base = {
        main: 'Четырёхэтажный корпус из двух крыльев, соединённых центральным холлом с лестницами и лифтами. Номер: этаж, крыло, кабинет.',
        second: 'Пятиэтажный корпус, на 1–2 этажах соединён галереей с Главным корпусом. Номер: этаж, кабинет. На 3–5 этажах — лингафонные кабинеты и кафедры иностранных языков.',
        obs: 'Башня с двумя учебными куполами; практические занятия по астрономии проходят в конце учебного дня.',
        manege: 'Крытый манеж с тремя аренами для занятий верховой ездой, конюшней и раздевалками.'
      }[b.id] || '';
      h('p', null, about, base + (deans.length ? ` Здесь расположены деканаты факультетов ${deans.join(', ')}.` : ''));
      const marked = list.filter(r => r.purpose);
      if (marked.length) {
        h(hx(1), null, about, 'На этом этаже');
        const ul = h('ul', 'hm-onfloor', about);
        marked.sort((a, b) => cat(a).localeCompare(cat(b)) || a.number.localeCompare(b.number)).forEach(r => {
          const bt = h('button', 't-' + cat(r), h('li', null, ul)); bt.type = 'button';
          h('b', null, bt, r.number); h('span', null, bt, r.purpose);
          bt.onclick = () => select(r, 'list');
        });
      }
    }

    function renderFloors() {
      fTabs.replaceChildren();
      if (!state.building || B[state.building].floors.length < 2) return;
      B[state.building].floors.forEach(f => {
        const t = h('button', 'hm-floor', fTabs, f + ' эт.');
        t.type = 'button'; t.dataset.floor = f;
        t.setAttribute('aria-pressed', String(f === state.floor));
        t.setAttribute('aria-label', f + ' этаж');
        t.onclick = () => { setView(state.building, f); refocus('.hm-floor[data-floor="' + f + '"]', fTabs); };
      });
    }

    /* render() пересоздаёт кнопки и схемы — фокус возвращаем на новую кнопку с тем же data-*. */
    function refocus(selector, scope) {
      const n = (scope || root).querySelector(selector);
      if (n && n.focus) n.focus({ preventScroll: true });
    }

    function render() {
      renderFloors();
      drawCampus();
      svgWrap.replaceChildren();
      crumbs.replaceChildren();
      if (!state.building) {
        stage.hidden = true;
        return;
      }
      stage.hidden = false;
      const b = B[state.building];
      h(hx(0), null, crumbs, b.name + (b.floors.length > 1 ? `, ${state.floor}-й этаж` : ''));
      h('span', 'hm-scheme', crumbs, b.scheme);
      const fitBtn = h('button', 'hm-fit', crumbs, state.fit ? 'Крупнее' : 'Весь этаж на экране'); fitBtn.type = 'button';
      fitBtn.onclick = () => { state.fit = !state.fit; render(); centerSelected(); refocus('.hm-fit', crumbs); };
      const svg = el('svg', { class: 'hm-map', preserveAspectRatio: 'xMidYMin meet' }, svgWrap);
      const { W, list } = drawFloor(svg);
      svg.style.width = state.fit ? '100%' : Math.round(W) + 'px';
      // крупный план на телефоне — окно с прокруткой в обе стороны, чтобы под ним была видна карточка
      svgWrap.classList.toggle('pan', !state.fit && narrowOf(root));
      // легенда — только категории, которые есть на этом плане
      const present = new Set(list.map(cat));
      Object.entries(chips).forEach(([cls, chip]) => {
        chip.hidden = !present.has(cls);
        if (chip.hidden && state.filter.delete(cls)) chip.setAttribute('aria-pressed', 'false');
      });
      aboutText(b, list);
    }

    /* Выбранная аудитория — в середине окна плана (прокрутка внутри .hm-svg, страница не двигается). */
    function centerSelected() {
      const s = svgWrap.querySelector('.hm-room.sel');
      if (!s) return null;
      const w = svgWrap.getBoundingClientRect(), r = s.getBoundingClientRect();
      svgWrap.scrollLeft += (r.left + r.width / 2) - (w.left + svgWrap.clientWidth / 2);
      svgWrap.scrollTop += (r.top + r.height / 2) - (w.top + svgWrap.clientHeight / 2);
      return s;
    }

    /* Аудитория и карточка вместе — в видимой части окна (между шапкой и нижним меню).
       Если вместе не помещаются — аудитория по центру, карточка ниже. */
    function reveal() {
      const s = centerSelected();
      if (!s) return;
      const ins = insets();
      const top = ins.top + 8, bottom = window.innerHeight - ins.bottom - 8;
      const rr = s.getBoundingClientRect();
      const cr = card.hidden ? rr : card.getBoundingClientRect();
      const a = Math.min(rr.top, cr.top), b = Math.max(rr.bottom, cr.bottom);
      let dy = 0;
      if (b - a <= bottom - top) dy = b > bottom ? b - bottom : a < top ? a - top : 0;
      else dy = (rr.top + rr.bottom) / 2 - (top + bottom) / 2;
      if (Math.abs(dy) > 1) window.scrollBy(0, dy);
    }

    function closeCard() {
      const r = state.selected;
      state.selected = null; card.hidden = true;
      if (useHash) history.replaceState(null, '', location.pathname + location.search);
      render();
      if (opts.onClear) opts.onClear();
      // фокус — на ячейку закрытой аудитории (или на поиск, если её на плане нет)
      const cell = r && Array.from(svgWrap.querySelectorAll('.hm-room')).find(g => g.getAttribute('data-number') === r.number);
      if (cell) cell.focus({ preventScroll: true }); else search.focus({ preventScroll: true });
    }

    function showCard(r) {
      const b = B[r.building], c = cat(r);
      card.hidden = false;
      card.replaceChildren();
      const close = h('button', 'hm-close', card); close.type = 'button';
      close.setAttribute('aria-label', 'Закрыть');
      const x = el('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true', focusable: 'false' }, close);
      el('path', { d: 'M6 6l12 12M18 6L6 18' }, x);
      close.onclick = closeCard;
      h('div', 'hm-card-type t-' + c, card,
        c === 'dean' ? 'Деканат' : c === 'chair' ? 'Кафедра' : r.purpose ? 'Служебное помещение' : r.type);
      const title = h(hx(1), null, card, r.purpose || `Аудитория ${r.number}`);
      title.id = uid + '-card-title'; title.tabIndex = -1;
      const dl = h('dl', null, card);
      const row = (k, v) => { if (v == null || v === '') return; h('dt', null, dl, k); h('dd', null, dl, v); };
      if (r.purpose) row('Кабинет', r.number);
      row('Корпус', `${b.name}, ${b.address}`);
      if (r.building === 'main' || r.building === 'second') row('Этаж', r.floor);
      if (r.wing != null) row('Крыло', WING[r.wing]);
      if (r.bookable) row('Мест', r.capacity);
      h('p', 'hm-route', card, routeOf(r));
    }

    /* how: 'plan' — нажали на план (масштаб не меняем); 'list' — поиск и списки;
       'link' — открыли по ссылке (фокус не переносим: страница только загрузилась). */
    function select(r, how) {
      notice.hidden = true;
      state.selected = r;
      state.building = r.building;
      state.floor = r.floor;
      bSel.value = r.building;
      // на телефоне вписанный по ширине план мелкий: номер не прочитать — открываем «Крупнее»
      if (how !== 'plan' && narrowOf(root)) state.fit = false;
      showCard(r);
      render();
      if (useHash) history.replaceState(null, '', '#room=' + encodeURIComponent(r.number));
      if (opts.onSelect) opts.onSelect(r);
      reveal();
      if (how !== 'link') { const t = card.querySelector('#' + uid + '-card-title'); if (t) t.focus({ preventScroll: true }); }
    }

    function focus(q) {
      const r = byNumber[norm(q)] || rooms.find(x => x.purpose && norm(x.purpose).includes(norm(q)));
      if (r) select(r, 'link');
      else { notice.hidden = false; notice.textContent = `Аудитория «${q}» не найдена.`; }
      return r || null;
    }

    search.oninput = () => {
      const q = norm(search.value);
      results.replaceChildren();
      if (!q) { results.hidden = true; return; }
      const found = rooms.filter(r => norm(r.number).startsWith(q) || (r.purpose && norm(r.purpose).includes(q))
        || norm(r.type).startsWith(q)).slice(0, 8);
      results.hidden = false;
      if (!found.length) {
        h('li', 'hm-empty', results, 'Ничего не нашлось. В Главном корпусе номер из 4 цифр, во Втором — из 3.');
        live.textContent = 'Ничего не нашлось';
        return;
      }
      live.textContent = `Найдено: ${found.length}${found.length === 8 ? ' или больше' : ''}. Enter — открыть первое, стрелка вниз — к списку.`;
      found.forEach(r => {
        const b = h('button', null, h('li', null, results)); b.type = 'button';
        h('strong', null, b, r.number);
        h('span', null, b, ` ${r.purpose || r.type} · ${B[r.building].name}`);
        b.onclick = () => { results.hidden = true; live.textContent = ''; search.value = r.number; select(r, 'list'); };
      });
    };
    search.onkeydown = e => {
      if (e.key === 'Enter') { const f = results.querySelector('button'); if (f) f.click(); }
      if (e.key === 'ArrowDown' && !results.hidden) { const f = results.querySelector('button'); if (f) { e.preventDefault(); f.focus(); } }
      if (e.key === 'Escape' && !results.hidden) { e.stopPropagation(); results.hidden = true; live.textContent = ''; }
    };
    results.onkeydown = e => {
      const list = Array.from(results.querySelectorAll('button')), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? list[i + 1] : list[i - 1];
        if (next) next.focus(); else if (e.key === 'ArrowUp') search.focus();
      }
      if (e.key === 'Escape') { e.stopPropagation(); results.hidden = true; live.textContent = ''; search.focus(); }
    };
    // Esc — закрыть карточку помещения
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !card.hidden) { e.preventDefault(); closeCard(); }
    });
    bSel.onchange = () => setView(bSel.value);

    const m = useHash ? location.hash.match(/room=([^&]+)/) : null;
    let q = null;
    if (m) { try { q = decodeURIComponent(m[1]); } catch { q = m[1]; } }   // битый %-код не роняет карту
    if (!(q && focus(q))) {
      if (q) { notice.hidden = false; notice.textContent = `Аудитория «${q}» не найдена. Проверьте номер: в Главном корпусе он из 4 цифр, во Втором — из 3.`; }
      render();
    }
    function destroy() {
      root.replaceChildren();
      root.classList.remove('hm');
    }
    return { focus, show: setView, destroy, rooms };
  }

  window.HogwartsMap = { mount };
})();
