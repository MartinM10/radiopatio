import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { buildApp } from '../app';
import { config } from '../config';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { detectEpisodeSuggestions, slugify } from '../lib/episodes';
import { setPushSender } from '../lib/notify';
import { devHeaders } from './helpers';

const tag = Math.random().toString(36).slice(2, 8);
const admin = { 'x-admin-token': config.adminToken, 'content-type': 'application/json' };
const EMERGENCIES = ['inundacion', 'incendio', 'derrumbe', 'arbol', 'calle_cortada'] as const;

/**
 * La detección mira TODA la base, y los avisos de prueba viven entre 12 h y 7 días:
 * los de ejecuciones anteriores seguirían proponiendo borradores hasta llenar el
 * tope de borradores abiertos. Se limpian los de estas pruebas (marcados por su
 * texto y por municipios «Pueblo…») antes y después.
 */
async function cleanTestData() {
  await pool.query(`DELETE FROM incidents WHERE description LIKE 'Aviso de prueba de episodios %'`);
  await pool.query(`DELETE FROM episodes WHERE municipalities[1] LIKE 'Pueblo%' OR name LIKE 'Episodio manual %' OR name LIKE 'Temporal de aprobacion %'`);
}

test.before(async () => {
  await runMigrations();
  await cleanTestData();
  setPushSender(async () => ({ invalidTokens: [] }));
});

test.after(async () => {
  await cleanTestData();
  setPushSender(null);
  await pool.end();
});

const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
let n = 0;

/** Publica `count` avisos de emergencias en `town`, y confirma (un voto) los `confirmed` primeros. */
async function stormIn(app: ReturnType<typeof buildApp>, town: string, count: number, confirmed: number) {
  for (let i = 0; i < count; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders(`storm-${town}-${i}`),
      payload: {
        category: EMERGENCIES[i % EMERGENCIES.length],
        zone: { lat: baseLat + ++n * 0.02, lng: baseLng },
        description: `Aviso de prueba de episodios ${tag} ${n} ${Math.random().toString(36).slice(2)} xqz`,
      },
    });
    assert.strictEqual(res.statusCode, 201, res.body);
    const id = JSON.parse(res.body).data.id as string;
    await pool.query(`UPDATE incidents SET municipality = $2, confirmations_count = $3 WHERE id = $1`, [id, town, i < confirmed ? 1 : 0]);
  }
}

const drafts = async (app: ReturnType<typeof buildApp>) =>
  (JSON.parse((await app.inject({ method: 'GET', url: '/api/admin/episodes?status=draft', headers: admin })).body).data as {
    slug: string;
    name: string;
    municipalities: string[];
    reason: string;
    status: string;
  }[]);

test('un pico de avisos de emergencias crea un borrador privado, una sola vez', async () => {
  const app = buildApp();
  try {
    const quiet = `Pueblotranquilo ${tag}`;
    const storm = `Pueblotormenta ${tag}`;
    await stormIn(app, quiet, config.episodeMinNotices - 1, config.episodeMinConfirmed);
    await stormIn(app, storm, config.episodeMinNotices, config.episodeMinConfirmed);

    const created = await detectEpisodeSuggestions();
    const slug = created.find((s) => s.includes(slugify(storm)));
    assert.ok(slug, 'el municipio que supera el umbral tiene borrador');
    assert.ok(!created.some((s) => s.includes(slugify(quiet))), 'uno por debajo del umbral no');

    const mine = (await drafts(app)).find((d) => d.slug === slug)!;
    assert.strictEqual(mine.status, 'draft');
    assert.deepStrictEqual(mine.municipalities, [storm]);
    assert.match(mine.reason, new RegExp(`${config.episodeMinNotices} avisos de emergencias`));

    // Es privado: ni en la lista pública ni por su enlace.
    const publicList = JSON.parse((await app.inject({ method: 'GET', url: '/api/episodes' })).body).data as { slug: string }[];
    assert.ok(!publicList.some((e) => e.slug === slug));
    assert.strictEqual((await app.inject({ method: 'GET', url: `/api/episodes/${slug}` })).statusCode, 404);
    assert.strictEqual((await app.inject({ method: 'GET', url: '/api/admin/episodes' })).statusCode, 401, 'la lista de borradores pide token');

    // Otra pasada no lo duplica.
    assert.ok(!(await detectEpisodeSuggestions()).includes(slug));
    assert.strictEqual((await drafts(app)).filter((d) => d.municipalities.includes(storm)).length, 1);
  } finally {
    await app.close();
  }
});

test('hace falta que haya avisos confirmados por otros vecinos, no solo muchos avisos', async () => {
  const app = buildApp();
  try {
    const town = `Pueblosinconfirmar ${tag}`;
    await stormIn(app, town, config.episodeMinNotices + 3, 0);
    const created = await detectEpisodeSuggestions();
    assert.ok(!created.some((s) => s.includes(slugify(town))), 'sin confirmaciones no se propone nada (un solo usuario no hace un episodio)');
  } finally {
    await app.close();
  }
});

test('el moderador publica el borrador, y puede corregirlo al hacerlo', async () => {
  const app = buildApp();
  try {
    const town = `Puebloaprobar ${tag}`;
    await stormIn(app, town, config.episodeMinNotices, config.episodeMinConfirmed);
    const slug = (await detectEpisodeSuggestions()).find((s) => s.includes(slugify(town)))!;
    assert.ok(slug);

    const publish = (path: string, body?: unknown, headers: Record<string, string> = admin) =>
      app.inject({ method: 'POST', url: `/api/admin/episodes/${path}/publish`, headers, payload: body === undefined ? undefined : JSON.stringify(body) });

    assert.strictEqual((await publish(slug, {}, { 'content-type': 'application/json' })).statusCode, 401);
    assert.strictEqual((await publish('no-existe', {})).statusCode, 404);
    assert.strictEqual((await publish(slug, { endsOn: '2001-01-01' })).statusCode, 400, 'fin anterior al inicio');

    const name = `Temporal de aprobacion ${tag}`;
    const ok = await publish(slug, { name });
    assert.strictEqual(ok.statusCode, 200, ok.body);
    const published = JSON.parse(ok.body).data as { slug: string; status: string };
    assert.strictEqual(published.status, 'published');
    assert.strictEqual(published.slug, slugify(name), 'el enlace sale del nombre nuevo');

    const detail = await app.inject({ method: 'GET', url: `/api/episodes/${published.slug}` });
    assert.strictEqual(detail.statusCode, 200);
    assert.strictEqual(JSON.parse(detail.body).data.name, name);
    assert.strictEqual((await publish(published.slug, {})).statusCode, 409, 'ya publicado');
    assert.ok(!(await drafts(app)).some((d) => d.slug === slug || d.slug === published.slug));
  } finally {
    await app.close();
  }
});

test('un episodio que ya cubre el municipio evita el borrador, y se puede descartar uno', async () => {
  const app = buildApp();
  try {
    const town = `Pueblocubierto ${tag}`;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    const manual = await app.inject({
      method: 'POST',
      url: '/api/admin/episodes',
      headers: admin,
      payload: JSON.stringify({ name: `Episodio manual ${tag}`, municipalities: [town.toUpperCase()], startsOn: today, endsOn: today }),
    });
    assert.strictEqual(manual.statusCode, 201, manual.body);
    await stormIn(app, town, config.episodeMinNotices, config.episodeMinConfirmed);
    assert.ok(!(await detectEpisodeSuggestions()).some((s) => s.includes(slugify(town))), 'ya está cubierto (sin distinguir mayúsculas)');

    // Descartar un borrador es borrarlo.
    const other = `Puebloadescartar ${tag}`;
    await stormIn(app, other, config.episodeMinNotices, config.episodeMinConfirmed);
    const slug = (await detectEpisodeSuggestions()).find((s) => s.includes(slugify(other)))!;
    assert.strictEqual((await app.inject({ method: 'DELETE', url: `/api/admin/episodes/${slug}`, headers: admin })).statusCode, 200);
    assert.ok(!(await drafts(app)).some((d) => d.slug === slug));
  } finally {
    await app.close();
  }
});

test('un borrador nuevo avisa por webhook, sin credenciales ni datos de nadie', async () => {
  const app = buildApp();
  const received: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(body);
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const prev = config.adminWebhookUrl;
  config.adminWebhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  try {
    const town = `Pueblowebhook ${tag}`;
    await stormIn(app, town, config.episodeMinNotices, config.episodeMinConfirmed);
    const slug = (await detectEpisodeSuggestions()).find((s) => s.includes(slugify(town)))!;
    assert.ok(slug);
    // La pasada puede crear otros borradores (la detección mira toda la base): se busca el de este municipio.
    const msg = received.map((r) => JSON.parse(r) as { text: string; content: string }).find((m) => m.text.includes(slug));
    assert.ok(msg, 'llegó el aviso de este borrador');
    assert.strictEqual(msg.text, msg.content, 'sirve para Slack (text) y Discord (content)');
    assert.ok(msg.text.includes(town) && msg.text.includes(slug));
    assert.ok(!msg.text.includes(config.adminToken), 'nunca el token de administración');

    // Si el webhook falla, no se rompe la detección.
    config.adminWebhookUrl = 'http://127.0.0.1:1/cerrado';
    const town2 = `Pueblowebhookroto ${tag}`;
    await stormIn(app, town2, config.episodeMinNotices, config.episodeMinConfirmed);
    assert.ok((await detectEpisodeSuggestions()).some((s) => s.includes(slugify(town2))), 'el borrador se crea aunque el webhook no responda');
  } finally {
    config.adminWebhookUrl = prev;
    await new Promise((r) => server.close(r));
    await app.close();
  }
});
