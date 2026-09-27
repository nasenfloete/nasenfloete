// Kleine IndexedDB-Hülle für Wörter und Audio-Aufnahmen.
// words: { id, text, emoji, sound, wrongHint, created }
//   sound = geübter Laut (z. B. "ü", "sch"), wrongHint = wie man es falsch sagt (z. B. "Tir")
// clips: { id, owner, kind, data (ArrayBuffer), type, created }
//   owner = Wort-ID oder "feedback"; kind = "correct" | "wrong" | "praise" | "comfort"
// answers: { id (auto), wordId, sound, isCorrect, ok, ts } – Antworten des Kindes für die Statistik
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
      return wrap((await store('words', 'readwrite')).put(word));
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
      return wrap((await store('clips', 'readwrite')).put(clip));
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
