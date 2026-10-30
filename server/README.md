# Radio Patio Backend API

API REST construida con **Node.js**, **TypeScript**, **Fastify** y **PostgreSQL** para la plataforma ciudadana anónima de avisos vecinales **Radio Patio / Alerta Vecinal**.

---

## 🛡️ Principios de Privacidad y Cumplimiento Normativo (RGPD / LOPDGDD / DSA)

- **Cero datos personales**: No se registran nombres, cuentas ni correos electrónicos.
- **Geolocalización aproximada**: Las ubicaciones se representan únicamente por celdas discretas de ~150 m (`gx`, `gy`), nunca por coordenadas GPS exactas.
- **Identificadores anónimos**: Se utiliza un hash unidireccional SHA-256 (`device_hash`) con salt de servidor para prevenir spam y evitar confirmaciones duplicadas o autoreportes sin almacenar el ID real ni la IP.
- **Caducidad automática**: Los avisos se archivan/ocultan automáticamente a las **72 horas**.
- **Filtro de privacidad en servidor**: Bloquea teléfonos, emails, matrículas, DNI/NIE, enlaces web, términos discriminatorios o llamadas a la violencia antes de persistir en base de datos.
- **Moderación comunitaria (DSA)**: Avisos con 3 o más denuncias de vecinos pasan automáticamente a estado oculto (`hidden`).

---

## 🚀 Endpoints de la API

### Salud y Estado
- `GET /health`: Estado del servicio y conectividad con la base de datos PostgreSQL.

### Categorías
- `GET /api/categories`: Listado de categorías de incidencias disponibles (`hogar`, `vehiculo`, `hurto`, `agresion`, `vandalismo`, `sospechoso`, `altercado`, `otro`).

### Incidencias
- `GET /api/incidents`: Listado de incidencias activas en las últimas 72 horas.
  - Query params opcionales: `limit`, `since`, `category`, `gx`, `gy`.
  - Header opcional: `X-Device-Token: <token>` (solo para rellenar `mine`, `confirmedByMe`, `flaggedByMe`).
  - Devuelve lista con `confirmations`, `confirmedByMe`, `flaggedByMe`, `mine`.
- `POST /api/incidents`: Publicar nuevo aviso.
  - Header obligatorio: `X-Device-Token: <token>` (emitido por `POST /api/devices/register` o `POST /api/auth/google`).
  - Body: `{ "category": "hurto", "zone": { "gx": 3, "gy": 4 }, "description": "..." }`.
  - Aplica filtro de privacidad y límite de 5 avisos/hora por dispositivo.
- `POST /api/incidents/:id/confirm`: Confirmar aviso («yo también lo vi»).
  - Header obligatorio: `X-Device-Token: <token>`.
  - Previene confirmar avisos propios o confirmar múltiples veces.
- `POST /api/incidents/:id/flag`: Marcar aviso como inadecuado / abuso.
  - Header obligatorio: `X-Device-Token: <token>`.
  - Aumenta el contador de denuncias; oculta automáticamente al alcanzar el umbral de moderación.

### Identidad
Todas las escrituras (publicar, confirmar, denunciar, recurrir) exigen un token emitido por el servidor; sin él responden `401`. Ya no se acepta `X-Device-Id` ni la IP como identidad.
- `POST /api/devices/register`: alta anónima (limitada a `REGISTER_RATE_MAX` por IP y hora).
- `DELETE /api/devices/me`: derecho de supresión. Header `X-Device-Token`. Borra el dispositivo (token, identidad, posición) y sus avisos, confirmaciones y denuncias. Irreversible; límite 5/hora.
- `POST /api/auth/google`: `{ "idToken": "..." }`. Requiere `GOOGLE_CLIENT_ID`; sin él responde `503`. Una cuenta de Google = un dispositivo: un nuevo login rota el token.
- `POST /api/auth/otp/*`: `501` hasta integrar un proveedor de SMS.
- Con `REQUIRE_VERIFIED_IDENTITY=1`, solo las cuentas verificadas pueden escribir (`403 IDENTITY_REQUIRED`).
- `POST /api/geocode/reverse`: `{ "lat": 36.72, "lng": -4.42 }` → `{ data: { street, locality, label } }`. Sugiere la calle de un punto (sin número de portal). Exige `X-Device-Token` (cualquier dispositivo registrado), límite 20/min por IP. Consulta Nominatim desde el servidor, con caché y como máximo 1 petición/s; no guarda ni registra las coordenadas (viajan en el cuerpo, no en la URL). `GEOCODER_ENABLED=0` la apaga, `GEOCODER_URL` apunta a un Nominatim propio. Ante cualquier fallo devuelve valores nulos y la app deja que el vecino escriba la calle.

---

## 💻 Desarrollo local

```bash
# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Ejecutar tests automatizados
npm run test

# Iniciar servidor en modo desarrollo con recarga automática
npm run dev
```

Con Docker Compose (desde la raíz del proyecto):
```bash
docker compose up --build
```
