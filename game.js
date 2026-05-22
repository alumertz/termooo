const WORD_LEN   = 5;
const MAX_ROWS   = 6;
const FLIP_STEP  = 350;
const FLIP_DUR   = 500;

const KEYS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L','⌫'],
  ['Z','X','C','V','B','N','M','ENTER'],
];

const WIN_MSGS = ['Genial!', 'Incrível!', 'Ótimo!', 'Muito bem!', 'Bom!', 'Ufa!'];
const STATE_RANK = { correct: 3, present: 2, absent: 1 };

let target    = '';
let sentence  = '';
let todayStr  = '';
let row       = 0;
let col       = 0;
let over      = false;
let tiles     = [];
let keyBtns   = {};
let toastTmr  = null;
let validWords = null;
let words      = [];
let calYear    = 0;
let calMonth   = 0;
let realTodayStr = '';

const STORAGE_KEY = 'termooo_history';

function normalize(w) {
  return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

// ── Persistence ───────────────────────────────────────────────────────────────

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; }
  catch { return {}; }
}

function saveResult(date, tries, guesses, late = false) {
  const history = loadHistory();
  history[date] = { tries, guesses, ...(late ? { late: true } : {}) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getTodayResult(date) {
  return loadHistory()[date] ?? null;
}

function getAllGuesses() {
  const guesses = [];
  for (let i = 0; i < row; i++) {
    guesses.push(tiles[i].map(t => t.textContent).join(''));
  }
  return guesses;
}

function computeStats() {
  const history = loadHistory();
  const allEntries = Object.entries(history).sort(([a], [b]) => a < b ? -1 : 1);
  const streakEntries = allEntries.filter(([, e]) => !e.late);

  const total  = allEntries.length;
  const wins   = allEntries.filter(([, e]) => e.tries !== -1).length;
  const winPct = total === 0 ? 0 : Math.round(wins / total * 100);

  const dist = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '-1': 0 };
  for (const [, e] of allEntries) {
    const k = String(e.tries);
    if (k in dist) dist[k]++;
  }

  let current = 0, best = 0, temp = 0;
  for (const [, e] of streakEntries) {
    if (e.tries !== -1) { temp++; if (temp > best) best = temp; }
    else temp = 0;
  }
  current = temp;

  return { total, winPct, current, best, dist };
}

function renderStats(stats, currentTries) {
  document.getElementById('stat-games').textContent  = stats.total;
  document.getElementById('stat-pct').textContent    = stats.winPct + '%';
  document.getElementById('stat-streak').textContent = stats.current;
  document.getElementById('stat-best').textContent   = stats.best;

  const chart = document.getElementById('dist-chart');
  chart.innerHTML = '';

  const rows = [
    { key: '1',  label: '1' },
    { key: '2',  label: '2' },
    { key: '3',  label: '3' },
    { key: '4',  label: '4' },
    { key: '5',  label: '5' },
    { key: '6',  label: '6' },
    { key: '-1', label: '💀' },
  ];

  const maxCount = Math.max(...Object.values(stats.dist), 1);

  for (const { key, label } of rows) {
    const count    = stats.dist[key] ?? 0;
    const isActive = currentTries !== null && String(currentTries) === key;

    const rowEl = document.createElement('div');
    rowEl.className = 'dist-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'dist-row-label';
    labelEl.textContent = label;

    const trackEl = document.createElement('div');
    trackEl.className = 'dist-track';

    const barEl = document.createElement('div');
    if (count === 0) {
      barEl.className = 'dist-bar dist-bar--zero';
      barEl.textContent = '∅';
    } else {
      barEl.className = 'dist-bar' + (isActive ? ' dist-bar--active' : '');
      barEl.style.width = (count / maxCount * 100) + '%';
      barEl.textContent = count;
    }

    trackEl.appendChild(barEl);
    rowEl.appendChild(labelEl);
    rowEl.appendChild(trackEl);
    chart.appendChild(rowEl);
  }
}

function revealInstant(r, guess, result) {
  for (let c = 0; c < WORD_LEN; c++) {
    tiles[r][c].dataset.state = result[c];
    promoteKey(guess[c], result[c]);
  }
}

function restoreGame(guesses, tries) {
  for (const guess of guesses) {
    const result = evaluate(guess);
    for (let c = 0; c < WORD_LEN; c++) {
      tiles[row][c].textContent = guess[c];
    }
    revealInstant(row, guess, result);
    tiles[row][0].parentElement.classList.remove('current');
    row++;
    col = 0;
    if (row < MAX_ROWS) tiles[row][0].parentElement.classList.add('current');
  }
  over = true;
  if (row < MAX_ROWS) tiles[row][0].parentElement.classList.remove('current');
}

// ── Calendar ──────────────────────────────────────────────────────────────────

const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro'];

function toggleCalendar() {
  const panel = document.getElementById('calendar-panel');
  const isHidden = panel.classList.toggle('hidden');
  if (!isHidden) renderCalendar();
}

function renderCalendar() {
  const history = loadHistory();

  const firstDate = words.length ? words[0].date : realTodayStr;
  const [firstY, firstM] = firstDate.split('-').map(Number);
  const [realY, realM]   = realTodayStr.split('-').map(Number);

  document.getElementById('cal-month-label').textContent =
    `${MONTHS_PT[calMonth]} ${calYear}`;

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  prevBtn.disabled = calYear < firstY || (calYear === firstY && calMonth <= firstM - 1);
  nextBtn.disabled = calYear > realY  || (calYear === realY  && calMonth >= realM - 1);

  prevBtn.onclick = () => {
    if (calMonth === 0) { calYear--; calMonth = 11; }
    else calMonth--;
    renderCalendar();
  };
  nextBtn.onclick = () => {
    if (calMonth === 11) { calYear++; calMonth = 0; }
    else calMonth++;
    renderCalendar();
  };

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-day--empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isFuture = dateStr > realTodayStr;
    const isToday  = dateStr === realTodayStr;
    const result   = history[dateStr] ?? null;
    const hasWord  = words.some(w => w.date === dateStr);

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    if (result) {
      if (result.late) {
        cell.classList.add(result.tries !== -1 ? 'cal-day--late-won' : 'cal-day--late-lost');
      } else {
        cell.classList.add(result.tries !== -1 ? 'cal-day--won' : 'cal-day--lost');
      }
    } else if (isFuture || !hasWord) {
      cell.classList.add('cal-day--future');
    } else {
      cell.classList.add('cal-day--playable');
      cell.addEventListener('click', () => {
        const [y, m, d] = dateStr.split('-');
        loadDate(dateStr);
        showToast(`${d}/${m}/${y}`, 2000, 'invalid');
      });
    }

    if (isToday) cell.classList.add('cal-day--today');

    grid.appendChild(cell);
  }
}

function loadDate(dateStr) {
  const entry = words.find(w => w.date === dateStr);
  if (!entry) return;

  todayStr = dateStr;
  target   = normalize(entry.word);
  sentence = String(entry.sentence ?? '');

  row = 0; col = 0; over = false;

  tiles.forEach((rowTiles, r) => {
    rowTiles.forEach(t => {
      t.textContent = '';
      t.className = 'tile';
      delete t.dataset.state;
    });
    const rowEl = rowTiles[0].parentElement;
    rowEl.className = 'row' + (r === 0 ? ' current' : '');
  });

  Object.values(keyBtns).forEach(btn => delete btn.dataset.state);

  document.getElementById('calendar-panel').classList.add('hidden');
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(res.status);
    words = await res.json();
  } catch {
    showToast('Não foi possível carregar words.json. Abra via servidor local.', 5000);
    return;
  }

  try {
    const res = await fetch('palavras.txt');
    if (res.ok) {
      const text = await res.text();
      validWords = new Set(
        text.split('\n').map(normalize).filter(w => w.length === 4 || w.length === 5)
      );
    }
  } catch {
    // validation unavailable — allow all guesses
  }

  if (!Array.isArray(words) || words.length === 0) {
    showToast('words.json está vazio ou inválido.', 5000);
    return;
  }

  const now = new Date();
  todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  realTodayStr = todayStr;
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  const entry = words.find(w => w.date === todayStr) ?? { word: 'TESTE', sentence: '' };
  target   = String(entry.word     ?? '').toUpperCase().trim();
  sentence = String(entry.sentence ?? '');

  if (target.length !== WORD_LEN) {
    showToast(`Palavra inválida (precisa ter ${WORD_LEN} letras).`, 5000);
    return;
  }

  buildBoard();
  buildKeyboard();
  document.addEventListener('keydown', onKey);
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('btn-archive').addEventListener('click', toggleCalendar);
  document.addEventListener('click', e => {
    const panel = document.getElementById('calendar-panel');
    if (!panel.classList.contains('hidden') &&
        !panel.contains(e.target) &&
        e.target !== document.getElementById('btn-archive')) {
      panel.classList.add('hidden');
    }
  });
  document.getElementById('btn-stats').addEventListener('click', openStatsModal);

  const saved = getTodayResult(todayStr);
  if (saved) {
    restoreGame(saved.guesses, saved.tries);
    setTimeout(() => openModal(saved.tries), 600);
  }
}

// ── DOM builders ─────────────────────────────────────────────────────────────

function buildBoard() {
  const board = document.getElementById('board');
  for (let r = 0; r < MAX_ROWS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    if (r === 0) rowEl.classList.add('current');
    tiles[r] = [];
    for (let c = 0; c < WORD_LEN; c++) {
      const t = document.createElement('div');
      t.className = 'tile';
      rowEl.appendChild(t);
      tiles[r][c] = t;
    }
    board.appendChild(rowEl);
  }
}

function buildKeyboard() {
  const kb = document.getElementById('keyboard');
  const rowSizes = [10, 10, 10];
  KEYS.forEach((rowKeys, i) => {
    const rowEl = document.createElement('div');
    rowEl.className = `key-row key-row--${rowSizes[i]}`;
    for (const k of rowKeys) {
      const btn = document.createElement('button');
      btn.className = 'key';
      btn.textContent = k;
      if (k === 'ENTER') btn.classList.add('wide');
      btn.addEventListener('click', () => handle(k));
      if (k !== 'ENTER' && k !== '⌫') keyBtns[k] = btn;
      rowEl.appendChild(btn);
    }
    kb.appendChild(rowEl);
  });
}

// ── Input ────────────────────────────────────────────────────────────────────

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === 'Enter')          handle('ENTER');
  else if (k === 'Backspace') handle('⌫');
  else if (/^[a-zA-Z]$/.test(k)) handle(k.toUpperCase());
}

function handle(key) {
  if (over) return;
  if      (key === '⌫')    erase();
  else if (key === 'ENTER') submit();
  else                      type(key);
}

function type(letter) {
  if (col >= WORD_LEN) return;
  const t = tiles[row][col];
  t.textContent = letter;
  t.classList.remove('typed');
  void t.offsetWidth;
  t.classList.add('typed');
  col++;
}

function erase() {
  if (col <= 0) return;
  col--;
  const t = tiles[row][col];
  t.textContent = '';
  t.classList.remove('typed');
}

// ── Submission ───────────────────────────────────────────────────────────────

function submit() {
  if (col < WORD_LEN) {
    showToast('Palavra incompleta');
    shakeRow(row);
    return;
  }

  const guess = tiles[row].map(t => t.textContent).join('');

  const normalizedGuess = normalize(guess);
  const singular = normalizedGuess.endsWith('S') ? normalizedGuess.slice(0, -1) : null;
  if (validWords && !validWords.has(normalizedGuess) && (!singular || !validWords.has(singular))) {
    showToast('essa palavra não é aceita', 1800, 'invalid');
    shakeRow(row);
    return;
  }

  const result = evaluate(guess);
  const r      = row;

  reveal(r, guess, result);
  tiles[r][0].parentElement.classList.remove('current');
  row++;
  col = 0;
  if (row < MAX_ROWS) tiles[row][0].parentElement.classList.add('current');

  const delay = (WORD_LEN - 1) * FLIP_STEP + FLIP_DUR + 80;
  const won   = result.every(s => s === 'correct');
  const lost  = !won && row === MAX_ROWS;
  const isLate = todayStr !== realTodayStr;

  if (won) {
    over = true;
    const guesses = getAllGuesses();
    saveResult(todayStr, r + 1, guesses, isLate);
    setTimeout(() => {
      showToast(WIN_MSGS[r] ?? 'Correto!', 1800, 'invalid');
      bounceRow(r);
      setTimeout(() => openModal(r + 1), 1800);
    }, delay);
  } else if (lost) {
    over = true;
    saveResult(todayStr, -1, getAllGuesses(), isLate);
    setTimeout(() => {
      showToast(`palavra certa: ${target.toLowerCase()}`, 2000, 'invalid');
      setTimeout(() => openModal(-1), 2000);
    }, delay);
  }
}

// ── Wordle evaluation ────────────────────────────────────────────────────────

function evaluate(guess) {
  const result = Array(WORD_LEN).fill('absent');
  const tArr   = normalize(target).split('');
  const gArr   = guess.split('');

  for (let i = 0; i < WORD_LEN; i++) {
    if (gArr[i] === tArr[i]) {
      result[i] = 'correct';
      tArr[i]   = null;
      gArr[i]   = null;
    }
  }

  for (let i = 0; i < WORD_LEN; i++) {
    if (gArr[i] === null) continue;
    const j = tArr.indexOf(gArr[i]);
    if (j !== -1) {
      result[i] = 'present';
      tArr[j]   = null;
    }
  }

  return result;
}

// ── Tile reveal ──────────────────────────────────────────────────────────────

function reveal(r, guess, result) {
  for (let c = 0; c < WORD_LEN; c++) {
    const tile   = tiles[r][c];
    const state  = result[c];
    const letter = guess[c];

    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.dataset.state = state;
        promoteKey(letter, state);
      }, FLIP_DUR / 2);
      tile.addEventListener('animationend', () => tile.classList.remove('flip'), { once: true });
    }, c * FLIP_STEP);
  }
}

function promoteKey(letter, state) {
  const btn = keyBtns[letter];
  if (!btn) return;
  if (!btn.dataset.state || STATE_RANK[state] > STATE_RANK[btn.dataset.state]) {
    btn.dataset.state = state;
  }
}

// ── Row animations ────────────────────────────────────────────────────────────

function shakeRow(r) {
  const rowEl = tiles[r][0].parentElement;
  rowEl.classList.add('shake');
  rowEl.addEventListener('animationend', () => rowEl.classList.remove('shake'), { once: true });
}

function bounceRow(r) {
  tiles[r].forEach((t, i) => {
    setTimeout(() => {
      t.classList.add('bounce');
      t.addEventListener('animationend', () => t.classList.remove('bounce'), { once: true });
    }, i * 100);
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, dur = 1800, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => el.classList.remove('show'), dur);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(currentTries = null) {
  const modal = document.querySelector('.modal');
  modal.classList.remove('modal--stats-only', 'modal--lost');
  document.getElementById('modal-word').textContent     = target;
  document.getElementById('modal-sentence').textContent = sentence;
  renderStats(computeStats(), currentTries);
  document.getElementById('overlay').classList.remove('hidden');
}

function openStatsModal() {
  document.querySelector('.modal').classList.add('modal--stats-only');
  const saved = getTodayResult(todayStr);
  renderStats(computeStats(), saved ? saved.tries : null);
  document.getElementById('overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('overlay').classList.add('hidden');
}

init();
