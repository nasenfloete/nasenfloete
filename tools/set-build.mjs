// Setzt die Build-Nummer überall, wo sie zusammenpassen muss:
// index.html (<meta name="app-build"> und ?v= an CSS/JS), app.js (APP_BUILD), sw.js (BUILD).
// Aufruf: node tools/set-build.mjs 7
import fs from 'fs';
import path from 'path';

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1) {
  console.error('Aufruf: node tools/set-build.mjs <Nummer>');
  process.exit(1);
}
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const edits = {
  'index.html': [
    [/(<meta name="app-build" content=")\d+(">)/, `$1${n}$2`],
    [/((?:style\.css|content\.js|db\.js|app\.js)\?v=)\d+/g, `$1${n}`],
  ],
  'app.js': [[/const APP_BUILD = \d+;/, `const APP_BUILD = ${n};`]],
  'sw.js': [[/const BUILD = \d+;/, `const BUILD = ${n};`]],
};
for (const [file, rules] of Object.entries(edits)) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  for (const [re, rep] of rules) {
    if (!re.test(s)) throw new Error(`${file}: Muster ${re} nicht gefunden`);
    re.lastIndex = 0;
    s = s.replace(re, rep);
  }
  fs.writeFileSync(p, s);
}
console.log(`Build ${n} gesetzt.`);
