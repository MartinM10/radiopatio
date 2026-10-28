# Modelo de confianza: pseudonimato y resistencia a la manipulación

> El problema que resuelve este documento: **alguien podría usar la
> herramienta para manipular las estadísticas de un barrio** (hundir su
> reputación con fines especulativos, por rencilla o por diversión) **si
> publicar es anónimo y no sabemos quién reporta**. Aquí se define la
> arquitectura que lo impide sin sacrificar el anonimato público, que es
> también un requisito de seguridad para quien reporta.

## 1. Principio: identidad ante la plataforma, anonimato ante el barrio

Dos planos que no deben confundirse nunca:

| Plano | Qué ve | Ejemplo |
|---|---|---|
| **Público (la app y la API)** | El aviso, la celda (~450 m), el número de confirmaciones. **Nunca el autor ni sus coordenadas exactas.** | «Hurto · Calle Larios · hace 20 min · sin confirmar» |
| **Privado (el servidor)** | El hash pseudónimo del dispositivo (SHA-256 + salt), y el mínimo metadato legal | `device_hash`, fecha de alta implícita en el aviso, sin IP en claro |

Este modelo se llama **pseudonimato** y es el estándar de plataformas
colaborativas (Wikipedia, Reddit) y vecinales (Nextdoor). No es un término
medio entre anonimato e identidad: es la forma de tener las ventajas de ambos.

Por qué el anonimato *público* es requisito (no solo una elección):

- Mostrar autores en un mapa de delitos crearía riesgo de señalamiento,
  difamación y represalias entre vecinos.
- Silenciaría a testigos y víctimas que no quieren quedar expuestos.
- La calidad del dato empeora: sin anonimato público, menos gente reporta.
- Publicar el GPS exacto de *cualquier* vecino crearía riesgo de reidentificación
  y acoso; por eso la API devuelve **siempre el centro de la celda hexagonal**
  (~450 m), también para el propio autor.

Y por qué la identidad *privada* es necesaria:

- Sin ella, la manipulación es gratuita: reinstalar la app y sembrar 50 avisos.
- Con ella, la manipulación tiene coste, deja rastro y es sancionable.
- Los prestadores de *alojamiento de datos* tienen deberes de identificación
  del origen de los contenidos (LSSI art. 12 / Ley 25/2007 (*) — pendiente de
  verificación legal, ver docs/LEGAL.md).

Estado actual de la identidad: el servidor EMITE un token de dispositivo y
solo guarda su hash. Toda escritura exige un token válido; ya no se acepta un
identificador elegido por el cliente (`X-Device-Id`) ni la IP, que permitían
fabricar identidades cambiando una cabecera. Los avisos guardan un
`device_hash` derivado del id interno del dispositivo, estable aunque el token
rote. Las cuentas verificadas con Google guardan `identity_hash` (HMAC con
secreto del `sub`), único en BD: una cuenta, un dispositivo. Con
`REQUIRE_VERIFIED_IDENTITY=1` solo esas cuentas pueden escribir; las altas
anónimas están limitadas por IP. Todo sigue siendo dato pseudonimizado (ver
docs/LEGAL.md).

## 2. El verdadero adversario: el ataque Sybil

Un identificador es gratis. El atacante serio no crea uno: crea 50. Por eso la
identidad por sí sola **no** resuelve el problema; es la primera capa de cinco.
La divisa de esta batalla es **el coste por identidad**:

| Mecanismo de identidad | Coste para el atacante | Fricción para el vecino | Rol |
|---|---|---|---|
| Dispositivo local (actual) | ~0 | 0 | MVP: hash pseudónimo por dispositivo |
| OTP por SMS | ~0,10–1 €/SIM | Bajo-medio | Fase 2 (recomendado en lanzamiento) |
| Cuenta Google | Bajo | Bajo | Fase 2 |
| Verificación de residencia | Alto | Medio-alto | Fase 3, por zona |
| Attestation de dispositivo (Play Integrity / App Attest) | Alto | 0 | Fase 2-3 |

### Publicación restringida por geografía (capa que mata el caso especulativo remoto)

El escenario de amenaza concreto: *alguien desde fuera siembra avisos falsos
en un barrio para hundir su reputación*. La medida más quirúrgica:

- Solo se puede publicar en la celda donde estás (GPS con consentimiento; el
  servidor **deriva y comprueba la celda**, no confía en la del cliente) o
  donde has verificado residencia.
- Un especulador remoto necesita desplazarse físicamente o acreditar
  residencia: el coste del ataque se dispara y deja rastro.
- Estado actual: el servidor deriva la celda desde las coordenadas; la
  comprobación «¿estás aquí ahora / vives aquí?» es la fase 2 pendiente.
- Modelo de referencia: Nextdoor (verificación de residencia).

## 3. Las cinco capas anti-manipulación

### Capa 1 — Identidad pseudónima (§2)

### Capa 2 — Geografía de publicación

Ver §2. Pendiente de implantar la comprobación de presencia en la celda al
publicar (hoy el servidor confía en que el GPS enviado corresponde a donde
está el vecino; añadir QA de presencia es fase 2).

### Capa 3 — Integridad de la agregación (✅ implementada)

1. **Los avisos sin confirmar pesan la mitad** en el mapa de calor del cliente
   (`app/src/lib/hexgrid.ts` usa `trustWeight`) y **no cuentan** en la
   estadística de zona del servidor (`GET /api/zones/alert` solo suma
   confirmados). Un aviso aislado sin verificar no dispara una alerta solo.
2. **Muestra mínima**: `GET /api/zones/alert` incluye `sampleSufficient`
   (≥ 2 avisos confirmados); sin muestra suficiente, la estadística no afirma
   nada del barrio.
3. **Techo de contribución** ✅: máx. 5 avisos/hora por dispositivo y hueco
   mínimo de 1 min entre avisos del mismo dispositivo.
4. **Deduplicación semántica** ✅: un aviso casi idéntico en la misma celda
   hexagonal dentro de 45 min (categoría igual + similitud de texto ≥ 0,75)
   se rechaza con 409 invitando a *confirmar* el existente, contra **todas**
   las cuentas.
5. **Fases futuras**: cuarentena de ráfagas (K avisos nuevos en una celda en
   1 h → revisión), clustering de dispositivos por IP/concurrente.

### Capa 4 — Confianza progresiva y señal inversa

- **Hoy**: los avisos nacen «sin confirmar» y pesan 0,5 hasta 2
  confirmaciones vecinales.
- **Fase 2 (con cuentas)**: reputación por pseudónimo — tras k confirmaciones
  recibidas y días de actividad, peso pleno; avisos denunciados repetidamente
  como falsos → peso hacia 0 y cola de moderación. Nunca se borra el historial
  (auditoría); su voz simplemente deja de mover la aguja.
- **Detección de afinidad** (fase 2+): cuenta nueva que solo publica avisos
  negativos de una única celda, nunca confirma los de otros → score de riesgo
  para revisión humana.

### Capa 5 — Moderación, recursos y transparencia (DSA)

- **Hoy (implementado)**: 3 denuncias vecinales independientes ocultan el
  aviso → cola `GET /api/admin/moderation` → resolución con auditoría
  `POST /api/admin/incidents/:id/resolve` (keep-hidden / restore / delete) →
  `GET /api/admin/audit`. El moderador no ve el hash del autor.
- **Fase 2**: recurso del autor al checkout, borrado con motivo visible, SLA,
  e informes de transparencia periódicos (retiradas, cuentas sancionadas).
- **Anclaje de verdad**: convenio con policía local/ayuntamiento para
  contrastar avisos con hechos verificados («confirmado por fuente oficial»).

## 4. Estado por pieza

| Pieza | Estado | Dónde |
|---|---|---|
| Celda hexagonal derivada y comprobada en servidor | ✅ | `server/src/lib/geo.ts` (port 1:1 de `app/src/lib/hexgrid.ts`) |
| Coordenadas exactas nunca salen de la BD | ✅ | `GET /api/incidents` devuelve `hex_lat/hex_lng` (centro celda ~450 m) |
| Anti-spam por dispositivo (5/h + hueco 1 min) | ✅ | `server/src/routes/incidents.ts` |
| Deduplicación semántica entre cuentas | ✅ | `server/src/lib/quality.ts` + POST |
| Agregados públicos solo con confirmados + muestra mínima | ✅ | `GET /api/zones/alert` + `trustWeight` en el cliente |
| Auto-ocultación por denuncias + cola de moderación + auditoría | ✅ (falta recurso del autor e informes) | `server/src/routes/moderation.ts` |
| Token emitido por el servidor, obligatorio en toda escritura | ✅ | `server/src/lib/device.ts` (`authenticateWrite`) |
| Altas anónimas limitadas por IP | ✅ | `POST /api/devices/register` (`REGISTER_RATE_MAX`) |
| Cuenta verificada con Google: una cuenta = un dispositivo | ✅ servidor · 🔜 login en la app | `POST /api/auth/google`, `identity_hash` único |
| Solo cuentas verificadas escriben | ✅ (opt-in `REQUIRE_VERIFIED_IDENTITY=1`) | activar cuando la app tenga login |
| Verificación por SMS | 🔜 (fail-closed: `501`) | falta proveedor |
| Comprobación «estás en la celda que publicas» | 🔜 Fase 2 | §2 |
| Cuarentena de ráfagas y scores de riesgo | 🔜 | §3 |
| Recurso del autor + informes de transparencia | 🔜 | §3 capa 5 |

## 5. Esquema de datos (PostgreSQL, `server/src/db/schema.ts`)

```
accounts                (fase 2; hoy device_hash implícito por aviso)
incidents               id, category, grid_x/grid_y (legado), hex_key,
                        hex_lat/hex_lng (centro celda), lat/lng (NUNCA salen),
                        address, status ('active'|'hidden'), device_hash,
                        confirmations_count, flags_count, created_at
incident_confirmations  (incident_id, device_hash) UNIQUE
incident_flags          (incident_id, device_hash) UNIQUE, reason
moderation_log          (incident_id, action, actor, reason, at)
```

Lo que **no** existe: nombre, email o autoría visible en ninguna API pública;
el `device_hash` nunca sale del servidor y nunca en las respuestas.

## 6. Métricas de salud del sistema de confianza

- Ratio de avisos ocultados por denuncias, por celda y por ventana (el mapa
  de calor no debería concentrar ocultaciones salvo manipulación o zona crítica).
- Distribución de confirmaciones por dispositivo (publicar mucho sin recibir
  ninguna es raro; recibir todas sin publicar también).
- Ráfagas por celda y hora (deben ser eventos raros y revisados).
- Tiempo medio hasta retirada de un aviso denunciado.
- Actividad de dispositivos nuevos agrupados en una misma celda (Sybil).
