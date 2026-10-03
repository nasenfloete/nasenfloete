'use strict';

// ---------- Hilfsfunktionen ----------
const $ = (sel) => document.querySelector(sel);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

// ---------- Laute & Stufen (Inhalte in content.js) ----------
const normSound = (s) => (s || '').trim().toLowerCase();
const soundLabel = (s) => (SOUNDS[s] ? SOUNDS[s].label : s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Ohne Laut');
const levelOf = (w) => Number(w.level) || 1;
// Reihenfolge: bekannte Laute wie in content.js, danach eigene, "ohne Laut" zuletzt.
const soundOrder = (s) => {
  const i = Object.keys(SOUNDS).indexOf(s);
  return i >= 0 ? String(i).padStart(3, '0') : s ? 'x' + s : '\uffff';
};
const bySoundOrder = (a, b) => soundOrder(a).localeCompare(soundOrder(b));

// ---------- Einstellungen (nur auf diesem Gerät) ----------
const DEFAULT_SETTINGS = { rounds: 5, showWord: false, chimes: true, voice: true, focus: '', level: 1, mode: 'judge' };
const settings = (() => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('hg-settings') || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
})();
function saveSettings() {
  try {
    localStorage.setItem('hg-settings', JSON.stringify(settings));
  } catch {}
}

// ---------- Daten ----------
let words = [];
let clips = [];

async function loadData() {
  [words, clips] = await Promise.all([DB.allWords(), DB.allClips()]);
}
const clipsOf = (owner, kind) => clips.filter((c) => c.owner === owner && c.kind === kind);
const clipBlob = (clip) => new Blob([clip.data], { type: clip.type || 'audio/webm' });

// ---------- Audio ----------
const player = new Audio();
player.preload = 'auto';
let playerUrl = null;
let audioCtx = null;

function unlockAudio() {
  // Muss in einem Tipp-Handler laufen, sonst blockieren iOS/Android die Wiedergabe.
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  // iOS gibt die Sprachausgabe erst nach einer Äußerung innerhalb eines Tipps frei.
  if (window.speechSynthesis && !unlockAudio.spoke) {
    unlockAudio.spoke = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

function stopClip() {
  player.pause();
  if (window.speechSynthesis) speechSynthesis.cancel();
  player.onended = player.onerror = null;
}

// Spielt eine Aufnahme ab und löst auf, sobald sie fertig ist.
function playClip(clip) {
  stopClip();
  return new Promise((resolve) => {
    if (playerUrl) URL.revokeObjectURL(playerUrl);
    playerUrl = URL.createObjectURL(clipBlob(clip));
    player.src = playerUrl;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve();
    };
    // Sicherheitsnetz, falls "ended" nie kommt.
    const guard = setTimeout(finish, 15000);
    player.onended = finish;
    player.onerror = finish;
    player.play().catch(finish);
  });
}

function chime(good) {
  if (!settings.chimes || !audioCtx) return;
  const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [392, 311.13];
  const step = good ? 0.09 : 0.18;
  const now = audioCtx.currentTime;
  notes.forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = good ? 'triangle' : 'sine';
    osc.frequency.value = f;
    const t = now + i * step;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (good ? 0.35 : 0.4));
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
  return wait(notes.length * step * 1000 + 250);
}

// Vorlesestimme des Geräts – für ein Kind, das noch nicht lesen kann.
let germanVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const voices = speechSynthesis.getVoices().filter((v) => /^de(-|_|$)/i.test(v.lang));
  germanVoice = voices.find((v) => /de-DE/i.test(v.lang) && v.localService) || voices[0] || null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function speak(text) {
  if (!settings.voice || !window.speechSynthesis || !text) return Promise.resolve();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (germanVoice) u.voice = germanVoice;
    u.rate = 0.95;
    u.pitch = 1.15;
    const guard = setTimeout(resolve, 5000);
    u.onend = u.onerror = () => {
      clearTimeout(guard);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

const PRAISE = ['Super!', 'Toll gehört!', 'Richtig gut!', 'Prima!', 'Klasse!'];
const COMFORT = ['Hör nochmal genau hin.', 'Nicht schlimm. Hör mal.', 'Fast! Hör nochmal.'];
const randomOf = (list) => list[Math.floor(Math.random() * list.length)];

// Eigene Aufnahme, sonst Vorlesestimme.
async function sayFeedback(kind) {
  const clip = pickFeedback(kind);
  if (clip) return playClip(clip);
  return speak(randomOf(kind === 'praise' ? PRAISE : COMFORT));
}

// Abwechselnde Wahl aus Lob/Trost-Aufnahmen, damit nicht immer dieselbe kommt.
const lastPick = {};
function pickFeedback(kind) {
  const list = clipsOf('feedback', kind);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let c;
  do c = list[Math.floor(Math.random() * list.length)];
  while (c.id === lastPick[kind]);
  lastPick[kind] = c.id;
  return c;
}

// ---------- Bildschirme ----------
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  window.scrollTo(0, 0);
}

// Filter: sound = Laut ('' = alle), level = Stufe (0 = alle).
function playableQuestions(sound = '', level = 0) {
  const qs = [];
  for (const w of words) {
    if (sound && normSound(w.sound) !== sound) continue;
    if (level && levelOf(w) !== level) continue;
    for (const c of clipsOf(w.id, 'correct')) qs.push({ word: w, clip: c, isCorrect: true });
    for (const c of clipsOf(w.id, 'wrong')) qs.push({ word: w, clip: c, isCorrect: false });
  }
  return qs;
}

// Paar-Modus braucht pro Wort eine richtige und eine falsche Aufnahme.
function playablePairs(sound = '', level = 0) {
  return words.filter(
    (w) =>
      (!sound || normSound(w.sound) === sound) &&
      (!level || levelOf(w) === level) &&
      clipsOf(w.id, 'correct').length &&
      clipsOf(w.id, 'wrong').length
  );
}

const MODES = {
  judge: { icon: '👍👎', label: 'Richtig oder falsch?' },
  pair: { icon: '🗣️🗣️', label: 'Welches ist richtig?' },
};

function updateHome() {
  const all = playableQuestions();
  // Modus-Auswahl: der Paar-Modus erscheint erst, wenn es dafür Aufnahmen gibt.
  const pairsAvailable = playablePairs().length > 0;
  if (settings.mode === 'pair' && !pairsAvailable) settings.mode = 'judge';
  const mp = $('#mode-picker');
  mp.hidden = !pairsAvailable;
  mp.innerHTML = Object.entries(MODES)
    .map(
      ([m, info]) => `<button class="sound-chip mode-chip ${m === settings.mode ? 'active' : ''}" data-mode="${m}" aria-label="${info.label}">
        <span class="stars">${info.icon}</span><span class="tiny">${info.label}</span></button>`
    )
    .join('');

  $('#home-hint').textContent = all.length
    ? ''
    : 'Noch keine Aufnahmen. Eltern: ⚙️ unten gedrückt halten und Wörter aufnehmen.';
  $('#btn-play').classList.toggle('disabled', !all.length);

  // Laut-Auswahl (mit Bild, weil das Kind nicht lesen kann) – nur bei mindestens zwei Lauten.
  const pool = settings.mode === 'pair' ? playablePairs() : all.map((q) => q.word);
  const sounds = [...new Set(pool.map((w) => normSound(w.sound)).filter(Boolean))].sort(bySoundOrder);
  if (settings.focus && !sounds.includes(settings.focus)) settings.focus = '';
  const sp = $('#sound-picker');
  sp.hidden = sounds.length < 2;
  sp.innerHTML = ['', ...sounds]
    .map((s) => {
      const icon = s ? (SOUNDS[s] ? SOUNDS[s].emoji + ' ' : '') + escapeHtml(soundLabel(s)) : 'Alle';
      return `<button class="sound-chip ${s === settings.focus ? 'active' : ''}" data-sound="${escapeHtml(s)}">${icon}</button>`;
    })
    .join('');

  // Stufen-Auswahl: nur Stufen, die es für den gewählten Laut gibt.
  const levelPool = settings.mode === 'pair' ? playablePairs(settings.focus) : playableQuestions(settings.focus).map((q) => q.word);
  const levels = [...new Set(levelPool.map(levelOf))].sort();
  if (!levels.includes(settings.level)) settings.level = levels[0] || 1;
  const lp = $('#level-picker');
  lp.hidden = levels.length < 2;
  lp.innerHTML = levels
    .map(
      (l) => `<button class="sound-chip level-chip ${l === settings.level ? 'active' : ''}" data-level="${l}" aria-label="${LEVELS[l].label}">
        <span class="stars">${LEVELS[l].stars}</span><span class="tiny">${LEVELS[l].label}</span></button>`
    )
    .join('');
}

// ---------- Spiel ----------
// token wird bei jedem Start/Beenden erhöht; laufende Abläufe mit altem Token brechen ab.
const game = { mode: 'judge', questions: [], index: 0, score: 0, results: [], busy: false, token: 0 };

function buildRound(count) {
  const pool = playableQuestions(settings.focus, settings.level);
  const right = shuffle(pool.filter((q) => q.isCorrect));
  const wrong = shuffle(pool.filter((q) => !q.isCorrect));
  const out = [];
  // Ungefähr halb richtig, halb falsch – soweit Aufnahmen vorhanden sind.
  let r = 0, w = 0;
  while (out.length < count) {
    const useRight = right.length && (!wrong.length || Math.random() < 0.5);
    out.push(useRight ? right[r++ % right.length] : wrong[w++ % wrong.length]);
  }
  return spreadOut(out);
}

// Nicht zweimal direkt hintereinander dasselbe Wort, wenn es sich vermeiden lässt.
function spreadOut(out) {
  for (let i = 1; i < out.length; i++) {
    if (out[i].word.id === out[i - 1].word.id) {
      const j = out.findIndex((q, k) => k > i && q.word.id !== out[i - 1].word.id && (!out[i + 1] || q.word.id !== out[i + 1].word.id));
      if (j > 0) [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

// Paar-Runde: pro Frage ein Wort, eine richtige und eine falsche Aufnahme.
// Die richtige Seite ist pro Runde ausgeglichen verteilt, damit "immer links tippen" nicht funktioniert.
function buildPairRound(count) {
  const pool = playablePairs(settings.focus, settings.level);
  const out = [];
  while (out.length < count) {
    for (const w of shuffle(pool)) {
      if (out.length >= count) break;
      out.push({ word: w, correct: randomOf(clipsOf(w.id, 'correct')), wrong: randomOf(clipsOf(w.id, 'wrong')) });
    }
  }
  const sides = shuffle(Array.from({ length: count }, (_, i) => i % 2));
  return spreadOut(out).map((q, i) => ({ ...q, correctSide: sides[i] }));
}

function recordAnswer(q, ok, extra) {
  DB.addAnswer({ wordId: q.word.id, sound: normSound(q.word.sound), level: levelOf(q.word), ok, ts: Date.now(), ...extra }).catch(() => {});
}

// Gemeinsamer Abschluss einer Frage für beide Modi.
function advance(token) {
  if (token !== game.token) return;
  game.index++;
  if (game.index >= game.questions.length) finishGame();
  else {
    renderProgress();
    game.mode === 'pair' ? askPair() : askQuestion();
  }
}

function startGame() {
  unlockAudio();
  const pair = settings.mode === 'pair';
  const available = pair ? playablePairs(settings.focus, settings.level).length : playableQuestions(settings.focus, settings.level).length;
  if (!available) {
    toast('Erst Wörter aufnehmen (⚙️ gedrückt halten)');
    return;
  }
  game.token++;
  game.mode = pair ? 'pair' : 'judge';
  game.questions = pair ? buildPairRound(settings.rounds) : buildRound(settings.rounds);
  game.index = 0;
  game.score = 0;
  game.results = [];
  show(pair ? 'pair' : 'game');
  renderProgress();
  pair ? askPair() : askQuestion();
}

function quitGame() {
  game.token++;
  stopClip();
  game.busy = false;
  updateHome();
  show('home');
}

function renderProgress() {
  const html = game.questions
    .map((_, i) => {
      const res = game.results[i];
      const cls = res === undefined ? (i === game.index ? 'current' : '') : res ? 'ok' : 'no';
      return `<span class="dot ${cls}"></span>`;
    })
    .join('');
  document.querySelectorAll('.progress').forEach((el) => (el.innerHTML = html));
}

function setAnswersEnabled(on) {
  $('#btn-right').disabled = !on;
  $('#btn-wrong').disabled = !on;
  document.querySelector('.answers').classList.toggle('waiting', !on);
}

async function askQuestion() {
  const q = game.questions[game.index];
  $('#feedback').hidden = true;
  $('#q-emoji').textContent = q.word.emoji || '🔊';
  $('#q-word').textContent = settings.showWord ? q.word.text : '';
  const pic = $('#btn-replay');
  pic.classList.remove('pop');
  void pic.offsetWidth;
  pic.classList.add('pop');
  setAnswersEnabled(false);
  game.busy = true;
  await wait(450);
  await listen();
}

async function listen() {
  const token = game.token;
  const q = game.questions[game.index];
  const pic = $('#btn-replay');
  pic.classList.add('playing');
  await playClip(q.clip);
  pic.classList.remove('playing');
  if (token !== game.token) return;
  game.busy = false;
  setAnswersEnabled(true);
}

async function answer(saidCorrect) {
  if (game.busy) return;
  unlockAudio();
  game.busy = true;
  setAnswersEnabled(false);
  const token = game.token;
  const q = game.questions[game.index];
  const ok = saidCorrect === q.isCorrect;
  game.results[game.index] = ok;
  if (ok) game.score++;
  renderProgress();
  recordAnswer(q, ok, { isCorrect: q.isCorrect });

  const fb = $('#feedback');
  fb.className = 'feedback ' + (ok ? 'good' : 'bad');
  $('#feedback-icon').textContent = ok ? '⭐' : '🤔';
  $('#feedback-text').textContent = ok
    ? q.isCorrect ? 'Ja, das war richtig!' : 'Genau, das war falsch!'
    : q.isCorrect ? 'Das war doch richtig.' : 'Das war falsch gesprochen.';
  fb.hidden = false;

  if (ok) {
    confetti();
    await chime(true);
    await sayFeedback('praise');
    await wait(500);
  } else {
    $('#screen-game').classList.add('shake');
    setTimeout(() => $('#screen-game').classList.remove('shake'), 500);
    await chime(false);
    await sayFeedback('comfort');
    // Zum Lernen: die richtige Aussprache vorspielen.
    const correct = clipsOf(q.word.id, 'correct')[0];
    if (correct) {
      $('#feedback-icon').textContent = '👂';
      $('#feedback-text').textContent = 'So klingt es richtig:';
      await speak('So klingt es richtig:');
      await wait(300);
      await playClip(correct);
    }
    await wait(700);
  }

  advance(token);
}

// ---------- Spiel 2: Welches ist richtig? ----------
const pairCards = () => [...document.querySelectorAll('.pair-card')];
const pairClip = (q, side) => (side === q.correctSide ? q.correct : q.wrong);

function setPairEnabled(on) {
  document.querySelector('.pair-cards').classList.toggle('locked', !on);
  $('#pair-replay').disabled = !on;
}

async function askPair() {
  const q = game.questions[game.index];
  $('#pair-emoji').textContent = q.word.emoji || '🔊';
  $('#pair-word').textContent = settings.showWord ? q.word.text : '';
  pairCards().forEach((c) => {
    c.className = 'pair-card ' + (c.dataset.side === '0' ? 'left' : 'right');
    c.querySelector('.pc-mark').textContent = '';
  });
  const emoji = $('#pair-emoji');
  emoji.classList.remove('pop');
  void emoji.offsetWidth;
  emoji.classList.add('pop');
  setPairEnabled(false);
  game.busy = true;
  await wait(500);
  await playPair();
}

// Beide Aufnahmen nacheinander; die gerade laufende Karte leuchtet.
async function playPair() {
  const token = game.token;
  const q = game.questions[game.index];
  const cards = pairCards();
  for (const side of [0, 1]) {
    cards[side].classList.add('playing');
    await playClip(pairClip(q, side));
    cards[side].classList.remove('playing');
    if (token !== game.token) return;
    await wait(side === 0 ? 450 : 150);
  }
  if (token !== game.token) return;
  game.busy = false;
  setPairEnabled(true);
}

async function answerPair(side) {
  if (game.busy) return;
  unlockAudio();
  game.busy = true;
  setPairEnabled(false);
  const token = game.token;
  const q = game.questions[game.index];
  const ok = side === q.correctSide;
  game.results[game.index] = ok;
  if (ok) game.score++;
  renderProgress();
  recordAnswer(q, ok, { mode: 'pair' });

  const cards = pairCards();
  const chosen = cards[side];
  const right = cards[q.correctSide];
  if (ok) {
    chosen.classList.add('good');
    chosen.querySelector('.pc-mark').textContent = '⭐';
    confetti();
    await chime(true);
    await sayFeedback('praise');
    await wait(400);
  } else {
    chosen.classList.add('bad', 'shake');
    chosen.querySelector('.pc-mark').textContent = '✖';
    await chime(false);
    await sayFeedback('comfort');
    if (token !== game.token) return;
    // Zum Lernen: die richtige Karte zeigen und nochmal vorspielen.
    right.classList.add('good', 'playing');
    right.querySelector('.pc-mark').textContent = '✔';
    await speak('Das hier ist richtig:');
    await playClip(q.correct);
    right.classList.remove('playing');
    await wait(600);
  }
  advance(token);
}

function finishGame() {
  const n = game.questions.length;
  const s = game.score;
  $('#result-stars').innerHTML = game.results
    .map((ok, i) => `<span class="star ${ok ? '' : 'empty'}" style="animation-delay:${i * 90}ms">${ok ? '⭐' : '☆'}</span>`)
    .join('');
  const ratio = s / n;
  $('#result-text').textContent =
    `${s} von ${n} richtig! ` + (ratio === 1 ? 'Perfekt! 🏆' : ratio >= 0.7 ? 'Super gemacht! 🎉' : ratio >= 0.4 ? 'Gut gemacht! 👏' : 'Weiter üben! 💪');
  show('result');
  if (ratio >= 0.7) {
    confetti(80);
    chime(true);
  }
  speak(s === 0 ? 'Das üben wir nochmal!' : s === 1 ? 'Du hast einen Stern!' : `Du hast ${s} Sterne!` + (ratio >= 0.7 ? ' Super!' : ''));
}

function confetti(n = 40) {
  const box = $('#confetti');
  const colors = ['#ff5d8f', '#ffb938', '#4cc38a', '#5b8cff', '#b06bff'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.3 + 's';
    p.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
    p.style.setProperty('--dx', (Math.random() - 0.5) * 40 + 'vw');
    p.style.setProperty('--rot', Math.random() * 720 + 'deg');
    box.appendChild(p);
    setTimeout(() => p.remove(), 3000);
  }
}

// ---------- Elternbereich ----------
function openParents() {
  stopClip();
  renderParents();
  show('parents');
  showStorageInfo();
}

function clipRow(clip, label) {
  return `<span class="clip">
      <button class="chip play-clip" data-clip="${clip.id}" aria-label="Abspielen">▶ ${label}</button>
      <button class="chip del del-clip" data-clip="${clip.id}" aria-label="Löschen">🗑</button>
    </span>`;
}

// Merkt sich, welche <details> offen sind, damit Neuzeichnen sie nicht zuklappt.
function openKeys(box) {
  return new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.key));
}

function wordCard(w) {
  const good = clipsOf(w.id, 'correct');
  const bad = clipsOf(w.id, 'wrong');
  const warn = !good.length ? 'Richtige Aussprache fehlt' : !bad.length ? 'Falsche Aussprache fehlt' : '';
  return `<div class="card word" data-word="${w.id}">
    <div class="word-head">
      <button class="word-title edit-word" data-word="${w.id}">
        <span class="w-emoji">${escapeHtml(w.emoji || '🔊')}</span>
        <span class="w-text">${escapeHtml(w.text)}${w.wrongHint ? `<small> ≠ ${escapeHtml(w.wrongHint)}</small>` : ''}</span>
        <span class="badge">${LEVELS[levelOf(w)].stars}</span>
        <span class="w-edit">✏️</span>
      </button>
      <button class="chip del del-word" data-word="${w.id}" aria-label="Löschen">🗑</button>
    </div>
    <div class="variant">
      <div class="v-label ok">✅ Richtig</div>
      <div class="clips">
        ${good.map((c, i) => clipRow(c, good.length > 1 ? i + 1 : '')).join('')}
        <button class="chip rec record" data-word="${w.id}" data-kind="correct">🎙️ Aufnehmen</button>
      </div>
    </div>
    <div class="variant">
      <div class="v-label no">❌ Falsch</div>
      <div class="clips">
        ${bad.map((c, i) => clipRow(c, i + 1)).join('')}
        <button class="chip rec record" data-word="${w.id}" data-kind="wrong">🎙️ Aufnehmen</button>
      </div>
    </div>
    ${warn ? `<p class="tiny warn">${warn}</p>` : ''}
  </div>`;
}

function renderParents() {
  const list = $('#word-list');
  if (!words.length) {
    list.innerHTML = '';
  } else {
    const open = openKeys(list);
    const groups = {};
    for (const w of words) (groups[normSound(w.sound)] ||= []).push(w);
    list.innerHTML =
      '<h3 class="list-title">Aufgenommen</h3>' +
      Object.keys(groups)
        .sort(bySoundOrder)
        .map((sound) => {
          const ws = groups[sound].sort((a, b) => levelOf(a) - levelOf(b) || a.created - b.created);
          const counts = [1, 2, 3].map((l) => ws.filter((w) => levelOf(w) === l).length);
          const summary = counts.map((n, i) => (n ? `${LEVELS[i + 1].stars} ${n}` : '')).filter(Boolean).join(' · ');
          const key = 'w-' + sound;
          return `<details class="word-group" data-key="${escapeHtml(key)}" ${open.has(key) ? 'open' : ''}>
            <summary class="card"><b>${SOUNDS[sound] ? SOUNDS[sound].emoji + ' ' : ''}${escapeHtml(soundLabel(sound))}</b>
              <span class="tiny">${summary}</span></summary>
            ${ws.map(wordCard).join('')}
          </details>`;
        })
        .join('');
  }

  const fbBox = $('#feedback-sounds');
  const praise = clipsOf('feedback', 'praise');
  const comfort = clipsOf('feedback', 'comfort');
  fbBox.innerHTML = `
    <div class="variant">
      <div class="v-label ok">🎉 Lob</div>
      <div class="clips">
        ${praise.map((c, i) => clipRow(c, i + 1)).join('')}
        <button class="chip rec record" data-word="feedback" data-kind="praise">🎙️ Aufnehmen</button>
      </div>
    </div>
    <div class="variant">
      <div class="v-label no">🤗 Trost</div>
      <div class="clips">
        ${comfort.map((c, i) => clipRow(c, i + 1)).join('')}
        <button class="chip rec record" data-word="feedback" data-kind="comfort">🎙️ Aufnehmen</button>
      </div>
    </div>`;

  renderSuggestions();
  renderStats();
}

// Ein Katalog-Eintrag gilt als erledigt, sobald er richtig und falsch aufgenommen ist.
function findWord(text) {
  const t = text.trim().toLowerCase();
  return words.find((w) => w.text.trim().toLowerCase() === t);
}
function isComplete(w) {
  return w && clipsOf(w.id, 'correct').length && clipsOf(w.id, 'wrong').length;
}
function catalogItem(sound, level, [text, emoji, wrongHint]) {
  return { text, emoji, sound, level, wrongHint };
}
function missingItems(sound, level) {
  return CATALOG[sound][level].map((it) => catalogItem(sound, level, it)).filter((it) => !isComplete(findWord(it.text)));
}

function renderSuggestions() {
  const box = $('#suggestions');
  const open = openKeys(box);
  const firstRun = !box.children.length && !words.length;
  box.innerHTML = Object.keys(CATALOG)
    .map((sound) => {
      const info = SOUNDS[sound];
      const key = 's-' + sound;
      const levels = Object.keys(CATALOG[sound]).map(Number);
      const total = levels.reduce((n, l) => n + CATALOG[sound][l].length, 0);
      const done = levels.reduce((n, l) => n + CATALOG[sound][l].length - missingItems(sound, l).length, 0);
      return `<details class="suggest-group" data-key="${key}" ${open.has(key) || (firstRun && sound === 'ü') ? 'open' : ''}>
        <summary>${info.emoji} <b>${info.label}</b> <span class="tiny">wird zu ${info.swap} · ${done}/${total} aufgenommen</span></summary>
        ${levels
          .map((level) => {
            const missing = missingItems(sound, level).length;
            const isSentence = level > 1;
            return `<div class="variant">
              <div class="level-head">
                <span class="v-label">${LEVELS[level].stars} ${LEVELS[level].label}</span>
                ${missing ? `<button class="chip rec record-all" data-sound="${sound}" data-level="${level}">🎙️ Alle aufnehmen (${missing})</button>` : '<span class="tiny">fertig ✓</span>'}
              </div>
              <div class="clips ${isSentence ? 'sentences' : ''}">
                ${CATALOG[sound][level]
                  .map(([text, emoji, hint]) => {
                    const complete = isComplete(findWord(text));
                    return `<button class="chip suggest ${complete ? 'done' : ''}" ${complete ? 'disabled' : ''}
                      data-sound="${sound}" data-level="${level}" data-text="${escapeHtml(text)}">
                      ${emoji} ${escapeHtml(text)}${isSentence ? '' : ` <span class="tiny">(${escapeHtml(hint)})</span>`}${complete ? ' ✓' : ''}</button>`;
                  })
                  .join('')}
              </div>
            </div>`;
          })
          .join('')}
      </details>`;
    })
    .join('');
}

async function renderStats() {
  const box = $('#stats');
  let answers = [];
  try {
    answers = await DB.allAnswers();
  } catch {}
  if (!answers.length) {
    box.innerHTML = '<p class="tiny">Noch keine Antworten. Nach dem ersten Spiel siehst du hier, wie gut die Laute schon gehört werden.</p>';
    return;
  }
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const pct = (list) => (list.length ? Math.round((100 * list.filter((a) => a.ok).length) / list.length) + ' %' : '–');
  const bySound = {};
  for (const a of answers) (bySound[a.sound || ''] ||= []).push(a);
  const wordName = (id) => {
    const w = words.find((x) => x.id === id);
    return w ? `${w.emoji || ''} ${w.text}`.trim() : null;
  };

  box.innerHTML =
    Object.keys(bySound)
      .sort(bySoundOrder)
      .map((sound) => {
        const list = bySound[sound];
        const recent = list.filter((a) => a.ts >= weekAgo);
        // Alte Antworten haben kein "mode" – sie stammen alle aus dem Richtig/Falsch-Modus.
        const judge = list.filter((a) => a.mode !== 'pair');
        const pairs = list.filter((a) => a.mode === 'pair');
        const wrongClips = judge.filter((a) => !a.isCorrect);
        const rightClips = judge.filter((a) => a.isCorrect);
        const perLevel = [1, 2, 3]
          .map((l) => [l, list.filter((a) => (a.level || 1) === l)])
          .filter(([, xs]) => xs.length)
          .map(([l, xs]) => `${LEVELS[l].stars} ${pct(xs)}`)
          .join(' · ');
        // Fehler pro Wort zählen, um schwierige Wörter zu zeigen.
        const misses = {};
        for (const a of list) if (!a.ok) misses[a.wordId] = (misses[a.wordId] || 0) + 1;
        const hard = Object.entries(misses)
          .map(([id, n]) => [wordName(id), n])
          .filter(([name]) => name)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);
        return `<div class="stat">
          <div class="stat-head"><b>${SOUNDS[sound] ? SOUNDS[sound].emoji + ' ' : ''}${escapeHtml(soundLabel(sound))}</b><span class="tiny">${list.length} Antworten</span></div>
          <div class="stat-grid">
            <span>👍👎 Falsche Aussprache erkannt</span><b>${pct(wrongClips)}</b>
            <span>👍👎 Richtige Aussprache erkannt</span><b>${pct(rightClips)}</b>
            ${pairs.length ? `<span>🗣️🗣️ Richtige von zwei gefunden</span><b>${pct(pairs)} <small>(${pairs.length})</small></b>` : ''}
            <span>Letzte 7 Tage gesamt</span><b>${pct(recent)}</b>
            <span>Nach Stufe</span><b>${perLevel}</b>
          </div>
          ${hard.length ? `<p class="tiny">Schwierig: ${hard.map(([name, n]) => `${escapeHtml(name)} (${n}×)`).join(', ')}</p>` : ''}
        </div>`;
      })
      .join('') + '<button id="btn-reset-stats" class="btn">Fortschritt zurücksetzen</button>';
}

// Ein neues Wort wird erst gespeichert, wenn die erste Aufnahme gespeichert ist –
// so bleiben bei "Abbrechen" keine leeren Einträge zurück.
function startItem(item) {
  const existing = findWord(item.text);
  const word = existing || {
    id: DB.uid(),
    text: item.text,
    emoji: item.emoji || '',
    sound: normSound(item.sound),
    level: Number(item.level) || 1,
    wrongHint: item.wrongHint || '',
    created: Date.now(),
    pending: true,
  };
  openRecorder(word, clipsOf(word.id, 'correct').length ? 'wrong' : 'correct');
}

function addWord() {
  const text = $('#new-word').value.trim();
  if (!text) {
    toast('Bitte ein Wort oder einen Satz eingeben');
    $('#new-word').focus();
    return;
  }
  rec.queue = [];
  startItem({
    text,
    emoji: $('#new-emoji').value.trim(),
    sound: $('#new-sound').value,
    level: $('#new-level').value,
    wrongHint: $('#new-hint').value.trim(),
  });
  ['#new-word', '#new-emoji', '#new-hint'].forEach((s) => ($(s).value = ''));
}

let editingId = null;
function editWord(id) {
  const w = words.find((x) => x.id === id);
  if (!w) return;
  editingId = id;
  $('#edit-word').value = w.text;
  $('#edit-emoji').value = w.emoji || '';
  $('#edit-sound').value = w.sound || '';
  $('#edit-level').value = String(levelOf(w));
  $('#edit-hint').value = w.wrongHint || '';
  $('#edit-dialog').showModal();
}

async function saveEdit() {
  const w = words.find((x) => x.id === editingId);
  if (!w) return;
  w.text = $('#edit-word').value.trim() || w.text;
  w.emoji = $('#edit-emoji').value.trim();
  w.sound = normSound($('#edit-sound').value);
  w.level = Number($('#edit-level').value) || 1;
  w.wrongHint = $('#edit-hint').value.trim();
  await DB.putWord(w);
  renderParents();
}

async function deleteWord(id) {
  const w = words.find((x) => x.id === id);
  if (!w || !confirm(`„${w.text}“ mit allen Aufnahmen löschen?`)) return;
  await DB.deleteWord(id);
  await loadData();
  renderParents();
}

async function deleteClip(id) {
  if (!confirm('Aufnahme löschen?')) return;
  await DB.deleteClip(id);
  clips = clips.filter((c) => c.id !== id);
  renderParents();
}

// Langes Drücken öffnet den Elternbereich, damit das Kind nicht versehentlich hineinkommt.
function setupLongPress(btn, ms, action) {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => {
      btn.classList.remove('holding');
      timer = null;
      action();
    }, ms);
  };
  const cancel = () => {
    btn.classList.remove('holding');
    if (timer) clearTimeout(timer);
    timer = null;
  };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------- Aufnahme ----------
// word = Wort-Objekt (auch noch ungespeichert) oder null bei Lob/Trost; queue = weitere Einträge für "Alle aufnehmen".
const rec = { word: null, owner: null, kind: null, recorder: null, stream: null, chunks: [], data: null, type: null, timer: null, started: 0, queue: [], queueTotal: 0 };
const KIND_LABEL = {
  correct: 'richtig ✅',
  wrong: 'falsch ❌',
  praise: 'Lob 🎉',
  comfort: 'Trost 🤗',
};

function pickMime() {
  if (!window.MediaRecorder) return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/aac'];
  return types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

function openRecorder(target, kind) {
  stopClip();
  const w = typeof target === 'string' ? words.find((x) => x.id === target) || null : target;
  rec.word = w;
  rec.owner = w ? w.id : 'feedback';
  rec.kind = kind;
  rec.data = null;
  rec.type = null;
  const sentence = w && levelOf(w) > 1;
  const what = sentence ? 'den Satz' : 'das Wort';
  $('#rec-title').textContent = (w ? `${w.emoji || ''} ${w.text}`.trim() : 'Feedback-Spruch') + ' – ' + KIND_LABEL[kind];
  $('#rec-sub').textContent =
    kind === 'wrong'
      ? w && w.wrongHint
        ? `Sag absichtlich: „${w.wrongHint}“`
        : `Sag ${what} absichtlich falsch (z. B. „Sokolade“ statt „Schokolade“).`
      : kind === 'correct'
      ? `Sag ${what} deutlich und richtig.` + (w && w.wrongHint ? ' Betonung und Tempo gleich wie bei der falschen Version.' : '')
      : kind === 'praise'
      ? 'Z. B. „Super gemacht!“ oder „Toll gehört!“'
      : 'Z. B. „Nicht schlimm, hör nochmal genau hin!“';
  const inQueue = rec.queueTotal > 0;
  $('#rec-queue').hidden = !inQueue;
  $('#rec-queue').textContent = inQueue ? `Eintrag ${rec.queueTotal - rec.queue.length} von ${rec.queueTotal}` : '';
  $('#rec-skip').hidden = !inQueue;
  $('#rec-status').textContent = window.MediaRecorder ? 'Tippen zum Aufnehmen' : 'Aufnahme wird hier nicht unterstützt – bitte Datei wählen.';
  $('#rec-btn').classList.remove('recording');
  $('#rec-btn').disabled = !window.MediaRecorder;
  $('#rec-preview').disabled = true;
  $('#rec-save').disabled = true;
  if (!$('#rec-dialog').open) $('#rec-dialog').showModal();
}

// Nächster Eintrag der Serie, sonst Dialog schließen.
function nextInQueue() {
  const next = rec.queue.shift();
  if (next) {
    startItem(next);
    return;
  }
  rec.queueTotal = 0;
  closeRecorder();
  toast('Fertig ✔');
}

function recordAll(sound, level) {
  const items = missingItems(sound, level);
  if (!items.length) return;
  rec.queue = items;
  rec.queueTotal = items.length;
  nextInQueue();
}

async function toggleRecording() {
  if (rec.recorder && rec.recorder.state === 'recording') {
    rec.recorder.stop();
    return;
  }
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    $('#rec-status').textContent = 'Kein Mikrofonzugriff. Bitte in den Einstellungen erlauben.';
    return;
  }
  const mime = pickMime();
  rec.chunks = [];
  rec.recorder = new MediaRecorder(rec.stream, mime ? { mimeType: mime } : undefined);
  rec.recorder.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
  rec.recorder.onstop = async () => {
    clearInterval(rec.timer);
    rec.stream.getTracks().forEach((t) => t.stop());
    $('#rec-btn').classList.remove('recording');
    const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || mime || 'audio/webm' });
    rec.type = blob.type;
    rec.data = await blob.arrayBuffer();
    const secs = ((Date.now() - rec.started) / 1000).toFixed(1);
    $('#rec-status').textContent = `Aufgenommen (${secs} s). Anhören oder neu aufnehmen.`;
    $('#rec-preview').disabled = false;
    $('#rec-save').disabled = false;
  };
  rec.recorder.start();
  rec.started = Date.now();
  $('#rec-btn').classList.add('recording');
  $('#rec-status').textContent = 'Aufnahme läuft … Tippen zum Stoppen';
  rec.timer = setInterval(() => {
    const s = (Date.now() - rec.started) / 1000;
    $('#rec-status').textContent = `Aufnahme läuft … ${s.toFixed(0)} s – Tippen zum Stoppen`;
    if (s >= 15 && rec.recorder.state === 'recording') rec.recorder.stop();
  }, 250);
}

function stopRecorder() {
  if (rec.recorder && rec.recorder.state === 'recording') {
    rec.recorder.onstop = null;
    rec.recorder.stop();
    rec.stream.getTracks().forEach((t) => t.stop());
  }
  clearInterval(rec.timer);
  rec.recorder = null;
  stopClip();
}

function closeRecorder() {
  stopRecorder();
  rec.queue = [];
  rec.queueTotal = 0;
  $('#rec-dialog').close();
  renderParents();
}

async function saveRecording() {
  if (!rec.data) return;
  const { word, owner, kind } = rec;
  if (word && word.pending) {
    delete word.pending;
    await DB.putWord(word);
    words.push(word);
  }
  const clip = { id: DB.uid(), owner, kind, data: rec.data, type: rec.type, created: Date.now() };
  await DB.putClip(clip);
  clips.push(clip);
  stopRecorder();
  toast('Gespeichert ✔', 1200);
  // Nach der richtigen Aussprache direkt die falsche, danach ggf. der nächste Eintrag.
  if (kind === 'correct' && word && !clipsOf(word.id, 'wrong').length) {
    openRecorder(word, 'wrong');
  } else if (rec.queueTotal) {
    nextInQueue();
  } else {
    closeRecorder();
  }
}

async function pickFile(file) {
  if (!file) return;
  rec.type = file.type || 'audio/mpeg';
  rec.data = await file.arrayBuffer();
  $('#rec-status').textContent = `Datei „${file.name}“ geladen.`;
  $('#rec-preview').disabled = false;
  $('#rec-save').disabled = false;
}

// ---------- Export / Import ----------
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

function exportData() {
  const payload = {
    app: 'hoer-genau',
    version: 1,
    exported: new Date().toISOString(),
    words,
    clips: clips.map((c) => ({ ...c, data: bufToB64(c.data) })),
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hoer-genau-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importData(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.app !== 'hoer-genau') throw new Error('Unbekanntes Format');
    for (const w of payload.words || []) await DB.putWord(w);
    for (const c of payload.clips || []) await DB.putClip({ ...c, data: b64ToBuf(c.data) });
    await loadData();
    renderParents();
    toast(`Importiert: ${(payload.words || []).length} Wörter`);
  } catch (err) {
    toast('Import fehlgeschlagen: ' + err.message, 3500);
  }
}

async function showStorageInfo() {
  const el = $('#storage-info');
  if (!navigator.storage || !navigator.storage.estimate) return;
  const { usage } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  el.textContent = `Belegt: ${(usage / 1024 / 1024).toFixed(1)} MB` + (persisted ? ' · dauerhaft gespeichert' : '');
}

// ---------- Verdrahtung ----------
function wire() {
  $('#btn-play').addEventListener('click', startGame);
  $('#btn-again').addEventListener('click', startGame);
  $('#btn-home').addEventListener('click', () => {
    updateHome();
    show('home');
  });
  document.querySelectorAll('.quit-btn').forEach((b) => b.addEventListener('click', quitGame));
  pairCards().forEach((c) => c.addEventListener('click', () => answerPair(Number(c.dataset.side))));
  $('#pair-replay').addEventListener('click', () => {
    if (game.busy) return;
    unlockAudio();
    game.busy = true;
    setPairEnabled(false);
    playPair();
  });
  $('#mode-picker').addEventListener('click', (e) => {
    const t = e.target.closest('.mode-chip');
    if (!t) return;
    settings.mode = t.dataset.mode;
    saveSettings();
    updateHome();
  });
  $('#btn-replay').addEventListener('click', () => {
    if (game.busy) return;
    unlockAudio();
    game.busy = true;
    setAnswersEnabled(false);
    listen();
  });
  $('#btn-right').addEventListener('click', () => answer(true));
  $('#btn-wrong').addEventListener('click', () => answer(false));

  setupLongPress($('#btn-parents'), 1500, openParents);
  $('#btn-parents-back').addEventListener('click', () => {
    stopClip();
    updateHome();
    show('home');
  });
  $('#btn-add-word').addEventListener('click', addWord);
  $('#new-word').addEventListener('keydown', (e) => e.key === 'Enter' && addWord());

  $('#screen-parents').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('play-clip')) {
      const c = clips.find((x) => x.id === t.dataset.clip);
      if (c) playClip(c);
    } else if (t.classList.contains('del-clip')) deleteClip(t.dataset.clip);
    else if (t.classList.contains('record')) openRecorder(t.dataset.word, t.dataset.kind);
    else if (t.classList.contains('edit-word')) editWord(t.dataset.word);
    else if (t.classList.contains('del-word')) deleteWord(t.dataset.word);
    else if (t.classList.contains('suggest')) {
      const it = CATALOG[t.dataset.sound][t.dataset.level].find(([text]) => text === t.dataset.text);
      rec.queue = [];
      rec.queueTotal = 0;
      if (it) startItem(catalogItem(t.dataset.sound, Number(t.dataset.level), it));
    } else if (t.classList.contains('record-all')) recordAll(t.dataset.sound, Number(t.dataset.level));
    else if (t.id === 'btn-reset-stats' && confirm('Fortschritt wirklich zurücksetzen?'))
      DB.clearAnswers().then(renderStats);
  });

  $('#sound-picker').addEventListener('click', (e) => {
    const t = e.target.closest('.sound-chip');
    if (!t) return;
    settings.focus = t.dataset.sound;
    saveSettings();
    updateHome();
  });
  $('#level-picker').addEventListener('click', (e) => {
    const t = e.target.closest('.level-chip');
    if (!t) return;
    settings.level = Number(t.dataset.level);
    saveSettings();
    updateHome();
  });

  document.querySelectorAll('.level-select').forEach((sel) => {
    sel.innerHTML = Object.entries(LEVELS)
      .map(([l, info]) => `<option value="${l}">${info.stars} ${info.label}</option>`)
      .join('');
  });

  $('#edit-form').addEventListener('submit', saveEdit);
  $('#edit-cancel').addEventListener('click', () => $('#edit-dialog').close());

  $('#rec-btn').addEventListener('click', toggleRecording);
  $('#rec-preview').addEventListener('click', () => rec.data && playClip({ data: rec.data, type: rec.type }));
  $('#rec-save').addEventListener('click', saveRecording);
  $('#rec-cancel').addEventListener('click', closeRecorder);
  $('#rec-skip').addEventListener('click', () => {
    stopRecorder();
    nextInQueue();
  });
  $('#rec-dialog').addEventListener('cancel', (e) => {
    e.preventDefault();
    closeRecorder();
  });
  $('#rec-file').addEventListener('change', (e) => {
    pickFile(e.target.files[0]);
    e.target.value = '';
  });

  const rounds = $('#set-rounds');
  rounds.value = String(settings.rounds);
  rounds.addEventListener('change', () => {
    settings.rounds = Number(rounds.value);
    saveSettings();
  });
  const voice = $('#set-voice');
  voice.checked = settings.voice;
  voice.addEventListener('change', () => {
    settings.voice = voice.checked;
    saveSettings();
  });
  const showWord = $('#set-show-word');
  showWord.checked = settings.showWord;
  showWord.addEventListener('change', () => {
    settings.showWord = showWord.checked;
    saveSettings();
  });
  const chimes = $('#set-chimes');
  chimes.checked = settings.chimes;
  chimes.addEventListener('change', () => {
    settings.chimes = chimes.checked;
    saveSettings();
  });

  $('#btn-export').addEventListener('click', exportData);
  $('#import-file').addEventListener('change', (e) => {
    importData(e.target.files[0]);
    e.target.value = '';
  });
}

async function init() {
  wire();
  try {
    await loadData();
  } catch (err) {
    toast('Speicher nicht verfügbar: ' + err.message, 5000);
  }
  updateHome();
  // Browser bitten, die Aufnahmen nicht automatisch zu löschen.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
