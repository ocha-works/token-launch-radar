// Launch Radar: a token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot (/input/snapshot.json, or --input <file|dir>), scores every
// pre-token protocol with the calibrated model in lib/model.ts, and writes the run's outputs:
//
//   /output/board.json    the ranked board the gate reads: 140 rows, watchlist covered, farm plans
//   /output/data.js       the dashboard's dataset (window.RADAR), written beside the page it serves
//   /output/dashboard/    this repository's dashboard/, copied: a static page, no network
//   /output/screenshots/  this repository's screenshots/, copied: the board, a detail, a filter
//   /output/dossier.json  the summary the judge reads, built with the vendored make.fun library
//
// The two runs the grader makes must write the same bytes, so nothing here reads a clock, a random
// source or the network: the same snapshot in, the same board out.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's caps, mirrored so a bad run fails here with the reason instead of at the scorer. */
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> or --name=<value> out of the arguments, else the fallback. */
function argument(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** Copy one directory's regular files into `to`, skipping dotfiles; returns the names copied. */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const inputArg = argument('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    process.stderr.write(`launch radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
    process.exit(2);
  }
  const out = argument('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`launch radar: the model wrote a board the gate refuses: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const page = copyDirectory(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyDirectory(join(here, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3 || shots.length > 4) {
    process.stderr.write(`launch radar: screenshots/ holds ${shots.length} images: hand in 3 or 4, the board, a detail view and a filtered view\n`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`launch radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
    const bytes = statSync(join(here, 'screenshots', name)).size;
    if (bytes > DOSSIER_CAPS.screenshots.max_bytes) {
      process.stderr.write(`launch radar: screenshots/${name} is ${bytes} bytes, over the ${DOSSIER_CAPS.screenshots.max_bytes}-byte cap the dossier refuses\n`);
      process.exit(1);
    }
  }

  // The dossier goes last: the scorer rebuilds it from this /output and compares the bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));

  process.stdout.write(
    `launch radar: ${snapshot.protocols.length} protocols read, ${snapshot.watchlist.length} watchlist, ${board.length} rows ranked ` +
      `(${radar.early_size} early finds below the floor, ${radar.live_size} live-token protocols set aside)\n` +
      `launch radar: wrote board.json, data.js, dashboard/ (${page.length} files), screenshots/ (${shots.length} images) and dossier.json in ${out}\n`,
  );
}

main();
