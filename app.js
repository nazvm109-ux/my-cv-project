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

  const SUGGESTIONS = [
    ['Пить 2 литра воды', 'health'],
    ['Утренняя зарядка', 'sport'],
    ['Читать 20 минут', 'learning'],
    ['Медитация 10 минут', 'mind'],
    ['Планировать день', 'productivity'],
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
        habits: Array.isArray(s.habits) ? s.habits.filter((h) => h && h.id && Array.isArray(h.done)) : [],
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
  };

  // ---------- Статистика и опыт ----------
  const totalChecks = () => state.habits.reduce((s, h) => s + h.done.length, 0);
  const totalXP = () => totalChecks() * XP_PER_CHECK;
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
  function renderCategoryPicker() {
    $('#categoryPicker').innerHTML = Object.entries(CATEGORIES)
      .map(
        ([key, c]) => `<button type="button" class="chip ${key === ui.newCategory ? 'active' : ''}"
          data-cat="${key}" role="radio" aria-checked="${key === ui.newCategory}" style="--c:${c.color}">
          <span>${c.icon}</span>${c.label}</button>`,
      )
      .join('');
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
    const label = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}: ${done ? 'выполнено' : 'не выполнено'}`;
    return `<button type="button" class="day-cell ${done ? 'is-done' : ''} ${key === today ? 'is-today' : ''}"
      data-id="${h.id}" data-date="${key}" ${future ? 'disabled' : ''}
      aria-pressed="${done}" aria-label="${label}" title="${label}">
      ${showDow ? `<span class="dow">${WEEKDAYS[weekdayIdx(d)]}</span>` : ''}
      ${done && showDow ? checkSvg : `<span class="num">${d.getDate()}</span>`}
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
          <h3 class="font-bold truncate">${esc(h.name)}</h3>
          <div class="flex items-center gap-2 mt-1 text-xs text-muted font-semibold">
            <span class="cat-tag">${cat.label}</span>
            <span><span class="flame ${streak ? 'lit' : ''}">🔥</span> ${streak} ${plural(streak, 'день', 'дня', 'дней')}</span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-lg font-extrabold leading-none">${pct}%</div>
          <div class="text-[10px] text-muted font-semibold mt-1">${state.view === 'week' ? 'за неделю' : 'за месяц'}</div>
        </div>
        <button type="button" class="delete-btn" data-delete="${h.id}" aria-label="Удалить «${esc(h.name)}»">
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
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
            ([name, cat]) => `<button type="button" class="chip" style="--c:${CATEGORIES[cat].color}"
              data-suggest="${esc(name)}" data-cat-s="${cat}">${CATEGORIES[cat].icon} ${esc(name)}</button>`,
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
  function addHabit(name, category) {
    const h = { id: uid(), name, category, createdAt: todayKey(), done: [] };
    state.habits.push(h);
    save();
    if (ui.filter !== 'all' && ui.filter !== category) ui.filter = 'all';
    renderFilters();
    renderProfile();
    renderHabits({ newId: h.id, animateAll: state.habits.length === 1 });
    toast(`Привычка «${name}» добавлена`, CATEGORIES[category].icon);
  }

  function toggleDay(id, key, cellEl) {
    const h = state.habits.find((x) => x.id === id);
    if (!h || key > todayKey()) return;

    const rect = cellEl.getBoundingClientRect();
    const levelBefore = levelInfo(totalXP()).level;
    const idx = h.done.indexOf(key);
    const checking = idx === -1;
    if (checking) h.done.push(key);
    else h.done.splice(idx, 1);
    save();

    renderHabits();
    renderFilters();
    const newCell = $(`.day-cell[data-id="${id}"][data-date="${key}"]`);
    if (newCell) {
      newCell.classList.add(checking ? 'just-checked' : 'just-unchecked');
      newCell.focus({ preventScroll: true });
    }

    const color = (CATEGORIES[h.category] || CATEGORIES.health).color;
    const levelAfter = levelInfo(totalXP()).level;

    if (checking) {
      burst(rect, color);
      floatText(rect, `+${XP_PER_CHECK} XP`);
      glowXP();
    } else {
      floatText(rect, `−${XP_PER_CHECK} XP`, true);
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
      addHabit(name, ui.newCategory);
      input.value = '';
    });
    $('#habitName').addEventListener('animationend', (e) => e.target.classList.remove('shake'));

    $('#categoryPicker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      ui.newCategory = btn.dataset.cat;
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
      if (cell && !cell.disabled) return toggleDay(cell.dataset.id, cell.dataset.date, cell);
      const del = e.target.closest('[data-delete]');
      if (del) return requestDelete(del.dataset.delete);
      const sug = e.target.closest('[data-suggest]');
      if (sug) addHabit(sug.dataset.suggest, sug.dataset.catS);
    });

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
  bindEvents();
  renderAll();
})();
