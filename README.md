# Alerta Vecinal

App móvil (React Native + Expo) para que los vecinos avisen de forma **anónima** de incidencias de seguridad en su barrio: robos, hurtos, agresiones, vandalismo… Con backend propio (Docker, Fastify + PostgreSQL) y una capa de **calidad del dato de principio a fin**.

## Arquitectura

- **`app/`**: App móvil (React Native + Expo), mapa OpenStreetMap con grid hexagonal de ~450 m, feed y creación de avisos con validaciones en cliente.
- **`server/`**: API REST en Node.js + TypeScript (Fastify) conectada a PostgreSQL, con filtro de privacidad, moderación comunitaria (DSA) y control anti-abuso sin datos personales (RGPD). El servidor revalida las mismas reglas de calidad que el cliente y **deriva la celda hexagonal en servidor**: la API devuelve el centro de la celda, nunca las coordenadas exactas del vecino.
- **`db`**: Base de datos PostgreSQL con migraciones automáticas, caducidad de avisos a las 72 h y **purga física** periódica (minimización RGPD).

## Probarla (Docker Compose)

1. Arranca Docker Desktop.
2. Averigua la IP de tu PC en la red local (p. ej. `ipconfig` en Windows o `ip a` en Linux) y lanza:
   ```powershell
   $env:HOST_IP = "<IP-de-tu-PC>"   # p. ej. la IPv4 de ipconfig
   docker compose up --build
   ```
   Esto levantará automáticamente:
   - **Base de datos PostgreSQL**: puerto 5432
   - **Backend API (Fastify)**: puerto 3000 (`http://localhost:3000/health`)
   - **App móvil (Expo)**: puertos 8081 y 19000-19001
3. Instala **Expo Go** en el móvil (misma wifi que el PC) y escanea el QR que aparece en los logs.
   Si no conecta, abre en el firewall los puertos 8081, 3000 y 19000-19001.

Comprobaciones dentro del contenedor (-T cuando no hay TTY interactiva):

```powershell
# Typecheck de la app móvil
docker compose run --rm -T app npx tsc --noEmit

# Tests de reglas de calidad del dato (cliente)
docker compose run --rm -T app npm test

# Tests del backend (29 + paridad de esquema + limitador; requieren el servicio db)
docker compose run --rm -T server sh -c "npm run build && npm test && npm run check:parity && npm run check:ratelimit"
```

## Qué incluye

- **Mapa del barrio** (OpenStreetMap) con grid hexagonal de ~450 m, mapa de calor por celdas y nivel de alerta de tu zona.
- **Avisos**: lista cronológica. Los vecinos pueden *confirmar* («yo también lo vi») o *denunciar* un aviso inadecuado.
- **Nuevo aviso en 2 pasos**: categoría → zona (GPS/ubicación con consentimiento) → descripción. Filtro automático de privacidad en cliente y servidor (teléfonos, matrículas e IBAN, DNI/NIE, tarjetas, enlaces, descripciones por origen/etnia, llamadas a la violencia).
- **Calidad del dato de principio a fin**: revalidación server-side con las reglas del cliente, deduplicación semántica entre cuentas (mismo aviso se *confirma*, no se repite), hueco mínimo y anti-spam por dispositivo, caché local saneada contra JSON corrupto, purga de los caducados y estadística de zona que **solo cuenta avisos confirmados** y exige muestra mínima. Ver [docs/DATA-QUALITY.md](docs/DATA-QUALITY.md).
- **Anonimato público, pseudonimato privado**: la API jamás devuelve autoría ni coordenadas exactas; los pseudónimos de dispositivo solo viven en el servidor. Plan de defensas anti-manipulación: [docs/TRUST.md](docs/TRUST.md).
- **Ayuda**: 112, 091, 062, 016, normas de la comunidad y privacidad.

## Decisiones de diseño (privacidad y seguridad)

- Sin cuentas ni datos personales. La ubicación se guarda en **celdas hexagonales de ~450 m**: la API devuelve el centro de la celda, nunca el GPS exacto.
- Los avisos **caducan a las 72 h** y se purgan de la base de datos. Aparecen como «sin confirmar» hasta tener 2 confirmaciones vecinales, y en métricas agregadas pesan la mitad que los confirmados.
- **No se registran personas** (ni identidades, ni antecedentes, ni procesos judiciales): solo hechos y zonas.
- Los dispositivos se diferencian en servidor mediante un **hash SHA-256 + salt** del identificador de dispositivo que envía la app; si el cliente no lo envúa, se usa la IP en forma de hash (dato pseudonimizado, ver docs/LEGAL.md).
- Moderación comunitaria conforme a la DSA: avisos con 3 denuncias se ocultan automáticamente y pasan a la **cola de moderación con auditoría** (`/api/admin/moderation`, protected con `x-admin-token`).
- La app **no sustituye al 112 ni a la denuncia formal** y lo dice en cada punto relevante.

Ver [docs/LEGAL.md](docs/LEGAL.md) para el análisis normativo, [docs/TRUST.md](docs/TRUST.md) para el modelo de confianza anti-manipulación, [docs/DATA-QUALITY.md](docs/DATA-QUALITY.md) para las reglas de calidad, [docs/OPEN-SOURCE.md](docs/OPEN-SOURCE.md) para licencia y sostenibilidad, y [server/README.md](server/README.md) para la documentación de la API.

## Licencia

**AGPL-3.0-or-later** (ver [LICENSE](LICENSE)).
