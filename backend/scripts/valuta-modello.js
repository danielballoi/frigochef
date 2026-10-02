// Valuta il riconoscimento con un modello VERO (Gemini o Ollama) sulle foto di test-foto/.
//
//   node --env-file-if-exists=.env scripts/valuta-modello.js [--provider gemini|ollama] [--model nome]
//        [--dir ../test-foto] [--json risultati.json]
//
// Il riferimento è test-foto/atteso.json: { "foto1.jpg": ["uova", "latte"], ... }
// (nomi del vocabolario o sinonimi). Foto e riferimento non vanno mai in git.
// Con gemini la chiave arriva da GEMINI_API_KEY (backend/.env) e non viene mai stampata.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createRecipeRepository } from '../src/recipes/recipeRepository.js';
import { createVisionProvider } from '../src/vision/index.js';

const { values: args } = parseArgs({
  options: {
    provider: { type: 'string', default: 'gemini' },
    model: { type: 'string' },
    dir: { type: 'string', default: path.resolve(import.meta.dirname, '../../test-foto') },
    json: { type: 'string' },
    timeout: { type: 'string', default: '300000' },
  },
});

const modelVariable = { gemini: 'GEMINI_MODEL', ollama: 'VISION_MODEL' }[args.provider];
if (!modelVariable) {
  console.error('--provider deve essere gemini oppure ollama');
  process.exit(1);
}

const config = loadConfig({
  ...process.env,
  VISION_PROVIDER: args.provider,
  VISION_TIMEOUT_MS: args.timeout,
  ...(args.model ? { [modelVariable]: args.model } : {}),
  LOG_LEVEL: 'silent',
});

const repository = createRecipeRepository();
await repository.load();
const vision = createVisionProvider(config, repository);

const health = await vision.check();
if (!health.ok) {
  console.error(`${args.provider} non pronto per ${vision.model}: ${health.reason}`);
  process.exit(1);
}

const expectedRaw = JSON.parse(await readFile(path.join(args.dir, 'atteso.json'), 'utf8'));
const files = (await readdir(args.dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const missingRef = files.filter((f) => !expectedRaw[f]);
if (missingRef.length) console.warn(`Attenzione: senza riferimento in atteso.json: ${missingRef.join(', ')}`);

// Memoria occupata dal modello: ha senso solo con Ollama (Gemini gira nel cloud).
async function modelMemory() {
  if (args.provider !== 'ollama') return null;
  try {
    const res = await fetch(`${config.ollamaUrl}/api/ps`);
    const data = await res.json();
    const m = data.models?.find((x) => x.name === config.visionModel || x.model === config.visionModel);
    return m ? Math.round(m.size / 1024 ** 2) : null;
  } catch {
    return null;
  }
}

const rows = [];
let memoryMb = null;
for (const file of files.filter((f) => expectedRaw[f])) {
  const expected = repository.normalizeIngredients(expectedRaw[file]);
  if (expected.unknown.length) console.warn(`${file}: nel riferimento ma non nel vocabolario: ${expected.unknown.join(', ')}`);
  const buffer = await readFile(path.join(args.dir, file));
  const start = performance.now();
  let found = [];
  let discarded = [];
  let error = null;
  try {
    ({ ingredients: found, discarded = [] } = await vision.recognize(buffer));
  } catch (err) {
    error = `${err.code ?? err.name}: ${err.message}`;
  }
  const seconds = (performance.now() - start) / 1000;
  memoryMb ??= await modelMemory();
  const exp = new Set(expected.known);
  const got = new Set(found);
  const row = {
    file,
    seconds: Math.round(seconds * 10) / 10,
    correct: found.filter((x) => exp.has(x)),
    invented: found.filter((x) => !exp.has(x)),
    missed: expected.known.filter((x) => !got.has(x)),
    discarded,
    error,
  };
  rows.push(row);
  console.log(
    `${file.padEnd(24)} ${String(row.seconds).padStart(6)} s  giusti ${row.correct.length}  ` +
      `inventati ${row.invented.length} [${row.invented.join(', ')}]  mancanti ${row.missed.length} [${row.missed.join(', ')}]` +
      `  scartati [${row.discarded.join(', ')}]` +
      (error ? `  ERRORE ${error}` : ''),
  );
}

const sum = (k) => rows.reduce((n, r) => n + r[k].length, 0);
const correct = sum('correct');
const invented = sum('invented');
const missed = sum('missed');
const ok = rows.filter((r) => !r.error);
const summary = {
  model: vision.model,
  photos: rows.length,
  errors: rows.length - ok.length,
  correct,
  invented,
  missed,
  precision: correct + invented ? Math.round((correct / (correct + invented)) * 100) : null,
  recall: correct + missed ? Math.round((correct / (correct + missed)) * 100) : null,
  avgSeconds: ok.length ? Math.round((ok.reduce((n, r) => n + r.seconds, 0) / ok.length) * 10) / 10 : null,
  maxSeconds: ok.length ? Math.max(...ok.map((r) => r.seconds)) : null,
  memoryMb,
};

console.log('\nRiepilogo');
console.table([summary]);
if (args.json) await writeFile(args.json, JSON.stringify({ summary, rows }, null, 2));
