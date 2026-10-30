import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { config } from '../config';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { sanitizeAddress } from '../lib/address';
import { geocodeTuning, parseNominatim, reverseGeocode, setGeocoderFetch } from '../lib/geocode';
import { devHeaders } from './helpers';

test.before(async () => {
  await runMigrations();
  geocodeTuning.minGapMs = 0;
});

test.after(async () => {
  setGeocoderFetch(null);
  await pool.end();
});

const nominatim = (address: Record<string, string>) => async () => ({
  ok: true,
  json: async () => ({ address }),
});

test('parseNominatim: calle y localidad, sin número de portal', () => {
  const r = parseNominatim({
    address: { house_number: '12', road: 'Calle Mayor', city: 'Málaga', postcode: '29001' },
  });
  assert.deepStrictEqual(r, { street: 'Calle Mayor', locality: 'Málaga', label: 'Calle Mayor, Málaga' });
  assert.ok(!JSON.stringify(r).includes('12'), 'el número de portal no se devuelve');
});

test('parseNominatim: sin calle usa la localidad; respuesta rara no rompe', () => {
  assert.strictEqual(parseNominatim({ address: { town: 'Mijas' } }).label, 'Mijas');
  assert.strictEqual(parseNominatim({ address: { pedestrian: 'Paseo Marítimo', village: 'Nerja' } }).label, 'Paseo Marítimo, Nerja');
  assert.strictEqual(parseNominatim(null).label, null);
  assert.strictEqual(parseNominatim({ address: 'x' }).label, null);
});

test('reverseGeocode: cachea, identifica la app y no repite la consulta', async () => {
  let calls = 0;
  let seenUa = '';
  let seenUrl = '';
  setGeocoderFetch(async (url, init) => {
    calls += 1;
    seenUa = init.headers['User-Agent'];
    seenUrl = url;
    return { ok: true, json: async () => ({ address: { road: 'Calle Larios', city: 'Málaga' } }) };
  });
  const a = await reverseGeocode(36.7213, -4.4214);
  const b = await reverseGeocode(36.72134, -4.42139); // mismo punto a ~11 m: misma clave
  assert.strictEqual(a.label, 'Calle Larios, Málaga');
  assert.deepStrictEqual(b, a);
  assert.strictEqual(calls, 1, 'la segunda consulta sale de la caché');
  assert.match(seenUa, /RadioPatio\/1\.0 \(.+@.+\)/, 'User-Agent identificable (política de Nominatim)');
  assert.match(seenUrl, /zoom=17/, 'nivel calle, nunca edificio');
  assert.ok(!seenUrl.includes('zoom=18'));
});

test('reverseGeocode: ante fallo del servicio devuelve vacío y no lo cachea', async () => {
  let calls = 0;
  setGeocoderFetch(async () => {
    calls += 1;
    throw new Error('caído');
  });
  const r = await reverseGeocode(40.4168, -3.7038);
  assert.strictEqual(r.label, null);
  await reverseGeocode(40.4168, -3.7038);
  assert.strictEqual(calls, 2, 'un error no se cachea: se reintenta');

  setGeocoderFetch(async () => ({ ok: false, json: async () => ({}) }));
  assert.strictEqual((await reverseGeocode(40.4, -3.7)).label, null, 'HTTP no OK = vacío');
});

test('reverseGeocode: con GEOCODER_ENABLED=0 no sale ninguna petición', async () => {
  let calls = 0;
  setGeocoderFetch(async () => {
    calls += 1;
    return { ok: true, json: async () => ({ address: { road: 'X' } }) };
  });
  const prev = config.geocoderEnabled;
  config.geocoderEnabled = false;
  try {
    assert.strictEqual((await reverseGeocode(37.1, -3.6)).label, null);
    assert.strictEqual(calls, 0);
  } finally {
    config.geocoderEnabled = prev;
  }
});

test('reverseGeocode: con la cola llena responde vacío en vez de acumular esperas', async () => {
  const prevMax = geocodeTuning.maxPending;
  geocodeTuning.maxPending = 2;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  setGeocoderFetch(async () => {
    await gate;
    return { ok: true, json: async () => ({ address: { road: 'Calle A' } }) };
  });
  try {
    const p1 = reverseGeocode(36.1, -4.1);
    const p2 = reverseGeocode(36.2, -4.2);
    const p3 = await reverseGeocode(36.3, -4.3); // 3.ª: cola llena
    assert.strictEqual(p3.label, null);
    release();
    assert.strictEqual((await p1).street, 'Calle A');
    assert.strictEqual((await p2).street, 'Calle A');
  } finally {
    geocodeTuning.maxPending = prevMax;
    release();
  }
});

test('POST /api/geocode/reverse: exige dispositivo, valida y devuelve la calle', async () => {
  setGeocoderFetch(nominatim({ road: 'Avenida de Andalucía', city: 'Málaga', house_number: '5' }));
  const app = buildApp();
  try {
    const noToken = await app.inject({ method: 'POST', url: '/api/geocode/reverse', payload: { lat: 36.7, lng: -4.4 } });
    assert.strictEqual(noToken.statusCode, 401);
    assert.strictEqual(JSON.parse(noToken.body).error, 'DEVICE_TOKEN_REQUIRED');

    const fake = await app.inject({
      method: 'POST',
      url: '/api/geocode/reverse',
      headers: { 'x-device-token': 'token-inventado' },
      payload: { lat: 36.7, lng: -4.4 },
    });
    assert.strictEqual(fake.statusCode, 401);
    assert.strictEqual(JSON.parse(fake.body).error, 'INVALID_DEVICE_TOKEN');

    const headers = await devHeaders('geocode-ok');
    const bad = await app.inject({ method: 'POST', url: '/api/geocode/reverse', headers, payload: { lat: 91, lng: -4.4 } });
    assert.strictEqual(bad.statusCode, 400);

    const ok = await app.inject({ method: 'POST', url: '/api/geocode/reverse', headers, payload: { lat: 36.7213, lng: -4.4214 } });
    assert.strictEqual(ok.statusCode, 200, ok.body);
    assert.deepStrictEqual(JSON.parse(ok.body).data, {
      street: 'Avenida de Andalucía',
      locality: 'Málaga',
      label: 'Avenida de Andalucía, Málaga',
    });
    assert.ok(!ok.body.includes('"5"'), 'nunca el número de portal');
  } finally {
    await app.close();
  }
});

test('sanitizeAddress: quita portal y puerta, respeta números del nombre', () => {
  assert.strictEqual(sanitizeAddress('Calle Mayor 12, Málaga'), 'Calle Mayor, Málaga');
  assert.strictEqual(sanitizeAddress('Calle Mayor, 12'), 'Calle Mayor');
  assert.strictEqual(sanitizeAddress('Avenida de Andalucía, 5, Málaga'), 'Avenida de Andalucía, Málaga');
  assert.strictEqual(sanitizeAddress('Calle Mayor nº 12'), 'Calle Mayor');
  assert.strictEqual(sanitizeAddress('Calle Alcalá 7B'), 'Calle Alcalá');
  assert.strictEqual(sanitizeAddress('Calle 20 de Mayo'), 'Calle 20 de Mayo');
  assert.strictEqual(sanitizeAddress('  Plaza   de la  Merced  '), 'Plaza de la Merced');
  assert.strictEqual(sanitizeAddress('x'.repeat(300)).length, 120);
});

test('publicar: la calle se guarda sin portal y no admite datos personales', async () => {
  const app = buildApp();
  const headers = await devHeaders('calle-privada');
  const zone = { lat: 36.9 + Math.random() * 0.04, lng: -4.9 - Math.random() * 0.04 };
  const ids: string[] = [];
  try {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers,
      payload: {
        category: 'alumbrado',
        zone: { ...zone, address: 'Calle Mayor 12, Málaga' },
        description: `Farola apagada en todo el tramo de la calle ${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    assert.strictEqual(ok.statusCode, 201, ok.body);
    const body = JSON.parse(ok.body).data;
    ids.push(body.id);
    assert.strictEqual(body.zone.address, 'Calle Mayor, Málaga');

    const leak = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers,
      payload: {
        category: 'alumbrado',
        zone: { ...zone, address: 'Calle Mayor, llamar al 600123456' },
        description: `Farola apagada en todo el tramo de la calle ${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    assert.strictEqual(leak.statusCode, 400);
    assert.strictEqual(JSON.parse(leak.body).error, 'PRIVACY_VIOLATION');
  } finally {
    if (ids.length) await pool.query('DELETE FROM incidents WHERE id = ANY($1::text[])', [ids]);
    await app.close();
  }
});
