/**
 * Incluye Leaflet dentro de la app en lugar de cargarlo desde unpkg.com:
 *  - el mapa funciona sin descargar código de terceros y no se expone la IP del
 *    vecino a una CDN;
 *  - la versión queda fijada y verificada (integridad SRI del paquete de npm).
 *
 * Uso (desde app/):  node scripts/vendor-leaflet.mjs
 * Genera src/vendor/leaflet.ts, que se versiona. Para actualizar Leaflet,
 * cambia VERSION y vuelve a ejecutarlo.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VERSION = '1.9.4';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd) =>
  execFileSync(npm, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' }).trim();

const dir = mkdtempSync(join(tmpdir(), 'leaflet-'));
const expected = run(['view', `leaflet@${VERSION}`, 'dist.integrity'], dir);
const tgz = run(['pack', `leaflet@${VERSION}`, '--silent'], dir).split(/\r?\n/).pop();
const tarball = readFileSync(join(dir, tgz));
const actual = 'sha512-' + createHash('sha512').update(tarball).digest('base64');
if (expected !== actual) throw new Error(`Integridad distinta: esperada ${expected}, obtenida ${actual}`);

execFileSync('tar', ['-xzf', tgz], { cwd: dir });
const js = readFileSync(join(dir, 'package/dist/leaflet.js'), 'utf8');
const css = readFileSync(join(dir, 'package/dist/leaflet.css'), 'utf8');
const license = readFileSync(join(dir, 'package/LICENSE'), 'utf8').trim();

// El HTML se incrusta en una plantilla: nada de cierres de script ni de comillas invertidas.
for (const [name, text] of [['leaflet.js', js], ['leaflet.css', css]]) {
  if (/<\/script/i.test(text) || text.includes('`') || text.includes('${')) {
    throw new Error(`${name} contiene secuencias que romperían la plantilla`);
  }
}

const header = `/* eslint-disable */
/**
 * GENERADO por scripts/vendor-leaflet.mjs — no editar a mano.
 * Leaflet ${VERSION} (https://leafletjs.com), distribuido bajo BSD-2-Clause.
 * Integridad del paquete npm: ${actual}
 *
${license
  .split('\n')
  .map((l) => ` * ${l}`.trimEnd())
  .join('\n')}
 */
`;

mkdirSync(new URL('../src/vendor/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../src/vendor/leaflet.ts', import.meta.url),
  `${header}export const LEAFLET_VERSION = ${JSON.stringify(VERSION)};\n` +
    `export const LEAFLET_CSS = ${JSON.stringify(css)};\n` +
    `export const LEAFLET_JS = ${JSON.stringify(js)};\n`,
);
console.log(`ok: Leaflet ${VERSION}, js ${js.length} B, css ${css.length} B, integridad verificada`);
