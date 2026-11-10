# Episodios y balance de daños

Un **episodio** es un temporal, una DANA, un terremoto o cualquier suceso que genere muchos avisos en poco tiempo. Es un nombre, unos municipios y unas fechas. Con él, la web muestra cuántos avisos se registraron, por tipo y por día, en `https://radiopatio.app/balance.html?e=<slug>`.

Los avisos se borran a las 72 h, pero antes de borrarlos el servidor suma cada uno a un recuento anónimo por día, municipio y categoría (`incident_daily_counts`). El balance une ese recuento con los avisos que aún están activos, así que está al día y nada se cuenta dos veces. No hay texto, calle, celda ni autor en ningún sitio.

Los episodios **los crea una persona**; no se detectan solos.

## Crear un episodio

Hace falta el token de administración (`ADMIN_TOKEN` del servidor). No lo escribas en el historial del terminal: léelo en una variable con `read -rs ADMIN_TOKEN`.

1. Mira cómo están guardados los nombres de los municipios (salen de la geocodificación inversa y pueden llevar tilde):
   ```
   curl -s https://api.radiopatio.app/api/stats/municipalities
   ```
2. Crea el episodio. Un periodo máximo de 62 días; el nombre genera el enlace.
   ```
   curl -s -X POST https://api.radiopatio.app/api/admin/episodes \
     -H "x-admin-token: $ADMIN_TOKEN" -H 'content-type: application/json' \
     -d '{"name":"Temporal de noviembre","municipalities":["Málaga","Torremolinos"],"startsOn":"2026-11-08","endsOn":"2026-11-10"}'
   ```
   Devuelve el `slug` (`temporal-de-noviembre`). Un nombre repetido da 409: cámbialo.
3. Comparte `https://radiopatio.app/balance.html?e=temporal-de-noviembre`.

Para retirarlo: `curl -s -X DELETE https://api.radiopatio.app/api/admin/episodes/<slug> -H "x-admin-token: $ADMIN_TOKEN"`.

## Qué se puede consultar sin token

- `GET /api/stats/daily?from=2026-11-08&to=2026-11-10&municipality=Málaga&category=arbol` (periodo máximo de 92 días).
- `GET /api/stats/municipalities`, `GET /api/episodes`, `GET /api/episodes/<slug>`.

## Cómo leer las cifras

- **Publicados:** avisos que llegaron a ser públicos. Los ocultados por moderación, los que no salieron de la cuarentena y los que borra su autor no cuentan.
- **Confirmados:** los que otro vecino dijo haber visto.
- **Verificados:** confirmados por dos o más vecinos.
- Si una cifra va a salir en un medio, cítala siempre como **avisos de vecinos, no datos oficiales**, y la de confirmados antes que la de publicados. Donde hay pocos usuarios las cifras se quedan cortas.
- Los avisos de un día solo entran en el recuento cuando caducan, pero el balance también cuenta los activos.
- Los municipios sin determinar (servicio de direcciones caído al publicar) se reintentan antes de cada purga; los que no se logran quedan fuera de cualquier episodio.
