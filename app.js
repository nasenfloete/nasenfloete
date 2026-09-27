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

// ---------- Laute & Wortvorschläge ----------
// Falsch = wie ein Kind den Laut verwechselt (Ü → I, Sch → S).
const SUGGESTIONS = {
  ü: [
    ['Tür', '🚪', 'Tir'],
    ['Mütze', '🧢', 'Mitze'],
    ['Küche', '🍳', 'Kiche'],
    ['Brücke', '🌉', 'Bricke'],
    ['Schlüssel', '🔑', 'Schlissel'],
    ['Würfel', '🎲', 'Wirfel'],
    ['Füße', '🦶', 'Fiße'],
    ['Gemüse', '🥦', 'Gemise'],
    ['Kürbis', '🎃', 'Kirbis'],
    ['Glück', '🍀', 'Glick'],
    ['Tüte', '🛍️', 'Tite'],
    ['Zahnbürste', '🪥', 'Zahnbirste'],
  ],
  sch: [
    ['Schokolade', '🍫', 'Sokolade'],
    ['Schuh', '👟', 'Suh'],
    ['Schaf', '🐑', 'Saf'],
    ['Schule', '🏫', 'Sule'],
    ['Schere', '✂️', 'Sere'],
    ['Schnecke', '🐌', 'Snecke'],
    ['Schwein', '🐷', 'Swein'],
    ['Schiff', '🚢', 'Siff'],
    ['Schlange', '🐍', 'Slange'],
    ['Fisch', '🐟', 'Fiss'],
    ['Flasche', '🍾', 'Flasse'],
    ['Dusche', '🚿', 'Duse'],
  ],
};
const normSound = (s) => (s || '').trim().toLowerCase();
const soundLabel = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Ohne Laut');

// ---------- Einstellungen (nur auf diesem Gerät) ----------
const DEFAULT_SETTINGS = { rounds: 10, showWord: true, chimes: true, focus: '' };
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
}

function stopClip() {
  player.pause();
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

// focus = Laut, auf den die Runde beschränkt wird ('' = alle).
function playableQuestions(focus = '') {
  const qs = [];
  for (const w of words) {
    if (focus && normSound(w.sound) !== focus) continue;
    for (const c of clipsOf(w.id, 'correct')) qs.push({ word: w, clip: c, isCorrect: true });
    for (const c of clipsOf(w.id, 'wrong')) qs.push({ word: w, clip: c, isCorrect: false });
  }
  return qs;
}

function playableSounds() {
  return [...new Set(playableQuestions().map((q) => normSound(q.word.sound)).filter(Boolean))].sort();
}

function updateHome() {
  const n = playableQuestions().length;
  $('#home-hint').textContent = n
    ? ''
    : 'Noch keine Aufnahmen. Eltern: ⚙️ unten gedrückt halten und Wörter aufnehmen.';
  $('#btn-play').classList.toggle('disabled', !n);

  // Laut-Auswahl nur zeigen, wenn es mindestens zwei Laute gibt.
  const sounds = playableSounds();
  if (settings.focus && !sounds.includes(settings.focus)) settings.focus = '';
  const picker = $('#sound-picker');
  picker.hidden = sounds.length < 2;
  picker.innerHTML = ['', ...sounds]
    .map((s) => `<button class="sound-chip ${s === settings.focus ? 'active' : ''}" data-sound="${escapeHtml(s)}">${s ? escapeHtml(soundLabel(s)) : 'Alle'}</button>`)
    .join('');
}

// ---------- Spiel ----------
const game = { questions: [], index: 0, score: 0, results: [], busy: false };

function buildRound(count) {
  const pool = playableQuestions(settings.focus);
  const right = shuffle(pool.filter((q) => q.isCorrect));
  const wrong = shuffle(pool.filter((q) => !q.isCorrect));
  const out = [];
  // Ungefähr halb richtig, halb falsch – soweit Aufnahmen vorhanden sind.
  let r = 0, w = 0;
  while (out.length < count) {
    const useRight = right.length && (!wrong.length || Math.random() < 0.5);
    out.push(useRight ? right[r++ % right.length] : wrong[w++ % wrong.length]);
  }
  // Nicht zweimal direkt hintereinander dasselbe Wort, wenn es sich vermeiden lässt.
  for (let i = 1; i < out.length; i++) {
    if (out[i].word.id === out[i - 1].word.id) {
      const j = out.findIndex((q, k) => k > i && q.word.id !== out[i - 1].word.id && (!out[i + 1] || q.word.id !== out[i + 1].word.id));
      if (j > 0) [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

function startGame() {
  unlockAudio();
  if (!playableQuestions(settings.focus).length) {
    toast('Erst Wörter aufnehmen (⚙️ gedrückt halten)');
    return;
  }
  game.questions = buildRound(settings.rounds);
  game.index = 0;
  game.score = 0;
  game.results = [];
  show('game');
  renderProgress();
  askQuestion();
}

function renderProgress() {
  $('#progress').innerHTML = game.questions
    .map((_, i) => {
      const res = game.results[i];
      const cls = res === undefined ? (i === game.index ? 'current' : '') : res ? 'ok' : 'no';
      return `<span class="dot ${cls}"></span>`;
    })
    .join('');
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
  const q = game.questions[game.index];
  const pic = $('#btn-replay');
  pic.classList.add('playing');
  await playClip(q.clip);
  pic.classList.remove('playing');
  game.busy = false;
  setAnswersEnabled(true);
}

async function answer(saidCorrect) {
  if (game.busy) return;
  unlockAudio();
  game.busy = true;
  setAnswersEnabled(false);
  const q = game.questions[game.index];
  const ok = saidCorrect === q.isCorrect;
  game.results[game.index] = ok;
  if (ok) game.score++;
  renderProgress();
  DB.addAnswer({ wordId: q.word.id, sound: normSound(q.word.sound), isCorrect: q.isCorrect, ok, ts: Date.now() }).catch(() => {});

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
    const praise = pickFeedback('praise');
    if (praise) await playClip(praise);
    else await wait(700);
  } else {
    $('#screen-game').classList.add('shake');
    setTimeout(() => $('#screen-game').classList.remove('shake'), 500);
    await chime(false);
    const comfort = pickFeedback('comfort');
    if (comfort) await playClip(comfort);
    // Zum Lernen: die richtige Aussprache vorspielen.
    const correct = clipsOf(q.word.id, 'correct')[0];
    if (correct) {
      $('#feedback-text').textContent = 'So klingt es richtig:';
      await wait(400);
      await playClip(correct);
    }
    await wait(700);
  }

  if (!$('#screen-game').classList.contains('active')) return;
  game.index++;
  if (game.index >= game.questions.length) finishGame();
  else {
    renderProgress();
    askQuestion();
  }
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

function renderParents() {
  const list = $('#word-list');
  if (!words.length) {
    list.innerHTML = '<div class="card empty">Noch keine Wörter. Lege oben eins an oder tippe einen Vorschlag an.</div>';
  } else {
    // Nach Laut gruppiert, Wörter ohne Laut zuletzt.
    const sorted = words.slice().sort((a, b) => {
      const sa = normSound(a.sound) || '￿';
      const sb = normSound(b.sound) || '￿';
      return sa === sb ? a.created - b.created : sa < sb ? -1 : 1;
    });
    list.innerHTML = sorted
      .map((w) => {
        const good = clipsOf(w.id, 'correct');
        const bad = clipsOf(w.id, 'wrong');
        const warn = !good.length ? 'Richtige Aussprache fehlt' : !bad.length ? 'Tipp: auch eine falsche Aussprache aufnehmen' : '';
        return `<div class="card word" data-word="${w.id}">
          <div class="word-head">
            <button class="word-title edit-word" data-word="${w.id}">
              <span class="w-emoji">${escapeHtml(w.emoji || '🔊')}</span>
              <span class="w-text">${escapeHtml(w.text)}${w.wrongHint ? `<small> ≠ ${escapeHtml(w.wrongHint)}</small>` : ''}</span>
              ${w.sound ? `<span class="badge">${escapeHtml(soundLabel(normSound(w.sound)))}</span>` : ''}
              <span class="w-edit">✏️</span>
            </button>
            <button class="chip del del-word" data-word="${w.id}" aria-label="Wort löschen">🗑</button>
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

function renderSuggestions() {
  const have = new Set(words.map((w) => w.text.trim().toLowerCase()));
  // Aufgeklappte Gruppen beim Neuzeichnen offen lassen.
  const box = $('#suggestions');
  const open = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.sound));
  const isOpen = (sound) => open.has(sound) || (!box.children.length && !words.length);
  box.innerHTML = Object.entries(SUGGESTIONS)
    .map(
      ([sound, list]) => `<details class="suggest-group" data-sound="${sound}" ${isOpen(sound) ? 'open' : ''}>
        <summary>${escapeHtml(soundLabel(sound))} <span class="tiny">(${sound === 'ü' ? 'wird zu I' : 'wird zu S'})</span></summary>
        <div class="clips">
          ${list
            .map(([text, emoji, hint]) => {
              const done = have.has(text.toLowerCase());
              return `<button class="chip suggest ${done ? 'done' : ''}" ${done ? 'disabled' : ''}
                data-sound="${sound}" data-text="${escapeHtml(text)}" data-emoji="${emoji}" data-hint="${escapeHtml(hint)}">
                ${emoji} ${escapeHtml(text)} <span class="tiny">(${escapeHtml(hint)})</span>${done ? ' ✓' : ''}</button>`;
            })
            .join('')}
        </div>
      </details>`
    )
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
      .sort((a, b) => (a || '￿').localeCompare(b || '￿'))
      .map((sound) => {
        const list = bySound[sound];
        const recent = list.filter((a) => a.ts >= weekAgo);
        const wrongClips = list.filter((a) => !a.isCorrect);
        const rightClips = list.filter((a) => a.isCorrect);
        // Fehler pro Wort zählen, um schwierige Wörter zu zeigen.
        const misses = {};
        for (const a of list) if (!a.ok) misses[a.wordId] = (misses[a.wordId] || 0) + 1;
        const hard = Object.entries(misses)
          .map(([id, n]) => [wordName(id), n])
          .filter(([name]) => name)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);
        return `<div class="stat">
          <div class="stat-head"><b>${escapeHtml(soundLabel(sound))}</b><span class="tiny">${list.length} Antworten</span></div>
          <div class="stat-grid">
            <span>Falsche Aussprache erkannt</span><b>${pct(wrongClips)}</b>
            <span>Richtige Aussprache erkannt</span><b>${pct(rightClips)}</b>
            <span>Letzte 7 Tage gesamt</span><b>${pct(recent)}</b>
          </div>
          ${hard.length ? `<p class="tiny">Schwierig: ${hard.map(([name, n]) => `${escapeHtml(name)} (${n}×)`).join(', ')}</p>` : ''}
        </div>`;
      })
      .join('') + '<button id="btn-reset-stats" class="btn">Fortschritt zurücksetzen</button>';
}

async function createWord({ text, emoji = '', sound = '', wrongHint = '' }) {
  const word = { id: DB.uid(), text, emoji, sound: normSound(sound), wrongHint, created: Date.now() };
  await DB.putWord(word);
  words.push(word);
  renderParents();
  // Gleich die richtige Aussprache aufnehmen.
  openRecorder(word.id, 'correct');
}

async function addWord() {
  const text = $('#new-word').value.trim();
  if (!text) {
    toast('Bitte ein Wort eingeben');
    $('#new-word').focus();
    return;
  }
  await createWord({
    text,
    emoji: $('#new-emoji').value.trim(),
    sound: $('#new-sound').value,
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
  $('#edit-hint').value = w.wrongHint || '';
  $('#edit-dialog').showModal();
}

async function saveEdit() {
  const w = words.find((x) => x.id === editingId);
  if (!w) return;
  w.text = $('#edit-word').value.trim() || w.text;
  w.emoji = $('#edit-emoji').value.trim();
  w.sound = normSound($('#edit-sound').value);
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
const rec = { owner: null, kind: null, recorder: null, stream: null, chunks: [], data: null, type: null, timer: null, started: 0 };
const KIND_LABEL = {
  correct: 'richtig ausgesprochen ✅',
  wrong: 'falsch ausgesprochen ❌',
  praise: 'Lob 🎉',
  comfort: 'Trost 🤗',
};

function pickMime() {
  if (!window.MediaRecorder) return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/aac'];
  return types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

function openRecorder(owner, kind) {
  stopClip();
  rec.owner = owner;
  rec.kind = kind;
  rec.data = null;
  rec.type = null;
  const w = words.find((x) => x.id === owner);
  $('#rec-title').textContent = w ? `${w.emoji || ''} ${w.text}`.trim() : 'Feedback-Spruch';
  $('#rec-sub').textContent =
    kind === 'wrong'
      ? w && w.wrongHint
        ? `Sag absichtlich „${w.wrongHint}“ statt „${w.text}“.`
        : 'Sag das Wort absichtlich falsch (z. B. „Sokolade“ statt „Schokolade“).'
      : kind === 'correct'
      ? 'Sag das Wort deutlich und richtig.'
      : kind === 'praise'
      ? 'Z. B. „Super gemacht!“ oder „Toll gehört!“'
      : 'Z. B. „Nicht schlimm, hör nochmal genau hin!“';
  $('#rec-title').textContent += ' – ' + KIND_LABEL[kind];
  $('#rec-status').textContent = window.MediaRecorder ? 'Tippen zum Aufnehmen' : 'Aufnahme wird hier nicht unterstützt – bitte Datei wählen.';
  $('#rec-btn').classList.remove('recording');
  $('#rec-btn').disabled = !window.MediaRecorder;
  $('#rec-preview').disabled = true;
  $('#rec-save').disabled = true;
  $('#rec-dialog').showModal();
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

function closeRecorder() {
  if (rec.recorder && rec.recorder.state === 'recording') {
    rec.recorder.onstop = null;
    rec.recorder.stop();
    rec.stream.getTracks().forEach((t) => t.stop());
  }
  clearInterval(rec.timer);
  rec.recorder = null;
  stopClip();
  $('#rec-dialog').close();
}

async function saveRecording() {
  if (!rec.data) return;
  const clip = { id: DB.uid(), owner: rec.owner, kind: rec.kind, data: rec.data, type: rec.type, created: Date.now() };
  await DB.putClip(clip);
  clips.push(clip);
  const { owner, kind } = rec;
  closeRecorder();
  renderParents();
  toast('Gespeichert ✔');
  // Nach der richtigen Aussprache direkt zur falschen weiterleiten.
  if (kind === 'correct' && owner !== 'feedback' && !clipsOf(owner, 'wrong').length) {
    await wait(300);
    openRecorder(owner, 'wrong');
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
  $('#btn-quit').addEventListener('click', () => {
    stopClip();
    game.busy = false;
    updateHome();
    show('home');
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
    else if (t.classList.contains('suggest'))
      createWord({ text: t.dataset.text, emoji: t.dataset.emoji, sound: t.dataset.sound, wrongHint: t.dataset.hint });
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

  $('#edit-form').addEventListener('submit', saveEdit);
  $('#edit-cancel').addEventListener('click', () => $('#edit-dialog').close());

  $('#rec-btn').addEventListener('click', toggleRecording);
  $('#rec-preview').addEventListener('click', () => rec.data && playClip({ data: rec.data, type: rec.type }));
  $('#rec-save').addEventListener('click', saveRecording);
  $('#rec-cancel').addEventListener('click', closeRecorder);
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
