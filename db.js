// Kleine IndexedDB-Hülle für Wörter und Audio-Aufnahmen.
// words: { id, text, emoji, sound, wrongHint, created }
//   sound = geübter Laut (z. B. "ü", "sch"), wrongHint = wie man es falsch sagt (z. B. "Tir")
// clips: { id, owner, kind, data (ArrayBuffer), type, created }
//   owner = Wort-ID oder "feedback"; kind = "correct" | "wrong" | "praise" | "comfort"
// answers: { id (auto), wordId, sound, level, ok, ts, isCorrect | mode } – Antworten des Kindes für die Statistik
//   Richtig/Falsch-Modus: isCorrect (ohne mode, auch alle älteren Einträge); Paar-Modus: mode = "pair"
// (ArrayBuffer statt Blob, weil ältere iOS-Versionen Blobs in IndexedDB nicht zuverlässig speichern.)
const DB = (() => {
  const NAME = 'hoer-genau';
  const VERSION = 2;
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('words')) {
          db.createObjectStore('words', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('clips')) {
          const clips = db.createObjectStore('clips', { keyPath: 'id' });
          clips.createIndex('owner', 'owner');
        }
        if (!db.objectStoreNames.contains('answers')) {
          db.createObjectStore('answers', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Schreiben gilt erst als erledigt, wenn die Transaktion abgeschlossen ist – sonst würde z. B. ein
  // voller Speicher (QuotaExceededError beim Commit) unbemerkt bleiben.
  async function write(name, fn) {
    const db = await open();
    const tx = db.transaction(name, 'readwrite');
    const result = fn(tx.objectStore(name));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
    });
    return result;
  }

  async function store(name, mode = 'readonly') {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  return {
    uid,
    async allWords() {
      const words = await wrap((await store('words')).getAll());
      return words.sort((a, b) => a.created - b.created);
    },
    async putWord(word) {
      return write('words', (s) => s.put(word));
    },
    async deleteWord(id) {
      const db = await open();
      const tx = db.transaction(['words', 'clips'], 'readwrite');
      tx.objectStore('words').delete(id);
      const idx = tx.objectStore('clips').index('owner');
      const keys = await wrap(idx.getAllKeys(id));
      keys.forEach((k) => tx.objectStore('clips').delete(k));
      return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    },
    async allClips() {
      return wrap((await store('clips')).getAll());
    },
    async putClip(clip) {
      return write('clips', (s) => s.put(clip));
    },
    async deleteClip(id) {
      return wrap((await store('clips', 'readwrite')).delete(id));
    },
    async addAnswer(answer) {
      return wrap((await store('answers', 'readwrite')).add(answer));
    },
    async allAnswers() {
      return wrap((await store('answers')).getAll());
    },
    // Antworten aus einer Sicherung übernehmen – ohne Doppelte, falls dieselbe Datei zweimal importiert wird.
    async importAnswers(list) {
      const db = await open();
      const existing = await wrap(db.transaction('answers').objectStore('answers').getAll());
      const key = (a) => [a.ts, a.wordId, a.mode || '', a.ok].join('|');
      const seen = new Set(existing.map(key));
      const tx = db.transaction('answers', 'readwrite');
      let added = 0;
      for (const a of list || []) {
        if (!a || seen.has(key(a))) continue;
        seen.add(key(a));
        const { id, ...rest } = a; // neue ID vergeben, damit nichts überschrieben wird
        tx.objectStore('answers').add(rest);
        added++;
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return added;
    },
    async clearAnswers() {
      return wrap((await store('answers', 'readwrite')).clear());
    },
    async clear() {
      const db = await open();
      const tx = db.transaction(['words', 'clips'], 'readwrite');
      tx.objectStore('words').clear();
      tx.objectStore('clips').clear();
      return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    },
  };
})();
