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

const STORAGE_KEY = 'termooo_history';

function normalize(w) {
  return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

// ── Persistence ───────────────────────────────────────────────────────────────

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; }
  catch { return {}; }
}

function saveResult(date, tries, guesses) {
  const history = loadHistory();
  history[date] = { tries, guesses };
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

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  let words;
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
  document.getElementById('modal-close').addEventListener('click', closeModal);

  const saved = getTodayResult(todayStr);
  if (saved) {
    restoreGame(saved.guesses, saved.tries);
    setTimeout(() => openModal(saved.tries !== -1), 600);
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

  if (won) {
    over = true;
    const guesses = getAllGuesses();
    saveResult(todayStr, r + 1, guesses);
    setTimeout(() => {
      showToast(WIN_MSGS[r] ?? 'Correto!', 1800);
      bounceRow(r);
      setTimeout(() => openModal(true), 1800);
    }, delay);
  } else if (lost) {
    over = true;
    saveResult(todayStr, -1, getAllGuesses());
    setTimeout(() => openModal(false), delay);
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

function openModal(won) {
  document.getElementById('modal-icon').textContent     = won ? '🎉' : '😔';
  document.getElementById('modal-label').textContent    = won ? 'Você acertou!' : 'A palavra era';
  document.getElementById('modal-word').textContent     = target;
  document.getElementById('modal-sentence').textContent = sentence;
  document.getElementById('overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('overlay').classList.add('hidden');
}

init();
