# Calidad del dato de principio a fin

> Este documento describe las reglas de calidad del dato de Alerta Vecinal:
> qué se garantiza en el cliente, en el servidor y en la base de datos. La
> regla de oro: **el servidor revalida exactamente las mismas reglas que la
> app** — los módulos son espejo con semántica idéntica y tests verificados
> en ambos lados (app: 17; server: 29).

## Dimensiones y dónde se garantizan

| Dimensión | Qué significa aquí | Cliente | Servidor / BD |
|---|---|---|---|
| **Validez** | Todo aviso cumple el esquema y las reglas del dominio | Tipos TS + caché saneada (`app/src/lib/dataQuality.ts`) | Zod en cada endpoint (`server/src/routes/*`) + reglas espejo(`quality.ts`) |
| **Completitud** | Sin campos obligatorios vacíos | Categoría, zona, descripción 10–280, declaración de veracidad | Igual en el esquema de la API |
| **Unicidad** | No hay avisos repetidos ni colisiones de ID | — | **Deduplicación semántica entre cuentas** (misma celda hex + categoría + similitud ≥ 0,75 en 45 min → 409), IDs `u{ts}_{hex}` |
| **Consistencia** | El estado no se contradice | Confirmación una vez por dispositivo, no sobre avisos propios; conteo en transacción (`FOR UPDATE`) | Igual + `confirmations_count` transaccional en PostgreSQL |
| **Frescura / retención** | El dato viejo no se muestra ni se retiene | Caché purgada en cada guarda (`pruneExpired`) | Listado y publicación filtran por TTL **y purge físicamente** (`db/purge.ts`, job cada 15 min + en cada lectura) |
| **Veracidad / confianza** | El dato no verificado no pesa como verificado | `trustWeight` (0,5) en el grid hexagonal | `GET /api/zones/alert` solo suma avisos confirmados (≥ 2 vecinos) y exige **muestra mínima** (`sampleSufficient`) |
| **Privacidad como calidad** | Un dato que incumple privacidad es un dato defectuoso | Filtro RGPD en la entrada y **también al leer la caché** | El mismo filtro corre en cada POST; los triggers del servidor jamás devuelven GPS exacto (solo centro de celda hex ~450 m) |
| **Integridad / persistencia** | El almacenamiento corrupto o manipulado no llega a la UI | `parseStoredIncidents` valida cada registro del caché; JSON corrupto nunca en la UI | PostgreSQL transaccional; **guard de paridad** `schema.sql` ↔ `schema.ts` en tests |
| **Geografía fiel** | La celda la decide quien conoce la verdad: el servidor | El cliente snappea igual (código espejo) para dibujar | `server/src/lib/geo.ts` deriva la celda desde lat/lng; el `gx/gy` del cliente se ignora cuando hay GPS |

## Flujo del dato (entrada → API → BD → consumo)

```
Captura (ReportScreen)
  1. texto con límites y filtro de privacidad en vivo
  2. declaración de veracidad obligatoria; GPS con consentimiento
        │
        ▼
POST /api/incidents (servidor = única puerta de verdad)
  3. zod: categoría + zona + descripción (10-280)
  4. filtro de privacidad server-side (checkText espejo)
  5. anti-abuso: máx. 5 avisos/hora por dispositivo + hueco mín. 1 min
  6. purga de caducados (> 72 h se borran físicamente)
  7. deduplicación semántica entre cuentas (celda hex + texto) → 409 «confírmalo»
  8. celda hexagonal derivada EN SERVIDOR desde lat/lng (el cliente no la decide)
  9. INSERT transaccional con hex_key/hex_lat/hex_lng
        │
        ▼
PostgreSQL
 10. incident_confirmations / incident_flags por device_hash (UNIQUE)
 11. flags_count ≥ 3 → status 'hidden' + fila en moderation_log (auditoría DSA)
 12. purge job (15 min) borra con CASCADE lo caducado
        │
        ▼
Consumo
 13. GET /api/incidents: lat/lng = SIEMPRE centro de celda (~450 m);
     mine/confirmedByMe/flaggedByMe por device_hash del lector
 14. app: respuesta del servidor saneada (sanitizeState) y fusida con lo
     propio optimista; el caché local también se sanea al cargar
 15. mapa hexagonal ponderado por confianza (0,5 sin confirmar);
     /api/zones/alert solo cuenta confirmados y exige muestra mínima
```

## Reglas exactas (constantes espejo, `lib/quality.ts` en ambos lados)

| Regla | Valor | Racional |
|---|---|---|
| `MIN_DESC` / `MAX_DESC` | 10 / 280 | Suficiente para ser útil, corto para ser legible |
| Retención | 72 h | Minimización (RGPD): pasado el plazo, el dato se BORRA (no solo oculta) |
| `CONFIRMED_AT` | 2 | Definición de «confirmado por vecinos» en toda la app |
| `TRUST_UNCONFIRMED` | 0.5 | Un aviso sin confirmar no dispara alarmas solo |
| `MAX_PER_HOUR` / `MIN_GAP_MS` | 5/h y 60 s | Anti-spam sin frenar al vecino legítimo |
| `DUP_WINDOW_MIN` / `DUP_SIMILARITY` | 45 min / 0.75 | Deduplica repeticiones, no coexistencias; sin acentos, plurales y mayúsculas (tokenización normalizada) |
| `MIN_ZONE_SAMPLE` | 2 | Sin muestra mínima, la estadística de zona no afirma nada del barrio |
| Tolerancia de reloj | ±5 min | Fechas «del futuro» más allá del desfase son inválidas |
| Edad máxima en caché | 30 días | Un dato más viejo que eso es basura estructural |
| Celda hexagonal | ~450 m | Área legible por barrio/zona; la exposición máxima de privacidad |
| `rateLimitMax` (IP) | 600/min (env) | Absorción global encima del anti-abuso por dispositivo; `/health` exento |
| Semillas | solo desarrollo | Nunca datos ficticios en una base de producción (veracidad) |
| Avisos rechazados | nunca quedan como propios | Si el servidor rechaza (dedup, rate limit, privacidad), el optimista se elimina y el vecino ve el motivo |

## Comprobaciones ejecutadas (todo en Docker)

- **`server/src/tests/quality.test.ts`** — reglas puras espejo: similitud,
  duplicados por celda, retención numérica, `trustWeight`, niveles de alerta,
  idempotencia de `snapToHexGrid` y **paridad `schema.sql` ↔ `SCHEMA_SQL`**.
- **`server/src/tests/privacy.test.ts`** — filtro RGPD: teléfonos, IBAN y
  tarjetas, matrículas nuevas y antiguas, DNI/NIE, enlaces, odio, identidad y
  variantes de llamadas a la violencia; y casos sin falsos positivos.
- **`server/src/tests/routes.quality.test.ts`** — integración con BD: dedup
  entre cuentas (409), hueco mínimo (429), **fuga de coordenadas imposible**
  (lista devuelve el centro de celda), estadística de zona con confirmados y
  muestra, moderación con cola/auditoría/token, y purga física a 72 h.
- **`app/tests/dataQuality.test.ts` + `app/tests/api.test.ts`** — espejo del
  cliente: saneado del caché (`sanitizeIncident` / `parseStoredIncidents`),
  json corrupto, retención, `trustWeight`, dedup, filtro de privacidad,
  semillas, celda hex idempotente y errores tipados de la API (`ApiError`).
- **`server/scripts/check-ratelimit.mjs`** — el limitador por IP corta en el
  máximo y `/health` queda exento. **`check-parity.mjs`** — celdas SQL ↔ JS.

```powershell
docker compose run --rm -T app npx tsc --noEmit           # typecheck app
docker compose run --rm -T app npm test                   # 17 tests cliente
docker compose run --rm -T server sh -c "npm run build && npm test"   # 29 tests server (con db)
```

## Métricas recomendadas

- **Tasa de rechazo en la entrada** por motivo (privacidad, duplicado, rate limit):
  Alta de privacidad → copy del formulario; alta de duplicados → el dedup funciona.
- **Tiempo hasta primera confirmación vecinal** por categoría.
- **Ratio de avisos ocultados** por celda (concentración = manipulación o zona crítica).
- **Confirmados / publicados** a 24 h: calidad global del flujo.
- **Registros descartados al sanear el caché**: salud del cliente.

## Hoja de ruta

1. 🔜 Cliente móvil consume `/api/zones/alert` como fuente de decisión del nivel
   de la zona (hoy el nivel del mapa ya pondera confianza en cliente).
2. 🔜 Publicación con comprobación de presencia en la celda (TRUST.md §2).
3. 🔜 Métricas exportadas con alertas (base: `GET /api/stats/categories`).
4. 🔜 Informes de transparencia DSA derivados de `moderation_log`.
