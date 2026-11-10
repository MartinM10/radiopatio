import { config } from '../config';
import { pool } from '../db';
import { categories } from '../routes/categories';

/**
 * Detección de episodios (un temporal, una DANA, un terremoto).
 *
 * Cada pasada mira los avisos de emergencias de las últimas 24 h por municipio.
 * Si un municipio supera el umbral (EPISODE_MIN_NOTICES avisos, EPISODE_MIN_CONFIRMED
 * de ellos confirmados por otro vecino) y ningún episodio lo cubre ya, crea un
 * BORRADOR. Un borrador es privado: nada se publica hasta que un moderador lo
 * aprueba (POST /api/admin/episodes/:slug/publish). Así no hace falta darse cuenta
 * a mano, y un pico de avisos falsos no se convierte en un balance público.
 */
const EMERGENCY_IDS = categories.filter((c) => c.group === 'emergencias').map((c) => c.id);
const MAX_OPEN_DRAFTS = 20;

/** «Temporal del 8 y 9 de noviembre» → «temporal-del-8-y-9-de-noviembre». */
export const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Avisa al moderador por webhook si hay uno configurado. Nunca lanza ni registra la URL (suele llevar un secreto). */
export async function notifyAdmin(text: string): Promise<void> {
  if (!config.adminWebhookUrl) return;
  try {
    const res = await fetch(config.adminWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // text: Slack y Mattermost; content: Discord.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) console.error(`[episodios] el webhook respondió ${res.status}`);
  } catch (err) {
    console.error('[episodios] no se pudo avisar por webhook:', err instanceof Error ? err.name : 'error');
  }
}

interface Candidate {
  municipality: string;
  total: number;
  confirmed: number;
  first_day: string;
  last_day: string;
}

/** Crea o amplía borradores. Devuelve los slugs de los borradores NUEVOS. */
export async function detectEpisodeSuggestions(): Promise<string[]> {
  const { rows } = await pool.query<Candidate>(
    `SELECT municipality,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE confirmations_count >= 1)::int AS confirmed,
            to_char(MIN((created_at AT TIME ZONE 'Europe/Madrid')::date), 'YYYY-MM-DD') AS first_day,
            to_char(MAX((created_at AT TIME ZONE 'Europe/Madrid')::date), 'YYYY-MM-DD') AS last_day
     FROM incidents
     WHERE status = 'active' AND municipality IS NOT NULL AND municipality <> ''
       AND category = ANY($1) AND created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY municipality
     HAVING COUNT(*) >= $2 AND COUNT(*) FILTER (WHERE confirmations_count >= 1) >= $3`,
    [EMERGENCY_IDS, config.episodeMinNotices, config.episodeMinConfirmed],
  );

  const created: string[] = [];
  for (const c of rows) {
    const reason = `${c.total} avisos de emergencias en las últimas 24 h, ${c.confirmed} confirmados por otro vecino`;
    // ¿Algún episodio (borrador o publicado) ya cubre este municipio ahora?
    const covering = await pool.query<{ slug: string; status: string }>(
      `SELECT slug, status FROM episodes
       WHERE ends_on >= (CURRENT_DATE - 1)
         AND EXISTS (SELECT 1 FROM unnest(municipalities) m WHERE lower(m) = lower($1))
       ORDER BY (status = 'published') DESC LIMIT 1`,
      [c.municipality],
    );
    if (covering.rows.length > 0) {
      // Un borrador que sigue vivo se amplía; uno publicado lo gestiona el moderador.
      if (covering.rows[0].status === 'draft') {
        await pool.query(`UPDATE episodes SET ends_on = GREATEST(ends_on, $2::date), reason = $3 WHERE slug = $1`, [covering.rows[0].slug, c.last_day, reason]);
      }
      continue;
    }
    const open = await pool.query(`SELECT COUNT(*)::int AS n FROM episodes WHERE status = 'draft'`);
    if (open.rows[0].n >= MAX_OPEN_DRAFTS) continue;

    const slug = `sugerido-${slugify(c.municipality)}-${c.first_day}`.slice(0, 80);
    const name = `Posible episodio en ${c.municipality}`;
    const ins = await pool.query(
      `INSERT INTO episodes (slug, name, municipalities, starts_on, ends_on, status, reason, suggested_at)
       VALUES ($1, $2, $3, $4::date, $5::date, 'draft', $6, NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [slug, name, [c.municipality], c.first_day, c.last_day, reason],
    );
    if ((ins.rowCount ?? 0) > 0) {
      created.push(slug);
      console.log(`[episodios] borrador creado: ${slug} (${reason})`);
      await notifyAdmin(`Radio Patio: posible episodio en ${c.municipality}. ${reason}. Revísalo y publícalo con: POST /api/admin/episodes/${slug}/publish`);
    }
  }
  return created;
}
