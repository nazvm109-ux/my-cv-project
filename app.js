/* =========================================================
   HabitFlow — логика приложения
   ========================================================= */
(() => {
  'use strict';

  // ---------- Константы ----------
  const STORAGE_KEY = 'habitflow:v1';
  const XP_PER_CHECK = 10;

  const CATEGORIES = {
    health: { label: 'Здоровье', icon: '💚', color: '#34d399' },
    productivity: { label: 'Продуктивность', icon: '⚡', color: '#fbbf24' },
    sport: { label: 'Спорт', icon: '🏃', color: '#60a5fa' },
    learning: { label: 'Обучение', icon: '📚', color: '#a78bfa' },
    mind: { label: 'Осознанность', icon: '🧘', color: '#f472b6' },
  };

  // Как отслеживается привычка
  const TYPES = {
    check: { label: 'Отметка', icon: '✓', color: '#a78bfa' },
    time: { label: 'Время', icon: '⏱', color: '#60a5fa' },
  };
  // Быстрые варианты дневной цели для «времени», в минутах (можно вписать любую свою)
  const GOAL_PRESETS = [15, 30, 45, 60, 90, 120];
  const QUICK_ADD = [5, 15, 30, 60];

  // [минимальный уровень, название, иконка]
  const RANKS = [
    [1, 'Новичок', '🌱'],
    [3, 'Ученик', '📘'],
    [5, 'Практик', '⚔️'],
    [8, 'Мастер', '🏅'],
    [12, 'Гуру', '🔮'],
    [17, 'Легенда', '👑'],
  ];

  const AVATARS = ['🦊', '🐼', '🐯', '🦄', '🐸', '🐙', '🦉', '🐲', '🐱', '🐻', '🐧', '🦁'];

  // [название, категория, тип, цель в минутах]
  const SUGGESTIONS = [
    ['Пить 2 литра воды', 'health', 'check', 30],
    ['Утренняя зарядка', 'sport', 'check', 30],
    ['Чтение', 'learning', 'time', 20],
    ['Медитация', 'mind', 'time', 10],
    ['Учёба', 'learning', 'time', 60],
    ['Планировать день', 'productivity', 'check', 30],
  ];

  const QUOTES = [
    'Маленькие шаги каждый день дают большие результаты.',
    'Дисциплина — это мост между целями и достижениями.',
    'Не разрывай цепочку!',
    'Сначала мы создаём привычки, потом они создают нас.',
    'Лучшее время начать было вчера. Следующее лучшее — сейчас.',
  ];

  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  // ---------- Утилиты ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const uid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  const plural = (n, one, few, many) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };

  // 90 → «1 ч 30 мин»
  const fmtMin = (m) => {
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} ч ${r} мин` : `${h} ч`;
  };
  // 90 → «1ч30» (для маленьких ячеек)
  const fmtShort = (m) => {
    if (m < 60) return `${m}м`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}ч${String(r).padStart(2, '0')}` : `${h}ч`;
  };

  const restartAnimation = (el, cls) => {
    el.classList.remove(cls);
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add(cls);
  };

  // ---------- Даты ----------
  const toKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromKey = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
  const todayKey = () => toKey(new Date());
  const weekdayIdx = (d) => (d.getDay() + 6) % 7; // 0 = Пн

  // ---------- Состояние ----------
  const defaultState = () => ({
    profile: { name: 'Герой привычек', avatar: '🦊' },
    habits: [],
    theme: null,
    view: 'week',
  });

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const def = defaultState();
      return {
        ...def,
        ...s,
        profile: { ...def.profile, ...(s.profile || {}) },
        habits: Array.isArray(s.habits)
          ? s.habits
              .filter((h) => h && h.id && Array.isArray(h.done))
              .map((h) => ({
                ...h,
                type: h.type === 'time' ? 'time' : 'check',
                goal: Number(h.goal) > 0 ? Number(h.goal) : 30,
                minutes: h.minutes && typeof h.minutes === 'object' ? h.minutes : {},
              }))
          : [],
      };
    } catch {
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* хранилище недоступно — продолжаем работать в памяти */
    }
  }

  const state = load();
  const ui = {
    cursor: new Date(), // дата, определяющая показанную неделю/месяц
    filter: 'all',
    newCategory: 'health',
    pendingDelete: null,
    editing: null,
    editCategory: 'health',
    newType: 'check',
    editType: 'check',
    timeTarget: null, // { id, key } — день, для которого вводим время
  };

  // ---------- Статистика и опыт ----------
  const totalChecks = () => state.habits.reduce((s, h) => s + h.done.length, 0);
  const minutesOf = (h) => (h.type === 'time' ? Object.values(h.minutes).reduce((a, b) => a + b, 0) : 0);
  // 10 XP за выполненный день + для «времени» 1 XP за каждые 10 минут
  const habitXP = (h) => h.done.length * XP_PER_CHECK + Math.floor(minutesOf(h) / 10);
  const totalXP = () => state.habits.reduce((s, h) => s + habitXP(h), 0);

  // Для привычек «на время» день выполнен, когда набрана дневная цель
  function syncDone(h) {
    h.done = Object.keys(h.minutes).filter((k) => h.minutes[k] >= h.goal);
  }
  const xpForLevel = (level) => 100 + (level - 1) * 50; // сколько XP нужно для перехода на следующий уровень

  function levelInfo(xp) {
    let level = 1;
    let rest = xp;
    while (rest >= xpForLevel(level)) {
      rest -= xpForLevel(level);
      level++;
    }
    return { level, current: rest, needed: xpForLevel(level) };
  }

  function rankFor(level) {
    let rank = RANKS[0];
    for (const r of RANKS) if (level >= r[0]) rank = r;
    return rank;
  }

  function currentStreak(done) {
    const set = new Set(done);
    let d = new Date();
    if (!set.has(toKey(d))) d = addDays(d, -1); // сегодня ещё можно успеть
    let n = 0;
    while (set.has(toKey(d))) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  function bestStreak(done) {
    const keys = [...new Set(done)].sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of keys) {
      run = prev && toKey(addDays(fromKey(prev), 1)) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    return best;
  }

  const doneOn = (key) => state.habits.filter((h) => h.done.includes(key)).length;

  // ---------- Период (неделя / месяц) ----------
  function periodDays() {
    if (state.view === 'week') {
      const s = startOfWeek(ui.cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const y = ui.cursor.getFullYear();
    const m = ui.cursor.getMonth();
    const n = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(y, m, i + 1));
  }

  function periodLabel() {
    if (state.view === 'week') {
      const days = periodDays();
      const a = days[0];
      const b = days[6];
      return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`
        : `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
    }
    return `${MONTHS[ui.cursor.getMonth()]} ${ui.cursor.getFullYear()}`;
  }

  function shiftPeriod(dir) {
    if (state.view === 'week') ui.cursor = addDays(ui.cursor, dir * 7);
    else ui.cursor = new Date(ui.cursor.getFullYear(), ui.cursor.getMonth() + dir, 1);
    renderToolbar();
    renderHabits({ animateAll: true });
  }

  // ---------- Рендер: профиль ----------
  function animateNumber(el, to, duration = 700) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (from === to) {
      el.textContent = to;
      return;
    }
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderProfile() {
    const xp = totalXP();
    const info = levelInfo(xp);
    const [, rankName, rankIcon] = rankFor(info.level);
    const next = RANKS.find((r) => r[0] > info.level);

    $('#avatar').textContent = state.profile.avatar;
    if (document.activeElement !== $('#profileName')) $('#profileName').value = state.profile.name;

    animateNumber($('#levelNum'), info.level);
    $('#levelBadge').textContent = info.level;
    $('#rankBadge').textContent = `${rankIcon} ${rankName}`;
    $('#xpFill').style.width = `${(info.current / info.needed) * 100}%`;
    $('#xpText').textContent = `${info.current} / ${info.needed} XP`;
    $('#nextRank').textContent = next
      ? `До ранга «${next[1]}» ${next[2]} — ${next[0] - info.level} ${plural(next[0] - info.level, 'уровень', 'уровня', 'уровней')}`
      : 'Вы достигли максимального ранга! 👑';

    animateNumber($('#statTotal'), totalChecks());
    animateNumber($('#statBest'), state.habits.reduce((m, h) => Math.max(m, bestStreak(h.done)), 0));
    animateNumber($('#statXp'), xp);

    // Кольцо «Сегодня»
    const total = state.habits.length;
    const today = doneOn(todayKey());
    const pct = total ? today / total : 0;
    $('#todayRing').style.strokeDashoffset = String(213.6 * (1 - pct));
    $('#todayPercent').textContent = `${Math.round(pct * 100)}%`;
    $('#todayText').textContent = total
      ? pct === 1
        ? 'Все привычки выполнены! 🎉'
        : `Выполнено ${today} из ${total}`
      : 'Добавьте первую привычку';

    // График за 7 дней
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const max = Math.max(1, total);
    $('#weekChart').innerHTML = days
      .map((d, i) => {
        const c = doneOn(toKey(d));
        const h = Math.max(6, (c / max) * 70);
        return `<div class="bar-col" title="${d.getDate()} ${MONTHS_GEN[d.getMonth()]}: ${c}">
          <div class="bar ${i === 6 ? 'today' : ''}" style="height:${h}px"></div>
          <span class="bar-label">${WEEKDAYS[weekdayIdx(d)]}</span>
        </div>`;
      })
      .join('');
  }

  // ---------- Рендер: форма, фильтры, панель ----------
  // Ряд чипов-переключателей: категории или типы
  const chipsHtml = (items, current, attr) =>
    Object.entries(items)
      .map(
        ([key, c]) => `<button type="button" class="chip ${key === current ? 'active' : ''}"
          data-${attr}="${key}" role="radio" aria-checked="${key === current}" style="--c:${c.color}">
          <span>${c.icon}</span>${c.label}</button>`,
      )
      .join('');

  // Поле цели: часы + минуты. prefix — 'habitGoal' (форма) или 'editGoal' (окно изменения)
  function readGoal(prefix) {
    const h = parseInt($(`#${prefix}H`).value, 10) || 0;
    const m = parseInt($(`#${prefix}M`).value, 10) || 0;
    return Math.max(0, Math.min(24 * 60, h * 60 + m));
  }

  function renderGoalPresets(prefix) {
    const cur = readGoal(prefix);
    $(`#${prefix}Presets`).innerHTML = GOAL_PRESETS.map(
      (g) => `<button type="button" class="chip chip-sm ${g === cur ? 'active' : ''}" data-goal="${g}" style="--c:#60a5fa">${fmtShort(g)}</button>`,
    ).join('');
  }

  function setGoal(prefix, total) {
    $(`#${prefix}H`).value = Math.floor(total / 60);
    $(`#${prefix}M`).value = total % 60;
    renderGoalPresets(prefix);
  }

  // Проверяет цель; если она нулевая — трясёт поля и возвращает 0
  function validGoal(prefix) {
    const goal = readGoal(prefix);
    if (!goal) {
      [`#${prefix}H`, `#${prefix}M`].forEach((s) => restartAnimation($(s), 'shake'));
      $(`#${prefix}M`).focus();
    }
    return goal;
  }

  function bindGoalInput(prefix) {
    [`#${prefix}H`, `#${prefix}M`].forEach((s) => {
      $(s).addEventListener('input', () => renderGoalPresets(prefix));
      $(s).addEventListener('animationend', (e) => e.target.classList.remove('shake'));
    });
    $(`#${prefix}Presets`).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-goal]');
      if (btn) setGoal(prefix, Number(btn.dataset.goal));
    });
  }

  function renderCategoryPicker() {
    $('#categoryPicker').innerHTML = chipsHtml(CATEGORIES, ui.newCategory, 'cat');
    $('#typePicker').innerHTML = chipsHtml(TYPES, ui.newType, 'type');
    $('#goalWrap').classList.toggle('hidden', ui.newType !== 'time');
  }

  function renderFilters() {
    const count = (key) => state.habits.filter((h) => h.category === key).length;
    const chips = [['all', { label: 'Все', icon: '✨', color: '#a78bfa' }, state.habits.length]].concat(
      Object.entries(CATEGORIES).map(([k, c]) => [k, c, count(k)]),
    );
    $('#filters').innerHTML = chips
      .map(
        ([key, c, n]) => `<button type="button" class="chip ${key === ui.filter ? 'active' : ''}"
          data-filter="${key}" style="--c:${c.color}">
          <span>${c.icon}</span>${c.label}<span class="count">${n}</span></button>`,
      )
      .join('');
  }

  function renderToolbar() {
    $('#viewToggle').dataset.view = state.view;
    $$('#viewToggle button').forEach((b) => {
      const active = b.dataset.view === state.view;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    $('#periodLabel').textContent = periodLabel();
  }

  // ---------- Рендер: привычки ----------
  const checkSvg = `<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

  function dayCell(h, d, set, today, showDow) {
    const key = toKey(d);
    const done = set.has(key);
    const future = key > today;
    const isTime = h.type === 'time';
    const mins = isTime ? h.minutes[key] || 0 : 0;
    const dateText = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    const label = isTime
      ? `${dateText}: ${mins ? fmtMin(mins) : 'нет времени'} из ${fmtMin(h.goal)}`
      : `${dateText}: ${done ? 'выполнено' : 'не выполнено'}`;

    let inner;
    if (isTime && mins && showDow) inner = `<span class="num time">${fmtShort(mins)}</span>`;
    else if (done && showDow) inner = checkSvg;
    else inner = `<span class="num">${d.getDate()}</span>`;

    return `<button type="button" class="day-cell ${done ? 'is-done' : ''} ${key === today ? 'is-today' : ''} ${isTime ? 'is-time' : ''}"
      data-id="${h.id}" data-date="${key}" ${future ? 'disabled' : ''}
      ${isTime ? `style="--p:${Math.min(1, mins / h.goal)}"` : `aria-pressed="${done}"`}
      aria-label="${label}" title="${label}">
      ${showDow ? `<span class="dow">${WEEKDAYS[weekdayIdx(d)]}</span>` : ''}
      ${inner}
    </button>`;
  }

  function habitCard(h, i, animate) {
    const cat = CATEGORIES[h.category] || CATEGORIES.health;
    const set = new Set(h.done);
    const today = todayKey();
    const days = periodDays();
    const streak = currentStreak(h.done);
    const eligible = days.filter((d) => toKey(d) <= today);
    const doneCount = eligible.filter((d) => set.has(toKey(d))).length;
    const pct = eligible.length ? Math.round((doneCount / eligible.length) * 100) : 0;
    const isTime = h.type === 'time';
    const periodMinutes = isTime ? days.reduce((s, d) => s + (h.minutes[toKey(d)] || 0), 0) : 0;
    const periodWord = state.view === 'week' ? 'за неделю' : 'за месяц';

    let grid;
    if (state.view === 'week') {
      grid = `<div class="grid grid-cols-7 gap-2 mt-4">${days.map((d) => dayCell(h, d, set, today, true)).join('')}</div>`;
    } else {
      const offset = weekdayIdx(days[0]);
      grid = `<div class="month-grid grid grid-cols-7 gap-1.5 mt-4 max-w-xl">
        ${WEEKDAYS.map((w) => `<span class="dow-head">${w}</span>`).join('')}
        ${'<span></span>'.repeat(offset)}
        ${days.map((d) => dayCell(h, d, set, today, false)).join('')}
      </div>`;
    }

    return `<article class="habit-card glass spotlight ${animate ? 'animate-in' : ''}" style="--c:${cat.color};--i:${i}" data-card="${h.id}">
      <div class="flex items-center gap-3">
        <div class="cat-bubble">${cat.icon}</div>
        <div class="min-w-0 flex-1">
          <h3 class="font-bold leading-snug line-clamp-2 break-words" title="${esc(h.name)}">${esc(h.name)}</h3>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted font-semibold">
            <span class="cat-tag">${cat.label}</span>
            <span class="whitespace-nowrap"><span class="flame ${streak ? 'lit' : ''}">🔥</span> ${streak} ${plural(streak, 'день', 'дня', 'дней')}</span>
            ${isTime ? `<span class="whitespace-nowrap">⏱ цель ${fmtMin(h.goal)}/день</span>` : ''}
          </div>
        </div>
        <div class="text-right shrink-0 ${isTime ? '' : 'hidden sm:block'}">
          <div class="text-lg font-extrabold leading-none">${isTime ? fmtShort(periodMinutes) : `${pct}%`}</div>
          <div class="text-[10px] text-muted font-semibold mt-1">${periodWord}</div>
        </div>
        <div class="card-actions">
          <button type="button" class="action-btn edit" data-edit="${h.id}" title="Изменить" aria-label="Изменить «${esc(h.name)}»">
            <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button type="button" class="action-btn delete" data-delete="${h.id}" title="Удалить" aria-label="Удалить «${esc(h.name)}»">
            <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </div>
      ${grid}
      <div class="mini-bar"><span style="width:${pct}%"></span></div>
    </article>`;
  }

  function renderHabits({ animateAll = false, newId = null } = {}) {
    const list = $('#habitList');

    if (!state.habits.length) {
      list.innerHTML = `<div class="glass p-10 text-center animate-in">
        <div class="empty-emoji">🌱</div>
        <h3 class="text-xl font-extrabold mt-3">Пока нет привычек</h3>
        <p class="text-sm text-muted mt-1">Добавьте свою или начните с готовой:</p>
        <div class="flex flex-wrap justify-center gap-2 mt-5">
          ${SUGGESTIONS.map(
            ([name, cat, type, goal], i) => `<button type="button" class="chip" style="--c:${CATEGORIES[cat].color}"
              data-suggest="${i}">${CATEGORIES[cat].icon} ${esc(name)}${type === 'time' ? ` · ⏱ ${fmtMin(goal)}` : ''}</button>`,
          ).join('')}
        </div>
      </div>`;
      return;
    }

    const habits = state.habits.filter((h) => ui.filter === 'all' || h.category === ui.filter);
    if (!habits.length) {
      list.innerHTML = `<div class="glass p-8 text-center text-muted animate-in">В этой категории пока нет привычек</div>`;
      return;
    }

    list.innerHTML = habits.map((h, i) => habitCard(h, i, animateAll || h.id === newId)).join('');
  }

  function renderAll() {
    renderProfile();
    renderCategoryPicker();
    renderFilters();
    renderToolbar();
    renderHabits({ animateAll: true });
  }

  // ---------- Эффекты ----------
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function burst(rect, color) {
    if (!window.confetti || reducedMotion) return;
    confetti({
      particleCount: 45,
      spread: 75,
      startVelocity: 28,
      gravity: 1.1,
      ticks: 130,
      scalar: 0.85,
      origin: {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      },
      colors: [color, '#f472b6', '#a78bfa', '#fde68a', '#67e8f9'],
    });
  }

  function celebrate() {
    if (!window.confetti || reducedMotion) return;
    const end = Date.now() + 1600;
    const colors = ['#a78bfa', '#f472b6', '#fb923c', '#67e8f9', '#86efac'];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  function floatText(rect, text, minus = false) {
    const el = document.createElement('div');
    el.className = `float-xp ${minus ? 'minus' : ''}`;
    el.textContent = text;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top - 4}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function toast(msg, icon = '✨') {
    const el = document.createElement('div');
    el.className = 'toast glass';
    el.innerHTML = `<span class="text-xl">${icon}</span><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove());
    }, 2600);
  }

  function glowXP() {
    const track = $('#xpTrack');
    track.classList.add('glow');
    setTimeout(() => track.classList.remove('glow'), 700);
  }

  // ---------- Модалки ----------
  function openModal(id) {
    const m = $(id);
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    const focusable = m.querySelector('.btn-primary, .btn-danger');
    if (focusable) setTimeout(() => focusable.focus(), 50);
  }

  function closeModal(m) {
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }

  function showLevelUp(level) {
    const [, rankName, rankIcon] = rankFor(level);
    $('#levelModalNum').textContent = level;
    $('#levelModalRank').textContent = `Ваш ранг: ${rankIcon} ${rankName}`;
    openModal('#levelModal');
    restartAnimation($('#levelBadge'), 'bump');
    celebrate();
  }

  // ---------- Действия ----------
  function addHabit(name, category, type = 'check', goal = 30) {
    const h = { id: uid(), name, category, type, goal, minutes: {}, createdAt: todayKey(), done: [] };
    state.habits.push(h);
    save();
    if (ui.filter !== 'all' && ui.filter !== category) ui.filter = 'all';
    renderFilters();
    renderProfile();
    renderHabits({ newId: h.id, animateAll: state.habits.length === 1 });
    toast(`Привычка «${name}» добавлена`, CATEGORIES[category].icon);
  }

  const cellOf = (id, key) => $(`.day-cell[data-id="${id}"][data-date="${key}"]`);

  // Клик по дню: «отметка» переключается сразу, для «времени» открывается окно ввода
  function onDayClick(id, key, cellEl) {
    const h = state.habits.find((x) => x.id === id);
    if (!h || key > todayKey()) return;
    if (h.type === 'time') return openTime(h, key);
    applyChange(h, key, cellEl.getBoundingClientRect(), () => {
      const idx = h.done.indexOf(key);
      if (idx === -1) h.done.push(key);
      else h.done.splice(idx, 1);
    });
  }

  // Общий путь для любого изменения дня: сохранение, перерисовка, эффекты и уровни
  function applyChange(h, key, rect, mutate) {
    const xpBefore = totalXP();
    const levelBefore = levelInfo(xpBefore).level;
    const wasDone = h.done.includes(key);
    const minsBefore = h.minutes[key] || 0;
    mutate();
    save();

    const isDone = h.done.includes(key);
    const checking = !wasDone && isDone;
    const unchecking = wasDone && !isDone;
    const xpDelta = totalXP() - xpBefore;

    renderHabits();
    renderFilters();
    const newCell = cellOf(h.id, key);
    if (newCell) {
      if (checking || (h.type === 'time' && (h.minutes[key] || 0) > minsBefore)) newCell.classList.add('just-checked');
      else if (unchecking || (h.minutes[key] || 0) < minsBefore) newCell.classList.add('just-unchecked');
      newCell.focus({ preventScroll: true });
      rect = newCell.getBoundingClientRect();
    }

    const color = (CATEGORIES[h.category] || CATEGORIES.health).color;
    const levelAfter = levelInfo(totalXP()).level;

    if (checking) burst(rect, color);
    if (xpDelta > 0) {
      floatText(rect, `+${xpDelta} XP`);
      glowXP();
    } else if (xpDelta < 0) {
      floatText(rect, `−${-xpDelta} XP`, true);
    }

    if (levelAfter > levelBefore) {
      // Заполняем полосу до конца, затем сбрасываем и показываем новый уровень
      const fill = $('#xpFill');
      fill.style.width = '100%';
      setTimeout(() => {
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth;
        fill.style.transition = '';
        renderProfile();
        showLevelUp(levelAfter);
      }, 750);
    } else {
      renderProfile();
      if (levelAfter < levelBefore) restartAnimation($('#levelBadge'), 'bump');
    }

    if (checking && key === todayKey() && doneOn(key) === state.habits.length && levelAfter === levelBefore) {
      setTimeout(celebrate, 300);
      toast('Все привычки на сегодня выполнены!', '🏆');
    }
  }

  // ---------- Окно ввода времени ----------
  const timeValue = () =>
    Math.max(0, Math.min(24 * 60, (parseInt($('#timeHours').value, 10) || 0) * 60 + (parseInt($('#timeMinutes').value, 10) || 0)));

  function setTimeInputs(total) {
    total = Math.max(0, Math.min(24 * 60, total));
    $('#timeHours').value = Math.floor(total / 60);
    $('#timeMinutes').value = total % 60;
    updateTimePreview();
  }

  function updateTimePreview() {
    const h = state.habits.find((x) => x.id === (ui.timeTarget && ui.timeTarget.id));
    if (!h) return;
    const m = timeValue();
    const p = Math.min(1, m / h.goal);
    $('#timeGoalBar').style.width = `${p * 100}%`;
    $('#timeGoalText').textContent =
      m >= h.goal ? `🎯 Цель достигнута: ${fmtMin(m)} из ${fmtMin(h.goal)}` : `${m ? fmtMin(m) : '0 мин'} из ${fmtMin(h.goal)}`;
  }

  function openTime(h, key) {
    ui.timeTarget = { id: h.id, key };
    const d = fromKey(key);
    const cat = CATEGORIES[h.category] || CATEGORIES.health;
    $('#timeForm').style.setProperty('--c', cat.color);
    $('#timeTitle').textContent = h.name;
    $('#timeDate').textContent = `${key === todayKey() ? 'Сегодня, ' : ''}${d.getDate()} ${MONTHS_GEN[d.getMonth()]} · цель ${fmtMin(h.goal)}`;
    $('#timeQuick').innerHTML = QUICK_ADD.map((m) => `<button type="button" class="chip" style="--c:${cat.color}" data-add="${m}">+${fmtMin(m)}</button>`).join('');
    setTimeInputs(h.minutes[key] || 0);
    openModal('#timeModal');
    setTimeout(() => $('#timeMinutes').select(), 60);
  }

  function saveTime(total) {
    const t = ui.timeTarget;
    const h = t && state.habits.find((x) => x.id === t.id);
    closeModal($('#timeModal'));
    if (!h) return;
    const cell = cellOf(h.id, t.key);
    const rect = cell ? cell.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    if ((h.minutes[t.key] || 0) === total) return;
    applyChange(h, t.key, rect, () => {
      if (total > 0) h.minutes[t.key] = total;
      else delete h.minutes[t.key];
      syncDone(h);
    });
  }

  // ---------- Редактирование ----------
  function renderEditCategories() {
    $('#editCategoryPicker').innerHTML = chipsHtml(CATEGORIES, ui.editCategory, 'cat');
    $('#editTypePicker').innerHTML = chipsHtml(TYPES, ui.editType, 'type');
    $('#editGoalWrap').classList.toggle('hidden', ui.editType !== 'time');
  }

  function openEdit(id) {
    const h = state.habits.find((x) => x.id === id);
    if (!h) return;
    ui.editing = id;
    ui.editCategory = CATEGORIES[h.category] ? h.category : 'health';
    ui.editType = h.type;
    $('#editName').value = h.name;
    setGoal('editGoal', h.goal);
    renderEditCategories();
    openModal('#editModal');
    setTimeout(() => $('#editName').select(), 60);
  }

  function saveEdit() {
    const h = state.habits.find((x) => x.id === ui.editing);
    const input = $('#editName');
    const name = input.value.trim();
    if (!h) return;
    if (!name) {
      restartAnimation(input, 'shake');
      input.focus();
      return;
    }
    const goal = ui.editType === 'time' ? validGoal('editGoal') : h.goal;
    if (!goal) return;
    h.name = name;
    h.category = ui.editCategory;
    if (ui.editType === 'time') {
      if (h.type !== 'time') {
        // Уже отмеченные дни считаем выполненными: записываем им время, равное цели
        for (const k of h.done) if (!h.minutes[k]) h.minutes[k] = goal;
      }
      h.type = 'time';
      h.goal = goal;
      syncDone(h);
    } else {
      h.type = 'check';
    }
    const levelBefore = Number($('#levelBadge').textContent);
    save();
    closeModal($('#editModal'));
    if (ui.filter !== 'all' && ui.filter !== h.category) ui.filter = 'all';
    renderFilters();
    renderHabits();
    renderProfile();
    if (levelInfo(totalXP()).level !== levelBefore) restartAnimation($('#levelBadge'), 'bump');
    toast(`Сохранено: «${name}»`, CATEGORIES[h.category].icon);
  }

  function requestDelete(id) {
    const h = state.habits.find((x) => x.id === id);
    if (!h) return;
    ui.pendingDelete = id;
    $('#confirmName').textContent = h.name;
    openModal('#confirmModal');
  }

  function confirmDelete() {
    const id = ui.pendingDelete;
    ui.pendingDelete = null;
    closeModal($('#confirmModal'));
    const h = state.habits.find((x) => x.id === id);
    if (!h) return;
    const card = $(`[data-card="${id}"]`);
    const finish = () => {
      state.habits = state.habits.filter((x) => x.id !== id);
      save();
      renderFilters();
      renderProfile();
      renderHabits();
      toast(`«${h.name}» удалена`, '🗑️');
    };
    if (card && !reducedMotion) {
      card.classList.add('card-out');
      card.addEventListener('animationend', finish, { once: true });
    } else finish();
  }

  function setTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    state.theme = dark ? 'dark' : 'light';
    save();
    const icon = $('#themeIcon');
    icon.textContent = dark ? '☀️' : '🌙';
    restartAnimation(icon, 'spin');
  }

  // ---------- События ----------
  function bindEvents() {
    // Добавление
    $('#habitForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#habitName');
      const name = input.value.trim();
      if (!name) {
        restartAnimation(input, 'shake');
        input.focus();
        return;
      }
      const goal = ui.newType === 'time' ? validGoal('habitGoal') : 30;
      if (!goal) return;
      addHabit(name, ui.newCategory, ui.newType, goal);
      input.value = '';
    });
    $('#habitName').addEventListener('animationend', (e) => e.target.classList.remove('shake'));

    $('#categoryPicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      ui.newCategory = btn.dataset.cat;
      renderCategoryPicker();
    });
    $('#typePicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      ui.newType = btn.dataset.type;
      renderCategoryPicker();
    });

    $('#filters').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn || btn.dataset.filter === ui.filter) return;
      ui.filter = btn.dataset.filter;
      renderFilters();
      renderHabits({ animateAll: true });
    });

    // Клики по карточкам привычек
    $('#habitList').addEventListener('click', (e) => {
      const cell = e.target.closest('.day-cell');
      if (cell && !cell.disabled) return onDayClick(cell.dataset.id, cell.dataset.date, cell);
      const del = e.target.closest('[data-delete]');
      if (del) return requestDelete(del.dataset.delete);
      const edit = e.target.closest('[data-edit]');
      if (edit) return openEdit(edit.dataset.edit);
      const sug = e.target.closest('[data-suggest]');
      if (sug) {
        const [name, cat, type, goal] = SUGGESTIONS[Number(sug.dataset.suggest)];
        addHabit(name, cat, type, goal);
      }
    });

    // Окно ввода времени
    $('#timeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveTime(timeValue());
    });
    $('#timeClear').addEventListener('click', () => saveTime(0));
    $('#timeQuick').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (btn) setTimeInputs(timeValue() + Number(btn.dataset.add));
    });
    ['#timeHours', '#timeMinutes'].forEach((s) => $(s).addEventListener('input', updateTimePreview));

    // Вид и навигация
    $('#viewToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn || btn.dataset.view === state.view) return;
      state.view = btn.dataset.view;
      save();
      renderToolbar();
      renderHabits({ animateAll: true });
    });
    $('#prevPeriod').addEventListener('click', () => shiftPeriod(-1));
    $('#nextPeriod').addEventListener('click', () => shiftPeriod(1));
    $('#todayBtn').addEventListener('click', () => {
      ui.cursor = new Date();
      renderToolbar();
      renderHabits({ animateAll: true });
    });

    // Профиль
    $('#avatarBtn').addEventListener('click', () => {
      const i = AVATARS.indexOf(state.profile.avatar);
      state.profile.avatar = AVATARS[(i + 1) % AVATARS.length];
      save();
      const av = $('#avatar');
      av.textContent = state.profile.avatar;
      restartAnimation(av, 'swap');
    });
    const nameInput = $('#profileName');
    nameInput.addEventListener('change', () => {
      state.profile.name = nameInput.value.trim() || defaultState().profile.name;
      nameInput.value = state.profile.name;
      save();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur();
    });

    // Тема
    $('#themeToggle').addEventListener('click', () =>
      setTheme(!document.documentElement.classList.contains('dark')),
    );

    // Модалки
    $$('.modal').forEach((m) =>
      m.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) closeModal(m);
      }),
    );
    $('#confirmDelete').addEventListener('click', confirmDelete);

    // Редактирование
    $('#editForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveEdit();
    });
    $('#editName').addEventListener('animationend', (e) => e.target.classList.remove('shake'));
    $('#editCategoryPicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      ui.editCategory = btn.dataset.cat;
      renderEditCategories();
    });
    $('#editTypePicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      ui.editType = btn.dataset.type;
      renderEditCategories();
    });
    $('#editDelete').addEventListener('click', () => {
      closeModal($('#editModal'));
      requestDelete(ui.editing);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.modal.open').forEach(closeModal);
    });

    // Подсветка под курсором, наклон профиля, свечение курсора
    const glow = $('#cursorGlow');
    const profile = $('#profileCard');
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      document.body.classList.add('has-pointer');
      glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;

      const spot = e.target.closest && e.target.closest('.spotlight');
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', `${e.clientX - r.left}px`);
        spot.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
    });
    document.addEventListener('pointerleave', () => document.body.classList.remove('has-pointer'));

    if (!reducedMotion) {
      profile.addEventListener('pointermove', (e) => {
        const r = profile.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        profile.style.setProperty('--ry', `${x * 6}deg`);
        profile.style.setProperty('--rx', `${-y * 6}deg`);
      });
      profile.addEventListener('pointerleave', () => {
        profile.style.setProperty('--ry', '0deg');
        profile.style.setProperty('--rx', '0deg');
      });
    }

    // Новый день — обновляем экран, если вкладка была открыта через полночь
    let lastDay = todayKey();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && todayKey() !== lastDay) {
        lastDay = todayKey();
        ui.cursor = new Date();
        renderAll();
        setHeaderDate();
      }
    });
  }

  function setHeaderDate() {
    $('#todayLabel').textContent = new Date().toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  // ---------- Старт ----------
  $('#themeIcon').textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
  $('#quote').textContent = `«${QUOTES[Math.floor(Math.random() * QUOTES.length)]}»`;
  setHeaderDate();
  setGoal('habitGoal', 30);
  bindGoalInput('habitGoal');
  bindGoalInput('editGoal');
  bindEvents();
  renderAll();
})();
