/**
 * Comprobación del limitador global por IP:
 * - el endpoint normal (categorías, estático y barato) empieza a devolver 429
 *   una vez agotado el máximo configurado (env RATE_LIMIT_MAX, aquí 20),
 * - /health queda exento (config.rateLimit.max: 0) y sigue respondiendo 200.
 * Uso: docker compose run --rm -T server sh -c "npm run build >/dev/null && npm run check:ratelimit"
 */
process.env.RATE_LIMIT_MAX = '20';
process.env.NODE_ENV = 'test'; // silencia el logger de peticiones

const { buildApp } = await import('../dist/app.js');

const app = buildApp();
try {
  let ok200 = 0;
  let got429 = 0;
  for (let i = 0; i < 40; i++) {
    const res = await app.inject({ method: 'GET', url: '/api/categories' });
    if (res.statusCode === 200) ok200++;
    else if (res.statusCode === 429) got429++;
  }
  const health = await app.inject({ method: 'GET', url: '/health' });
  console.log(JSON.stringify({ ok200, got429, healthStatus: health.statusCode }));
  process.exit(got429 > 0 && health.statusCode === 200 ? 0 : 1);
} catch (e) {
  console.error('check-ratelimit error:', String(e));
  process.exit(1);
} finally {
  await app.close();
}
