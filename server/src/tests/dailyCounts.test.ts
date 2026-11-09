import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { config } from '../config';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { purgeExpiredIncidents } from '../db/purge';
import { geocodeTuning, setGeocoderFetch } from '../lib/geocode';
import { backfillMunicipalities } from '../lib/municipality';
import { setPushSender } from '../lib/notify';
import { devHeaders } from './helpers';

// Municipio inventado y único por ejecución: la BD persiste entre ejecuciones.
const town = `Villaprueba ${Math.random().toString(36).slice(2, 8)}`;
let geocoderUp = true;

test.before(async () => {
  await runMigrations();
  setPushSender(async () => ({ invalidTokens: [] }));
  geocodeTuning.minGapMs = 0;
  // `npm test` apaga el geocodificador para que ningún test salga a Nominatim;
  // este archivo lo enciende porque sustituye la red por una falsa.
  config.geocoderEnabled = true;
  // Solo «conoce» los puntos de esta prueba: el resto de avisos de la BD de
  // desarrollo se quedan sin municipio y el test no los modifica.
  setGeocoderFetch(async (url) => {
    if (!geocoderUp) return { ok: false, json: async () => ({}) };
    const lat = Number(new URL(url).searchParams.get('lat'));
    const ours = lat >= baseLat && lat <= baseLat + 1;
    return { ok: true, json: async () => ({ address: ours ? { road: 'Calle del Río', city: town } : {} }) };
  });
});

test.after(async () => {
  setGeocoderFetch(null);
  setPushSender(null);
  await pool.end();
});

const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
let n = 0;
// Cada aviso en su propia celda (~1 km de separación) para no activar la cuarentena ni la deduplicación.
const spot = () => ({ lat: baseLat + ++n * 0.01, lng: baseLng });
const words = () => `Aviso de prueba de recuento ${Math.random().toString(36).slice(2)} xqz`;

async function publish(app: ReturnType<typeof buildApp>, label: string, category: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/incidents',
    headers: await devHeaders(label),
    payload: { category, zone: spot(), description: words() },
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  return JSON.parse(res.body).data.id as string;
}

async function municipalityOf(id: string): Promise<string | null> {
  for (let i = 0; i < 50; i++) {
    const { rows } = await pool.query('SELECT municipality FROM incidents WHERE id = $1', [id]);
    if (rows[0]?.municipality) return rows[0].municipality;
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
}

const expire = (ids: string[]) =>
  pool.query(`UPDATE incidents SET created_at = NOW() - INTERVAL '100 hours' WHERE id = ANY($1)`, [ids]);

const countsFor = async (municipality: string, category: string) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(total),0)::int AS total, COALESCE(SUM(confirmed),0)::int AS confirmed, COALESCE(SUM(verified),0)::int AS verified
     FROM incident_daily_counts WHERE municipality = $1 AND category = $2`,
    [municipality, category],
  );
  return rows[0] as { total: number; confirmed: number; verified: number };
};

test('acepta las categorías de emergencias y clima', async () => {
  const app = buildApp();
  try {
    for (const category of ['inundacion', 'incendio', 'derrumbe', 'arbol', 'calle_cortada']) {
      await publish(app, `cat-${category}`, category);
    }
    const res = await app.inject({ method: 'GET', url: '/api/categories' });
    const groups = JSON.parse(res.body).data.filter((c: { group: string }) => c.group === 'emergencias');
    assert.strictEqual(groups.length, 5);
  } finally {
    await app.close();
  }
});

test('el aviso guarda su municipio en segundo plano', async () => {
  const app = buildApp();
  try {
    const id = await publish(app, 'muni-1', 'arbol');
    assert.strictEqual(await municipalityOf(id), town);
  } finally {
    await app.close();
  }
});

test('al purgar, el aviso se suma al recuento diario y no queda nada más de él', async () => {
  const app = buildApp();
  try {
    const plain = await publish(app, 'count-a', 'inundacion');
    const confirmed = await publish(app, 'count-b', 'inundacion');
    const verified = await publish(app, 'count-c', 'inundacion');
    for (const id of [plain, confirmed, verified]) assert.ok(await municipalityOf(id));

    const confirm = async (id: string, who: string) => {
      const r = await app.inject({ method: 'POST', url: `/api/incidents/${id}/confirm`, headers: await devHeaders(who) });
      assert.strictEqual(r.statusCode, 200, r.body);
    };
    await confirm(confirmed, 'witness-1');
    await confirm(verified, 'witness-1');
    await confirm(verified, 'witness-2');

    // Uno ocultado por moderación: no cuenta.
    const hidden = await publish(app, 'count-d', 'inundacion');
    await municipalityOf(hidden);
    await pool.query(`UPDATE incidents SET status = 'hidden' WHERE id = $1`, [hidden]);

    const before = await countsFor(town, 'inundacion');
    await expire([plain, confirmed, verified, hidden]);
    const purged = await purgeExpiredIncidents();
    assert.ok(purged >= 4, `purgados ${purged}`);

    const after = await countsFor(town, 'inundacion');
    assert.deepStrictEqual(
      { total: after.total - before.total, confirmed: after.confirmed - before.confirmed, verified: after.verified - before.verified },
      { total: 3, confirmed: 2, verified: 1 },
    );
    const left = await pool.query('SELECT COUNT(*)::int AS n FROM incidents WHERE id = ANY($1)', [[plain, confirmed, verified, hidden]]);
    assert.strictEqual(left.rows[0].n, 0);
  } finally {
    await app.close();
  }
});

test('sin municipio cuenta como desconocido, y el reintento lo rellena si el servicio vuelve', async () => {
  const app = buildApp();
  try {
    geocoderUp = false;
    const unknown = await publish(app, 'nogeo-1', 'derrumbe');
    const retried = await publish(app, 'nogeo-2', 'derrumbe');
    geocoderUp = true;
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await pool.query('SELECT id, municipality FROM incidents WHERE id = ANY($1)', [[unknown, retried]]);
    assert.ok(rows.every((r) => r.municipality === null));

    // El reintento solo coge avisos con más de 2 minutos: envejecemos el segundo.
    await pool.query(`UPDATE incidents SET created_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`, [retried]);
    // Puede haber otros avisos sin municipio delante en la cola: se repite hasta llegar al nuestro.
    for (let i = 0; i < 40 && !(await pool.query('SELECT municipality FROM incidents WHERE id = $1', [retried])).rows[0].municipality; i++) {
      await backfillMunicipalities(200);
    }
    assert.strictEqual(await municipalityOf(retried), town);

    const before = await countsFor('', 'derrumbe');
    await expire([unknown]);
    await purgeExpiredIncidents();
    const after = await countsFor('', 'derrumbe');
    assert.strictEqual(after.total - before.total, 1);
  } finally {
    await app.close();
  }
});
