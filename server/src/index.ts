import { buildApp } from './app';
import { config } from './config';
import { pool } from './db';
import { runMigrations } from './db/migrate';
import { seedIfEmpty } from './db/seed';
import { purgeExpiredIncidents } from './db/purge';

async function start() {
  const app = buildApp();

  try {
    // Migraciones y datos iniciales
    await runMigrations();
    if (config.env === 'production') {
      // Minimización y veracidad: nunca sembrar avisos ficticios en una base real.
      console.log('[datos] producción: omitimos el sembrado de avisos de demostración');
    } else {
      await seedIfEmpty();
    }

    await app.listen({ port: config.port, host: config.host });
    console.log(`Radio Patio API listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Purga de retención: los caducados se eliminan físicamente (minimización RGPD).
  const purgeTimer = setInterval(() => {
    purgeExpiredIncidents()
      .then((n) => {
        if (n > 0) console.log(`[retención] ${n} avisos caducados purgados`);
      })
      .catch((err) => console.error('[retención] purga fallida:', err));
  }, config.purgeIntervalMinutes * 60_000);
  purgeTimer.unref();

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      await pool.end();
      console.log('Server and database pool closed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

start();
