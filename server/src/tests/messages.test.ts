import assert from 'node:assert';
import test from 'node:test';
import sharp from 'sharp';
import { buildApp } from '../app';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { PushMessage, setPushSender } from '../lib/notify';
import { devHeaders } from './helpers';

// Imagen de prueba generada con sharp (misma lib que la reprocesa en el
// servidor): evita depender de bytes de PNG escritos a mano.
let TINY_PNG_BASE64: string;

const sent: PushMessage[] = [];

test.before(async () => {
  await runMigrations();
  TINY_PNG_BASE64 = (
    await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .png()
      .toBuffer()
  ).toString('base64');
  setPushSender(async (msgs) => {
    sent.push(...msgs);
    return { invalidTokens: [] };
  });
});

test.after(async () => {
  setPushSender(null);
  await pool.end();
});

const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
let n = 0;
// Cada aviso en su propia celda (~1 km): no activa cuarentena ni deduplicación.
const spot = () => ({ lat: baseLat + ++n * 0.01, lng: baseLng });
const text = (what: string) => `${what} ${Math.random().toString(36).slice(2)} xqz`;

async function publish(app: ReturnType<typeof buildApp>, label: string, category = 'perdido') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/incidents',
    headers: await devHeaders(label),
    payload: { category, zone: spot(), description: text('Mochila azul olvidada en el banco') },
  });
  assert.strictEqual(res.statusCode, 201, res.body);
  return JSON.parse(res.body).data as { id: string; hasPhoto: boolean };
}

async function postMessage(app: ReturnType<typeof buildApp>, incidentId: string, label: string, body: string) {
  return app.inject({
    method: 'POST',
    url: `/api/incidents/${incidentId}/messages`,
    headers: await devHeaders(label),
    payload: { body },
  });
}

async function getMessages(app: ReturnType<typeof buildApp>, incidentId: string, label?: string) {
  return app.inject({
    method: 'GET',
    url: `/api/incidents/${incidentId}/messages`,
    headers: label ? await devHeaders(label) : {},
  });
}

test('chat anónimo: escribir sin token se rechaza', async () => {
  const app = buildApp();
  try {
    const inc = await publish(app, 'chat-auth-author');
    const res = await app.inject({ method: 'POST', url: `/api/incidents/${inc.id}/messages`, payload: { body: 'hola' } });
    assert.strictEqual(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('chat anónimo: valida longitud y filtra datos personales', async () => {
  const app = buildApp();
  try {
    const inc = await publish(app, 'chat-valid-author');
    const empty = await postMessage(app, inc.id, 'chat-valid-author', '');
    assert.strictEqual(empty.statusCode, 400);
    const tooLong = await postMessage(app, inc.id, 'chat-valid-author', 'x'.repeat(281));
    assert.strictEqual(tooLong.statusCode, 400);
    const withPhone = await postMessage(app, inc.id, 'chat-valid-author', 'Llámame al 611 222 333');
    assert.strictEqual(withPhone.statusCode, 400);
    assert.strictEqual(JSON.parse(withPhone.body).error, 'PRIVACY_VIOLATION');
  } finally {
    await app.close();
  }
});

test('chat anónimo: nadie ve quién escribe, solo si el mensaje es propio', async () => {
  const app = buildApp();
  try {
    const inc = await publish(app, 'chat-mine-author');
    const authorMsg = await postMessage(app, inc.id, 'chat-mine-author', text('La he visto yo'));
    assert.strictEqual(authorMsg.statusCode, 201, authorMsg.body);
    assert.strictEqual(JSON.parse(authorMsg.body).data.mine, true);

    const neighborMsg = await postMessage(app, inc.id, 'chat-mine-vecino', text('Creo que es la mía'));
    assert.strictEqual(neighborMsg.statusCode, 201);

    const seenByAuthor = await getMessages(app, inc.id, 'chat-mine-author');
    const itemsA = JSON.parse(seenByAuthor.body).data as { body: string; mine: boolean }[];
    assert.strictEqual(itemsA.length, 2);
    assert.strictEqual(itemsA.filter((m) => m.mine).length, 1);

    const seenByOther = await getMessages(app, inc.id, 'chat-mine-vecino');
    const itemsB = JSON.parse(seenByOther.body).data as { mine: boolean }[];
    assert.strictEqual(itemsB.filter((m) => m.mine).length, 1);

    // No lleva device_hash ni nada parecido en el payload.
    const raw = JSON.stringify(itemsA);
    assert.ok(!/device_hash|deviceHash/.test(raw));
  } finally {
    await app.close();
  }
});

test('chat anónimo: solo en avisos activos', async () => {
  const app = buildApp();
  try {
    const inc = await publish(app, 'chat-404-author');
    await pool.query(`UPDATE incidents SET status = 'hidden' WHERE id = $1`, [inc.id]);
    const res = await postMessage(app, inc.id, 'chat-404-vecino', text('hola'));
    assert.strictEqual(res.statusCode, 404);
    const list = await getMessages(app, inc.id);
    assert.strictEqual(list.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('chat anónimo: notifica a los demás participantes, nunca a quien escribe', async () => {
  const app = buildApp();
  try {
    sent.length = 0;
    const inc = await publish(app, 'chat-notif-author');

    await postMessage(app, inc.id, 'chat-notif-vecino', text('He visto una mochila así'));
    await new Promise((r) => setTimeout(r, 300));
    const afterFirst = await pool.query(
      `SELECT n.title, d.device_hash FROM notifications n
       JOIN devices d ON d.id = n.device_id
       WHERE n.incident_id = $1 AND n.kind = 'message'`,
      [inc.id],
    );
    assert.strictEqual(afterFirst.rowCount, 1, 'solo el autor debería tener notificación, nunca quien escribió');

    await postMessage(app, inc.id, 'chat-notif-author', text('Sí, es mía, gracias'));
    await new Promise((r) => setTimeout(r, 300));
    const afterReply = await pool.query(
      `SELECT count(*)::int AS n FROM notifications WHERE incident_id = $1 AND kind = 'message'`,
      [inc.id],
    );
    // El autor tenía 1 sin leer (se actualiza, no se apila) + el vecino recibe la suya nueva = 2 en total.
    assert.strictEqual(afterReply.rows[0].n, 2);
  } finally {
    await app.close();
  }
});

test('foto: solo se admite en categorías que la permiten', async () => {
  const app = buildApp();
  try {
    const tiny = TINY_PNG_BASE64;
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders('photo-forbidden'),
      payload: { category: 'agresion', zone: spot(), description: text('Agresión en la calle'), photo: tiny },
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(JSON.parse(res.body).error, 'PHOTO_NOT_ALLOWED');
  } finally {
    await app.close();
  }
});

test('foto: se recomprime, se sirve y desaparece del JSON del aviso', async () => {
  const app = buildApp();
  try {
    const tiny = TINY_PNG_BASE64;
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders('photo-ok'),
      payload: { category: 'perdido', zone: spot(), description: text('Mascota perdida'), photo: `data:image/png;base64,${tiny}` },
    });
    assert.strictEqual(res.statusCode, 201, res.body);
    const created = JSON.parse(res.body).data;
    assert.strictEqual(created.hasPhoto, true);
    assert.ok(!('photo' in created), 'la foto no debe viajar dentro del JSON del aviso');

    const photoRes = await app.inject({ method: 'GET', url: `/api/incidents/${created.id}/photo` });
    assert.strictEqual(photoRes.statusCode, 200);
    assert.strictEqual(photoRes.headers['content-type'], 'image/jpeg');
    assert.ok(photoRes.rawPayload.length > 0);
    // Nunca se guardan los bytes originales (el PNG de entrada): sharp reencoda a JPEG.
    assert.notStrictEqual(photoRes.rawPayload.slice(0, 4).toString('hex'), '89504e47');

    const list = await app.inject({ method: 'GET', url: '/api/incidents' });
    const inList = (JSON.parse(list.body).data as { id: string; hasPhoto?: boolean }[]).find((i) => i.id === created.id);
    assert.strictEqual(inList?.hasPhoto, true);
  } finally {
    await app.close();
  }
});

test('foto: un archivo que no es una imagen se rechaza', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: await devHeaders('photo-invalid'),
      payload: { category: 'perdido', zone: spot(), description: text('Objeto perdido'), photo: Buffer.from('esto no es una imagen').toString('base64') },
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(JSON.parse(res.body).error, 'INVALID_PHOTO');
  } finally {
    await app.close();
  }
});

test('foto: un aviso sin foto responde 404 en /photo', async () => {
  const app = buildApp();
  try {
    const inc = await publish(app, 'photo-none');
    const res = await app.inject({ method: 'GET', url: `/api/incidents/${inc.id}/photo` });
    assert.strictEqual(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('GET /api/incidents/:id: un aviso suelto, público, para compartir o resolver un push', async () => {
  const app = buildApp();
  try {
    const inc = await publish(app, 'single-get-author');
    const res = await app.inject({ method: 'GET', url: `/api/incidents/${inc.id}` });
    assert.strictEqual(res.statusCode, 200, res.body);
    const data = JSON.parse(res.body).data;
    assert.strictEqual(data.id, inc.id);
    assert.strictEqual(data.status, 'active');

    const gone = await app.inject({ method: 'GET', url: '/api/incidents/no-existe' });
    assert.strictEqual(gone.statusCode, 404);

    await pool.query(`UPDATE incidents SET status = 'hidden' WHERE id = $1`, [inc.id]);
    const hidden = await app.inject({ method: 'GET', url: `/api/incidents/${inc.id}` });
    assert.strictEqual(hidden.statusCode, 404, 'un aviso oculto no debe poder compartirse ni resolverse');
  } finally {
    await app.close();
  }
});
