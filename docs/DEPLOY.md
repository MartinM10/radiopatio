# Despliegue en producción (VPS)

Guía corta para levantar Alerta Vecinal en un servidor (Oracle Cloud Free Tier u otro),
conviviendo con otros servicios (p. ej. la colonia Myrmo).

## 0. Prerrequisitos

- VPS con Docker + Docker Compose instalados (Linux).
- Un dominio (ej. `api.tudominio.es`) con registro A apuntando a la IP del VPS.
- Puertos 80 y 443 abiertos en el firewall del proveedor (Oracle Cloud →
  **Security Lists → Ingress** para 0.0.0.0/0 en 80 y 443). Cerrar el 5432.
- La app móvil ya construida con `EXPO_PUBLIC_API_URL=https://api.tudominio.es` (ver §6).

## 1. Levantar la stack

```bash
cd deploy
cp .env.example .env
# Generar secretos:
#   openssl rand -hex 32  -> DEVICE_SALT
#   openssl rand -hex 32  -> ADMIN_TOKEN
#   openssl rand -hex 32  -> POSTGRES_PASSWORD
# Editar .env y poner SITE_DOMAIN, ACME_EMAIL y los secretos.
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

- `db`: PostgreSQL 16 sin puertos publicados; volumen `pgdata`.
- `server`: Fastify + migraciones/seed; seed solo si la BD está vacía y `NODE_ENV != production`.
- `caddy`: TLS automático con Let's Encrypt y cabeceras de seguridad.
- `backup` (perfil `backups`): pg_dump diario con retención configurable.

Verificar: `curl https://api.tudominio.es/health` → `{"status":"ok","database":"connected"}`.

## 2. Backups y restauración

- Los dumps diarios viven en el volumen `backups` y se listan con `docker compose ... logs backup`.
- **Copia fuera del servidor al menos una vez a la semana** (rsync/S3/B2): si el disco del
  VPS muere, los volúmenes mueren con él.
- Restaurar:
  ```bash
  docker exec -i $(docker compose -f docker-compose.prod.yml --env-file .env ps -q db) \
    pg_restore -U radiopatio -d radiopatio --clean --if-exists < dump.dump
  ```

## 3. Actualizar la aplicación

```bash
cd /ruta/radio-patio
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build server
# el job de purga y las migraciones se aplican al arrancar
```

La app móvil se actualiza con EAS (build + submit). El backend cambia sin tocar las apps
instaladas salvo en `EXPO_PUBLIC_API_URL` (fijada en tiempo de build).

## 4. Convivencia con Myrmo u otros stacks

- El compose se llama `alerta-vecinal-prod`: los volúmenes y redes están aislados.
- Si el 80/443 ya están ocupados, cambia `HTTP_BIND`/`HTTPS_BIND` en `.env` (p. ej.
  `HTTP_BIND=0.0.0.0:8080`) y pon Alerta detrás del mismo reverse proxy de Myrmo.
- Los límites de memoria (2 GB para PG, 1 GB para la API, 192 MB para Caddy) dejan margen
  al resto del VPS. Oracle Free Tier (4 vCPU / 24 GB) no supone problema, pero vigila
  `df -h` y los logs de Docker (`docker system df`).
- Si prefieres independencia total, Oracle permite crear otra instancia Always Free (hasta 4
  en total) con su propio disco; es la opción más limpia.

## 5. Seguridad mínima

- Cierra el firewall a todo salvo 22, 80 y 443.
- Rota `DEVICE_SALT` y `ADMIN_TOKEN` si alguna vez se filtraron; no los pongas en el repo.
- `NODE_ENV=production` evita que se siembren avisos de demostración.
- La cola de moderación se consulta con `x-admin-token`; no la expongas fuera del servidor.
- Los avisos caducados se purgan físicamente cada 15 min: los datos no se acumulan.

## 6. App móvil: construir el APK/AAB con EAS

1. Actualiza `app/eas.json` → `EXPO_PUBLIC_API_URL` con la URL pública HTTPS.
2. Entra en Expo (`npx eas-cli login`) y lanza:
   ```powershell
   cd app
   npx eas-cli build -p android --profile preview   # APK firmada, enlace descargable en expo.dev
   npx eas-cli build -p android --profile production # AAB para Play Store
   ```
3. El primer build tarda ~10-20 min en la cola gratuita; el enlace queda en expo.dev.

## 7. Monetización y licencia (recordatorio)

AGPL-3.0-or-later (ver LICENSE). El plan de sostenibilidad y la regla «nunca se
monetizan los datos del barrio» están en `docs/OPEN-SOURCE.md`. Los agregados que se
ofrezcan a cualquier cliente (incluido un ayuntamiento) deben seguir las reglas de
`docs/TRUST.md` §3: solo confirmados, muestra mínima, celdas aproximadas, caducidad 72 h.
