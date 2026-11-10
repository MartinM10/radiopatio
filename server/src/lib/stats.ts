import { pool } from '../db';

/**
 * Estadísticas de avisos por día, municipio y categoría.
 *
 * Los avisos caducados ya no existen: solo queda su suma en
 * incident_daily_counts, que se escribe en la misma sentencia que los borra
 * (db/purge.ts). Los avisos que siguen activos (menos de 72 h) todavía no
 * están sumados, así que se cuentan aparte y se unen. Nunca coinciden: un
 * aviso pasa de uno a otro lado de una sola vez, al purgarse.
 *
 * Nada de aquí permite identificar a nadie: no hay texto, calle, celda ni autor.
 */
export interface StatsRow {
  day: string;
  /** null cuando no se pudo determinar el municipio. */
  municipality: string | null;
  category: string;
  total: number;
  confirmed: number;
  verified: number;
}

export interface StatsQuery {
  /** YYYY-MM-DD, inclusive, en hora de Madrid. */
  from: string;
  to: string;
  /** Si se indica, solo estos municipios (sin distinguir mayúsculas). */
  municipalities?: string[];
  category?: string;
}

const MERGED = `
  WITH merged AS (
    SELECT day, municipality, category, total, confirmed, verified FROM incident_daily_counts
    UNION ALL
    SELECT (created_at AT TIME ZONE 'Europe/Madrid')::date, COALESCE(municipality, ''), category,
           1, (confirmations_count >= 1)::int, (confirmations_count >= 2)::int
    FROM incidents WHERE status = 'active'
  )`;

export async function dailyStats(q: StatsQuery): Promise<StatsRow[]> {
  const { rows } = await pool.query(
    `${MERGED}
     SELECT to_char(day, 'YYYY-MM-DD') AS day, municipality, category,
            SUM(total)::int AS total, SUM(confirmed)::int AS confirmed, SUM(verified)::int AS verified
     FROM merged
     WHERE day BETWEEN $1::date AND $2::date
       AND ($3::text[] IS NULL OR lower(municipality) = ANY($3))
       AND ($4::text IS NULL OR category = $4)
     GROUP BY day, municipality, category
     ORDER BY day, municipality, category
     LIMIT 5000`,
    [q.from, q.to, q.municipalities?.map((m) => m.toLowerCase()) ?? null, q.category ?? null],
  );
  return rows.map((r) => ({ ...r, municipality: r.municipality === '' ? null : r.municipality })) as StatsRow[];
}

/** Municipios con avisos en el último año, para que un moderador escriba sus nombres tal como están guardados. */
export async function knownMunicipalities(): Promise<{ municipality: string; total: number }[]> {
  const { rows } = await pool.query(
    `${MERGED}
     SELECT municipality, SUM(total)::int AS total
     FROM merged
     WHERE municipality <> '' AND day >= (CURRENT_DATE - 365)
     GROUP BY municipality
     ORDER BY total DESC, municipality
     LIMIT 300`,
  );
  return rows as { municipality: string; total: number }[];
}

export interface Totals {
  total: number;
  confirmed: number;
  verified: number;
}

const empty = (): Totals => ({ total: 0, confirmed: 0, verified: 0 });
const add = (a: Totals, r: Totals) => {
  a.total += r.total;
  a.confirmed += r.confirmed;
  a.verified += r.verified;
};

/** Balance de un periodo: totales, por categoría (lo más confirmado primero) y por día. */
export function summarize(rows: StatsRow[]) {
  const totals = empty();
  const byCategory = new Map<string, Totals>();
  const byDay = new Map<string, Totals>();
  for (const r of rows) {
    add(totals, r);
    if (!byCategory.has(r.category)) byCategory.set(r.category, empty());
    add(byCategory.get(r.category)!, r);
    if (!byDay.has(r.day)) byDay.set(r.day, empty());
    add(byDay.get(r.day)!, r);
  }
  return {
    totals,
    byCategory: [...byCategory.entries()]
      .map(([category, t]) => ({ category, ...t }))
      .sort((a, b) => b.confirmed - a.confirmed || b.total - a.total || a.category.localeCompare(b.category)),
    byDay: [...byDay.entries()].map(([day, t]) => ({ day, ...t })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}
