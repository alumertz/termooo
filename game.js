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
let row       = 0;
let col       = 0;
let over      = false;
let tiles     = [];
let keyBtns   = {};
let toastTmr  = null;
let validWords = null;

function normalize(w) {
  return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
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
        text.split('\n').map(normalize).filter(w => w.length === 5)
      );
    }
  } catch {
    // validation unavailable — allow all guesses
  }

  if (!Array.isArray(words) || words.length === 0) {
    showToast('words.json está vazio ou inválido.', 5000);
    return;
  }

  const entry = words[dayIndex() % words.length];
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
}

function dayIndex() {
  const origin = new Date(2024, 0, 1);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - origin) / 86_400_000));
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

  if (validWords && !validWords.has(guess)) {
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
    setTimeout(() => {
      showToast(WIN_MSGS[r] ?? 'Correto!', 1800);
      bounceRow(r);
      setTimeout(() => openModal(true), 1800);
    }, delay);
  } else if (lost) {
    over = true;
    setTimeout(() => openModal(false), delay);
  }
}

// ── Wordle evaluation ────────────────────────────────────────────────────────

function evaluate(guess) {
  const result = Array(WORD_LEN).fill('absent');
  const tArr   = target.split('');
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
