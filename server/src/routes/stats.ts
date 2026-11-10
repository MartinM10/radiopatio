import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { isAdmin } from '../lib/admin';
import { slugify } from '../lib/episodes';
import { dailyStats, knownMunicipalities, summarize } from '../lib/stats';

/**
 * Estadísticas públicas y episodios (balance de daños tras un temporal, un
 * terremoto…). Lo público son recuentos por día, municipio y categoría: nunca
 * hay texto, calle, celda ni autor. Los episodios los crea un moderador.
 */
const MAX_RANGE_DAYS = 92;
const MAX_EPISODE_DAYS = 62;

const dayStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Fecha no válida');

const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

const statsQuerySchema = z
  .object({
    from: dayStr,
    to: dayStr,
    municipality: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(32).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'from no puede ser posterior a to', path: ['from'] })
  .refine((v) => daysBetween(v.from, v.to) < MAX_RANGE_DAYS, { message: `El periodo no puede superar ${MAX_RANGE_DAYS} días`, path: ['to'] });

const episodeSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    municipalities: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
    startsOn: dayStr,
    endsOn: dayStr,
  })
  .refine((v) => v.startsOn <= v.endsOn, { message: 'startsOn no puede ser posterior a endsOn', path: ['startsOn'] })
  .refine((v) => daysBetween(v.startsOn, v.endsOn) < MAX_EPISODE_DAYS, { message: `Un episodio no puede durar más de ${MAX_EPISODE_DAYS} días`, path: ['endsOn'] });

export { slugify };

interface EpisodeRow {
  slug: string;
  name: string;
  municipalities: string[];
  starts_on: string;
  ends_on: string;
  status: string;
  reason: string | null;
}

const EPISODE_COLS = `slug, name, municipalities, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, status, reason`;
const presentEpisode = (e: EpisodeRow) => ({
  slug: e.slug,
  name: e.name,
  municipalities: e.municipalities,
  startsOn: e.starts_on,
  endsOn: e.ends_on,
});
/** Para el moderador: además, si es un borrador y por qué se propuso. */
const presentForAdmin = (e: EpisodeRow) => ({ ...presentEpisode(e), status: e.status, reason: e.reason });

// Cambios que el moderador puede hacer al publicar un borrador.
const publishSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    municipalities: z.array(z.string().trim().min(2).max(80)).min(1).max(30).optional(),
    startsOn: dayStr.optional(),
    endsOn: dayStr.optional(),
  })
  .default({});

const unauthorized = (reply: FastifyReply) =>
  reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Falta o es inválido el x-admin-token.' });

export async function statsRoutes(app: FastifyInstance) {
  // GET /api/stats/daily?from=&to=&municipality=&category=
  app.get('/api/stats/daily', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = statsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY_PARAMS', details: parsed.error.format() });
    }
    const { from, to, municipality, category } = parsed.data;
    const rows = await dailyStats({ from, to, municipalities: municipality ? [municipality] : undefined, category });
    reply.header('Cache-Control', 'public, max-age=300');
    return { data: rows };
  });

  // GET /api/stats/municipalities — los nombres tal como están guardados
  app.get('/api/stats/municipalities', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return { data: await knownMunicipalities() };
  });

  // GET /api/episodes
  app.get('/api/episodes', async (_req, reply) => {
    const { rows } = await pool.query<EpisodeRow>(`SELECT ${EPISODE_COLS} FROM episodes WHERE status = 'published' ORDER BY starts_on DESC, id DESC LIMIT 50`);
    reply.header('Cache-Control', 'public, max-age=300');
    return { data: rows.map(presentEpisode) };
  });

  // GET /api/episodes/:slug — el balance del episodio
  app.get<{ Params: { slug: string } }>('/api/episodes/:slug', async (req, reply) => {
    const { rows } = await pool.query<EpisodeRow>(`SELECT ${EPISODE_COLS} FROM episodes WHERE slug = $1 AND status = 'published'`, [req.params.slug]);
    if (rows.length === 0) {
      return reply.status(404).send({ error: 'EPISODE_NOT_FOUND', message: 'Episodio no encontrado' });
    }
    const ep = presentEpisode(rows[0]);
    const stats = await dailyStats({ from: ep.startsOn, to: ep.endsOn, municipalities: ep.municipalities });
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      data: {
        ...ep,
        ...summarize(stats),
        // Los avisos aún activos (menos de 72 h) también cuentan: el balance está al día.
        asOf: new Date().toISOString(),
      },
    };
  });

  // POST /api/admin/episodes — un moderador define un episodio
  app.post('/api/admin/episodes', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req)) return unauthorized(reply);
    const parsed = episodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    }
    const { name, municipalities, startsOn, endsOn } = parsed.data;
    const slug = slugify(name);
    if (!slug) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'El nombre debe tener letras o números.' });
    }
    try {
      await pool.query(`INSERT INTO episodes (slug, name, municipalities, starts_on, ends_on) VALUES ($1, $2, $3, $4::date, $5::date)`, [
        slug,
        name,
        municipalities,
        startsOn,
        endsOn,
      ]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: 'SLUG_TAKEN', message: 'Ya hay un episodio con ese nombre. Cambia el nombre.' });
      }
      throw err;
    }
    return reply.status(201).send({ data: { slug, name, municipalities, startsOn, endsOn } });
  });

  // GET /api/admin/episodes?status=draft|published — borradores sugeridos y publicados
  app.get<{ Querystring: { status?: string } }>('/api/admin/episodes', async (req, reply) => {
    if (!isAdmin(req)) return unauthorized(reply);
    const status = req.query.status === 'draft' || req.query.status === 'published' ? req.query.status : null;
    const { rows } = await pool.query<EpisodeRow>(
      `SELECT ${EPISODE_COLS} FROM episodes WHERE ($1::text IS NULL OR status = $1) ORDER BY (status = 'draft') DESC, starts_on DESC, id DESC LIMIT 100`,
      [status],
    );
    return { data: rows.map(presentForAdmin) };
  });

  // POST /api/admin/episodes/:slug/publish — aprueba un borrador (y opcionalmente lo corrige)
  app.post<{ Params: { slug: string } }>('/api/admin/episodes/:slug/publish', async (req, reply) => {
    if (!isAdmin(req)) return unauthorized(reply);
    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
    }
    const found = await pool.query<EpisodeRow>(`SELECT ${EPISODE_COLS} FROM episodes WHERE slug = $1`, [req.params.slug]);
    if (found.rows.length === 0) {
      return reply.status(404).send({ error: 'EPISODE_NOT_FOUND', message: 'Episodio no encontrado' });
    }
    const cur = found.rows[0];
    if (cur.status === 'published') {
      return reply.status(409).send({ error: 'ALREADY_PUBLISHED', message: 'Este episodio ya está publicado.' });
    }
    const name = parsed.data.name ?? cur.name;
    const startsOn = parsed.data.startsOn ?? cur.starts_on;
    const endsOn = parsed.data.endsOn ?? cur.ends_on;
    if (startsOn > endsOn) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'startsOn no puede ser posterior a endsOn' });
    }
    if (daysBetween(startsOn, endsOn) >= MAX_EPISODE_DAYS) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: `Un episodio no puede durar más de ${MAX_EPISODE_DAYS} días` });
    }
    // Si lo renombra, el enlace público se rehace con el nombre nuevo; si no, conserva el del borrador.
    const slug = parsed.data.name ? slugify(name) : cur.slug;
    if (!slug) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'El nombre debe tener letras o números.' });
    }
    try {
      await pool.query(
        `UPDATE episodes SET slug = $2, name = $3, municipalities = $4, starts_on = $5::date, ends_on = $6::date, status = 'published'
         WHERE slug = $1`,
        [cur.slug, slug, name, parsed.data.municipalities ?? cur.municipalities, startsOn, endsOn],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: 'SLUG_TAKEN', message: 'Ya hay un episodio con ese nombre. Cambia el nombre.' });
      }
      throw err;
    }
    return { data: { slug, name, municipalities: parsed.data.municipalities ?? cur.municipalities, startsOn, endsOn, status: 'published' } };
  });

  // DELETE /api/admin/episodes/:slug
  app.delete<{ Params: { slug: string } }>('/api/admin/episodes/:slug', async (req, reply) => {
    if (!isAdmin(req)) return unauthorized(reply);
    const res = await pool.query(`DELETE FROM episodes WHERE slug = $1`, [req.params.slug]);
    if (res.rowCount === 0) {
      return reply.status(404).send({ error: 'EPISODE_NOT_FOUND', message: 'Episodio no encontrado' });
    }
    return { data: { deleted: true } };
  });
}
