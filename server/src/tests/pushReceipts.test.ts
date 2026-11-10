import assert from 'node:assert';
import test from 'node:test';
import { buildApp } from '../app';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import {
  PushReceipt,
  PushTicket,
  pendingReceiptCount,
  processReceipts,
  pushStats,
  setPushSender,
  setReceiptFetcher,
} from '../lib/notify';
import { devHeaders } from './helpers';

const tag = Math.random().toString(36).slice(2, 8);
let seq = 0;
const expoToken = () => `ExponentPushToken[${tag}${(++seq).toString().padStart(8, 'x')}]`;
const baseLat = 38 + Math.random() * 4;
const baseLng = -6 + Math.random() * 4;
const MIN = 60_000;

let ticketsToReturn: PushTicket[] = [];
let receiptsToReturn: Record<string, PushReceipt> = {};
let askedFor: string[][] = [];

test.before(async () => {
  await runMigrations();
  setPushSender(async () => ({ invalidTokens: [], tickets: ticketsToReturn }));
  setReceiptFetcher(async (ids) => {
    askedFor.push(ids);
    return receiptsToReturn;
  });
});

test.after(async () => {
  setPushSender(null);
  setReceiptFetcher(null);
  await pool.end();
});

/** Un autor con token y un vecino que confirma su aviso: genera un envío push al autor. */
async function sendOnePush(label: string): Promise<string> {
  const app = buildApp();
  try {
    const author = await devHeaders(`autor-${label}-${tag}`);
    const token = expoToken();
    const put = await app.inject({ method: 'PUT', url: '/api/notifications/push', headers: author, payload: { token } });
    assert.strictEqual(put.statusCode, 200, put.body);
    const created = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      headers: author,
      payload: { category: 'vehiculo', zone: { lat: baseLat + seq * 0.02, lng: baseLng }, description: `Aviso de prueba de recibos ${tag} ${seq} ${Math.random().toString(36).slice(2)} xqz` },
    });
    assert.strictEqual(created.statusCode, 201, created.body);
    const id = JSON.parse(created.body).data.id as string;
    ticketsToReturn = [{ id: `ticket-${label}-${tag}`, token }];
    const c = await app.inject({ method: 'POST', url: `/api/incidents/${id}/confirm`, headers: await devHeaders(`vecino-${label}-${tag}`) });
    assert.strictEqual(c.statusCode, 200, c.body);
    // El envío va en segundo plano.
    for (let i = 0; i < 50 && pendingReceiptCount() === 0; i++) await new Promise((r) => setTimeout(r, 40));
    return token;
  } finally {
    await app.close();
  }
}

const tokenOf = async (token: string) =>
  (await pool.query('SELECT count(*)::int AS n FROM devices WHERE push_token = $1', [token])).rows[0].n as number;

test('un recibo «ok» se da por entregado y deja de esperarse', async () => {
  const token = await sendOnePush('ok');
  assert.strictEqual(pendingReceiptCount(), 1);
  const okBefore = pushStats.receiptsOk;

  // Antes de 15 minutos no se pregunta nada a Expo.
  askedFor = [];
  assert.deepStrictEqual(await processReceipts(Date.now() + 5 * MIN), { checked: 0, errors: 0 });
  assert.strictEqual(askedFor.length, 0);

  receiptsToReturn = { [`ticket-ok-${tag}`]: { status: 'ok' } };
  assert.deepStrictEqual(await processReceipts(Date.now() + 16 * MIN), { checked: 1, errors: 0 });
  assert.strictEqual(pushStats.receiptsOk, okBefore + 1);
  assert.strictEqual(pendingReceiptCount(), 0);
  assert.strictEqual(await tokenOf(token), 1, 'un recibo correcto no toca el token');
});

test('un recibo con error se registra sin el token y no se repite', async () => {
  await sendOnePush('err');
  const errorsBefore = pushStats.receiptErrors;
  receiptsToReturn = {
    [`ticket-err-${tag}`]: { status: 'error', message: 'FCM: InvalidCredentials para "ExponentPushToken[secretsecret]"', details: { error: 'InvalidCredentials' } },
  };

  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.join(' '));
  };
  try {
    assert.deepStrictEqual(await processReceipts(Date.now() + 16 * MIN), { checked: 1, errors: 1 });
  } finally {
    console.error = original;
  }
  assert.strictEqual(pushStats.receiptErrors, errorsBefore + 1);
  assert.ok(logged.some((l) => l.includes('InvalidCredentials')), 'el fallo se registra');
  assert.ok(!logged.some((l) => l.includes('secretsecret')), 'nunca se registra el token');
  assert.strictEqual(pendingReceiptCount(), 0);
});

test('DeviceNotRegistered en el recibo borra el token del dispositivo', async () => {
  const token = await sendOnePush('dead');
  assert.strictEqual(await tokenOf(token), 1);
  receiptsToReturn = { [`ticket-dead-${tag}`]: { status: 'error', details: { error: 'DeviceNotRegistered' } } };
  await processReceipts(Date.now() + 16 * MIN);
  assert.strictEqual(await tokenOf(token), 0);
});

test('un recibo que Expo aún no tiene sigue pendiente hasta que pase el plazo', async () => {
  await sendOnePush('late');
  receiptsToReturn = {};
  assert.deepStrictEqual(await processReceipts(Date.now() + 16 * MIN), { checked: 0, errors: 0 });
  assert.strictEqual(pendingReceiptCount(), 1, 'se reintenta más tarde');
  await processReceipts(Date.now() + 25 * 60 * MIN);
  assert.strictEqual(pendingReceiptCount(), 0, 'pasadas 24 h se abandona');
});
