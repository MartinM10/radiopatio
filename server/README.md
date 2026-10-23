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
  - Header: `X-Device-Id: <identificador-anónimo>`.
  - Devuelve lista con `confirmations`, `confirmedByMe`, `flaggedByMe`, `mine`.
- `POST /api/incidents`: Publicar nuevo aviso.
  - Header: `X-Device-Id: <identificador-anónimo>`.
  - Body: `{ "category": "hurto", "zone": { "gx": 3, "gy": 4 }, "description": "..." }`.
  - Aplica filtro de privacidad y límite de 5 avisos/hora por dispositivo.
- `POST /api/incidents/:id/confirm`: Confirmar aviso («yo también lo vi»).
  - Header: `X-Device-Id: <identificador-anónimo>`.
  - Previene confirmar avisos propios o confirmar múltiples veces.
- `POST /api/incidents/:id/flag`: Marcar aviso como inadecuado / abuso.
  - Header: `X-Device-Id: <identificador-anónimo>`.
  - Aumenta el contador de denuncias; oculta automáticamente al alcanzar el umbral de moderación.

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
