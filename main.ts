// Street Heat: Solmar Bay — submission builder (runs on Node 22, stdlib only).
//
// The game is plain static files: game/index.html plus its ES modules under
// game/src/. No bundler, no libraries, no network calls — any static host can
// serve it. This script is the handoff to the grader: it assembles the entry
// in the output directory, then asks the vendored make.fun helper to write
// dossier.json, the summary the judge reads.
//
// Try the game first: `node serve.ts`, then open http://localhost:8080.
// To produce the graded output outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in; the output folder defaults to the grader's
// /output and can be overridden for a local run.
const here = fileURLToPath(new URL('.', import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

copyTree(join(here, 'game'), join(destination, 'game'));
if (existsSync(join(here, 'screenshots'))) {
  copyTree(join(here, 'screenshots'), join(destination, 'screenshots'));
} else {
  mkdirSync(join(destination, 'screenshots'), { recursive: true });
}

// These limits mirror the scorer's gate. Only text_max_bytes changes what
// the dossier contains; the others reject an entry the scorer would reject:
// at most 4 screenshots, none over 256 KiB; game/ holds at most 993 files
// and 48 MiB, and no path inside game/ is longer than 1000 bytes.
const dossier = buildDossier(destination, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(destination, 'dossier.json'), dossier);
