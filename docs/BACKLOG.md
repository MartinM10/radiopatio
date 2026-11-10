# Trabajo pendiente de Radio Patio

Escrito el 10 de noviembre de 2026 para quien retome el proyecto, persona o agente. Cada tarea es independiente y dice qué tocar y cómo saber que está hecha. Antes de empezar lee `AGENTS.md` y `app/AGENTS.md`.

Reglas que valen para todas:

- Las dependencias viven dentro de los contenedores. Ejecuta las comprobaciones ahí: `docker compose exec -T server sh -c 'npm run build && npm test && npm run check:parity'` y `docker compose exec -T app sh -c 'npx tsc --noEmit && npm test'`.
- `server/src/db/schema.ts` y `schema.sql` deben quedar idénticos.
- Commits convencionales. No hagas push ni despliegues sin que el dueño lo pida.
- El catálogo de categorías está repetido en cinco sitios (servidor: `routes/categories.ts`, `types/index.ts`, el enum de `routes/incidents.ts`; app: `data/categories.ts`, `data/types.ts`) y en `landing/a.html`. Si tocas uno, toca todos.

## Estado

- `main` (`1e87960`) está desplegado en el servidor: notificaciones, categorías de emergencias, recuento diario, chat, fotos y enlace para compartir.
- La rama `redesign-ui` lleva el rediseño visual de la app. No está fusionada ni probada en un móvil.
- En Play hay una prueba cerrada con la 1.5.0 (14), que no incluye chat, fotos, compartir ni el rediseño.

## Prioridad alta

### 1. Política de privacidad: fotos y chat
El servidor ya guarda fotos y mensajes y la política no los menciona.

- **Qué tocar:** `landing/privacidad.html` y `landing/eliminar-cuenta.html`.
- **Qué añadir:** la foto opcional (se recomprime en el servidor y se le quitan los metadatos, se guarda con el aviso y se borra con él a las 72 h); los mensajes del chat (anónimos, pasan el filtro de datos personales, se borran con el aviso); que el texto de un mensaje viaja por Expo y Firebase dentro de la notificación; que ambos se eliminan al borrar la identidad. Añade Cloudflare como tercero, porque web y API pasan por él. Actualiza la fecha.
- **Hecho cuando:** el texto coincide con `server/src/lib/photo.ts`, `routes/messages.ts` y `db/purge.ts`.
- **Después:** el dueño copia los ficheros a `~/ops-proxy/radiopatio/` en `myrmo-prod` y actualiza el formulario de Seguridad de los datos de Play (fotos y mensajes).

### 2. Probar el rediseño en Android y fusionarlo
- **Qué hacer:** subir `android.versionCode` a 15 en `app/app.json`, lanzar una build `preview` desde `redesign-ui` y revisar en un móvil: que la fuente carga, que ningún texto se corta, que los paneles flotantes no tapan el mapa y que la barra inferior respeta los gestos del sistema.
- **Riesgo conocido:** cada peso de Plus Jakarta Sans es una familia propia (`font` en `app/src/theme.ts`). No combines `fontFamily` con `fontWeight`: Android engorda la letra.
- **Hecho cuando:** el dueño da el visto bueno y la rama se fusiona en `main`.

### 3. Leer los recibos de Expo
El servidor solo reacciona a `DeviceNotRegistered` en el ticket. Un fallo de FCM pasa sin dejar rastro.

- **Qué tocar:** `server/src/lib/notify.ts`. Guardar los ids de ticket y consultar `https://exp.host/--/api/v2/push/getReceipts` unos minutos después (un temporizador en memoria basta). Registrar los errores con `console.error` sin imprimir el token, y anular `push_token` si el recibo dice `DeviceNotRegistered`.
- **Hecho cuando:** hay un test con un emisor falso que devuelve un recibo con error y comprueba que se registra y que el token se anula.

## Prioridad media

### 4. Despliegue automático
Hoy el push a `main` solo lanza los tests. El servidor se despliega a mano por SSH y la web copiando ficheros.

- **Qué hacer:** un job de GitHub Actions tras el CI en `main` que entre por SSH en `myrmo-prod` y ejecute, en `~/radiopatio/deploy`, `git pull --ff-only`, `docker compose -f docker-compose.prod.yml --env-file .env up -d --build server` y la copia de `landing/` a `~/ops-proxy/radiopatio/`.
- **Condiciones:** una clave SSH nueva y restringida a ese comando, guardada como secreto del repo. No reutilizar la del dueño. No tocar el proyecto `myrmo` ni `ops-proxy`, que comparten máquina.
- **Decisión del dueño:** si quiere esto o prefiere seguir a mano.

### 5. Abrir la app desde un enlace compartido
`https://radiopatio.app/a.html?id=…` abre el navegador aunque la app esté instalada.

- **Qué hacer:** Android App Links. Servir `/.well-known/assetlinks.json` desde la web con la huella del certificado de firma (la de Play App Signing), añadir `intentFilters` con `autoVerify` en `app/app.json` y resolver el enlace en `App.tsx` con `Linking` para abrir el detalle. Si el aviso no está en la lista local, pedirlo con `GET /api/incidents/:id`.
- **Hecho cuando:** al tocar un enlace en un móvil con la app instalada se abre el detalle de ese aviso.

### 6. Episodios y página de balance
La idea del dueño: saber cuántos daños hubo tras un temporal o un terremoto. Los recuentos ya se guardan en `incident_daily_counts` (día, municipio, categoría, total, confirmados, verificados), pero nada los lee.

- **Qué hacer:** un endpoint público `GET /api/stats/daily?from=&to=&municipality=` y una tabla `episodes` (nombre, municipios, fecha de inicio y de fin) que crea un moderador con el token de administración. Una página en la web que muestre el balance de un episodio con las cifras confirmadas aparte y el aviso "avisos de vecinos, no verificados por autoridades".
- **No hacer:** detección automática de episodios, ni una categoría "terremoto".

### 7. Numerar a los vecinos del chat
Con tres o más participantes, todos los ajenos aparecen como "Un vecino".

- **Qué hacer:** que `GET /api/incidents/:id/messages` devuelva un número por participante según el orden en que escribió por primera vez en ese aviso ("Vecino 1", "Vecino 2"), y "Autor" para quien publicó. Sin exponer `device_hash`.

### 8. Avisos de larga duración
Una calle cortada por obras dura semanas y el aviso caduca a las 72 h. El dueño decidió dejarlo así por ahora. Si cambia de idea: fecha de fin opcional solo en `calle_cortada`, con un máximo de 30 días.

## Prioridad baja

### 9. Limpieza de código
- `app/src/screens/IncidentDetailScreen.tsx` conserva estilos sin uso tras el rediseño (`header`, `back`, `headerTitle`, `pillOk`, `secondary`, `secondaryText`). El bloque `header` solo se usa cuando el aviso ya no existe.
- La rama `incident.status === 'hidden'` del detalle nunca se cumple, porque la lista solo devuelve avisos activos. O se elimina, o se añade un endpoint con los avisos propios ocultados.
- La app no tiene configuración de ESLint aunque `app/AGENTS.md` pide pasar el lint.
- `npm audit` avisa de vulnerabilidades en Fastify 4 y zod. Subir a Fastify 5 es un cambio mayor: hacerlo en una rama con todos los tests.

### 10. Web
- El botón de descarga dice "Google Play (Próximamente)". Cambiarlo en `landing/index.html` y `landing/a.html` cuando la app esté en producción.
- Unificar el estilo de la web con el de la app rediseñada (misma paleta clara y mismos colores de categoría).
- `landing/a.html` no tiene vista previa al pegar el enlace en WhatsApp, porque el contenido se carga con JavaScript. Para tenerla, el servidor tendría que generar la página con las etiquetas Open Graph.

### 11. Modo oscuro de la app
El rediseño es claro. Un modo oscuro pediría duplicar los tokens de `app/src/theme.ts` según `useColorScheme()` y unas teselas de mapa oscuras, que dependen de un proveedor externo y habría que declarar en la política.

### 12. Moderación de fotos
Hoy la única barrera es limitar las categorías que admiten foto y el botón de denunciar. Si llegan fotos de personas, estudiar una detección de caras en el servidor antes de guardar.

## Tareas del dueño

- Copiar la web a producción: `ssh myrmo-prod 'cp ~/radiopatio/landing/index.html ~/radiopatio/landing/a.html ~/ops-proxy/radiopatio/'`. Hasta entonces el pie sigue con el icono antiguo y los enlaces compartidos llevan a la portada.
- Revocar la clave de Myrmo y el token de Expo que quedaron escritos en el chat de la sesión.
- Comprobar el acuerdo de tratamiento de datos con Expo por las transferencias a EE. UU.
- Borrar las copias de seguridad previas a cada despliegue en `myrmo-prod` (`~/radiopatio-pre-*.dump`) cuando todo esté estable.
