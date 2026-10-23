/**
 * Juez secundario (Myrmo-style): NUNCA decide, solo puntúa.
 *
 * El juez es un enriquecedor asíncrono: la app acepta el aviso primero y
 * el juez lo puntúa después, escribiendo `judge_score`/`judge_reason` en la
 * fila. El orden de la cola de moderación se deriva del score, pero solo un
 * humano (o una regla determinista) oculta o retira un aviso: el modelo no
 * puede borrar datos por sí solo (docs/TRUST.md §3 y DSA).
 *
 * Contrato del proveedor (inyectable por env):
 *   JUDGE_ENABLED=0 (por defecto)  → no-op, sin modelo ni latencia añadida
 *   JUDGE_ENABLED=1 + JUDGE_PROVIDER=… + JUDGE_MODEL=…  → se invoca al
 *   publicar (setImmediate) y el resultado se persiste para la cola.
 *
 * Proveedores previstos (fase 2, no implementados aquí):
 *   - pysentimiento (HF, CPU, español): hate-speech / toxicidad
 *   - zero-shot NLI multilingüe: difamación, identificación de personas, spam
 *   - API externa: solo si se redacta primero (el texto ya está filtrado por
 *     checkText, lo que lo hace seguro para salir del servidor)
 */
import { pool } from '../db';

export interface JudgeResult {
  score: number; // 0..1, probabilidad de abuso/manipulación
  reason: string; // etiqueta corta para la cola de moderación
}

export type JudgeProvider = (text: string, category: string) => Promise<JudgeResult>;

export const judgeEnabled = (): boolean => process.env.JUDGE_ENABLED === '1';

export const runJudge = async (
  incidentId: string,
  text: string,
  category: string,
  provider?: JudgeProvider,
): Promise<JudgeResult | null> => {
  if (!judgeEnabled()) return null;
  if (!provider) {
    // Sin proveedor configurado, el juez es un no-op aunque esté "enabled":
    // nunca se puntúa a medias. Registrar y seguir.
    console.warn('[juez] JUDGE_ENABLED=1 pero no hay proveedor configurado; se omite.');
    return null;
  }
  try {
    const result = await provider(text, category);
    const score = Math.max(0, Math.min(1, Number.isFinite(result.score) ? result.score : 0));
    await pool.query(
      `UPDATE incidents SET judge_score = $1, judge_reason = $2, judge_at = NOW() WHERE id = $3`,
      [score, result.reason.slice(0, 120), incidentId],
    );
    return { score, reason: result.reason };
  } catch (err) {
    console.warn('[juez] fallo al puntuar', incidentId, err);
    return null;
  }
};

export const heuristicProvider: JudgeProvider = async (text: string, category: string) => {
  let score = 0;
  const reasons: string[] = [];

  // Mayúsculas excesivas (gritos)
  const upperRatio = (text.match(/[A-ZÁÉÍÓÚÑ]/g)?.length ?? 0) / Math.max(1, text.length);
  if (upperRatio > 0.5 && text.length > 20) {
    score += 0.2;
    reasons.push('mayusculas');
  }

  // Spam de emojis
  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu)?.length ?? 0);
  if (emojiCount > 5) {
    score += 0.2;
    reasons.push('emoji-spam');
  }

  // Repetición de palabras (spam)
  const words = text.toLowerCase().split(/\s+/);
  const unique = new Set(words);
  if (words.length > 5 && unique.size / words.length < 0.5) {
    score += 0.2;
    reasons.push('repeticion');
  }

  // Texto muy corto (posible spam o test)
  if (text.length < 15) {
    score += 0.1;
    reasons.push('corto');
  }

  // Contiene patrones de datos personales que el filtro regex no captó
  if (/\d{6,}/.test(text)) {
    score += 0.3;
    reasons.push('numeros');
  }

  // Patrones de odio/difamación comunes
  const hateWords = ['ladron', 'chorizo', 'delincuente', 'basura', 'escoria', 'rata'];
  if (hateWords.some((w) => text.toLowerCase().includes(w))) {
    score += 0.3;
    reasons.push('lenguaje-ofensivo');
  }

  // Categoría sospechoso con texto muy genérico
  if (category === 'sospechoso' && text.length < 30) {
    score += 0.1;
    reasons.push('sospechoso-generico');
  }

  return {
    score: Math.min(1, score),
    reason: reasons.length > 0 ? reasons.join(',') : 'ok',
  };
};

export const getDefaultProvider = (): JudgeProvider | undefined => {
  if (!judgeEnabled()) return undefined;
  const provider = process.env.JUDGE_PROVIDER || 'heuristic';
  if (provider === 'heuristic') return heuristicProvider;
  // Proveedores externos (fase 2b): pysentimiento, openai, etc.
  // Se enchufarán aquí cuando se configuren las credenciales.
  return undefined;
};

export const scheduleJudge = (
  incidentId: string,
  text: string,
  category: string,
  provider?: JudgeProvider,
): void => {
  // Off by default: sin coste de CPU ni de latencia para la publicaci?n.
  if (!judgeEnabled()) return;
  const resolvedProvider = provider ?? getDefaultProvider();
  if (!resolvedProvider) return;
  setImmediate(() => {
    runJudge(incidentId, text, category, resolvedProvider).catch(() => {
      /* ya registrado dentro */
    });
  });
};
