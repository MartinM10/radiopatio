# Trabajo pendiente de Radio Patio

Actualizado el 10 de noviembre de 2026 para quien retome el proyecto, persona o agente. Cada tarea es independiente y dice qué tocar y cómo saber que está hecha. Antes de empezar lee `AGENTS.md` y `app/AGENTS.md`.

Reglas que valen para todas:

- Las dependencias viven dentro de los contenedores. Ejecuta las comprobaciones ahí: `docker compose exec -T server sh -c 'npm run build && npm test && npm run check:parity'` y `docker compose exec -T app sh -c 'npx tsc --noEmit && npm test'`.
- Si cambias el código del servidor y el contenedor de desarrollo no lo recarga (`tsx watch` a veces se queda sin ver los ficheros nuevos), reinícialo con `docker compose restart server`.
- `server/src/db/schema.ts` y `schema.sql` deben quedar idénticos.
- Commits convencionales. No hagas push a `main` ni despliegues sin que el dueño lo pida.
- El catálogo de categorías está repetido en cinco sitios (servidor: `routes/categories.ts`, `types/index.ts`, el enum de `routes/incidents.ts`; app: `data/categories.ts`, `data/types.ts`) y en las páginas `landing/a.html` y `landing/balance.html`. Si tocas uno, toca todos.

## Estado de las ramas

| Rama | Contiene | Estado |
|---|---|---|
| `main` (`1e87960`) | Notificaciones, categorías de emergencias, recuento diario, chat, fotos, compartir | Desplegado en el servidor |
| `backlog-server` | Recibos de Expo, estadísticas y episodios, numeración del chat, borrado de mensajes al borrar la identidad, balance de daños, política de privacidad, arreglo del margen móvil de la web | Probado (91 tests de servidor, 49 de app). Sin fusionar ni desplegar |
| `redesign-ui` | Rediseño visual claro de la app, más todo lo de `backlog-server` | Probado en navegador a 360 px. Sin probar en un móvil |

Orden recomendado: fusionar `backlog-server` en `main`, desplegar el servidor y copiar la web; después probar `redesign-ui` en Android y fusionarla.

## Hecho en `backlog-server` (para revisar)

- **Recibos de Expo** (`server/src/lib/notify.ts`): los tickets se guardan y sus recibos se leen a los 15 minutos; los errores se registran sin el token, `DeviceNotRegistered` borra el token y `pushStats` cuenta aciertos y fallos. Todo el envío pasa por `sendPush`.
- **Estadísticas y episodios** (`server/src/routes/stats.ts`, `lib/stats.ts`): `GET /api/stats/daily`, `/api/stats/municipalities`, `/api/episodes`, `/api/episodes/:slug` y, con token de administración, `POST` y `DELETE /api/admin/episodes`. El balance une lo purgado con lo activo. Guía en `docs/EPISODIOS.md`.
- **Balance de daños** (`landing/balance.html`): lista de episodios y detalle por categoría y por día, con el aviso de que son datos de vecinos y no oficiales.
- **Chat**: cada mensaje lleva `fromAuthor` y `participant`, y la app muestra «Tú», «Autor del aviso» o «Vecino N».
- **Fallo de privacidad corregido**: `deleteDeviceData` no borraba los mensajes escritos en avisos de otros.
- **Política y Términos** (`landing/privacidad.html`, `eliminar-cuenta.html`, `terminos.html`): fotos, chat, balance público y Cloudflare como tercero.
- **Web**: el contenido de todas las páginas tocaba el borde de la pantalla en móvil (`.content-box` anulaba el margen de `.container`).
- **Tests**: `security.test.ts` fallaba 1 de cada 6 ejecuciones porque sus celdas aleatorias colisionaban en la base de desarrollo; la caja es ahora 36 veces mayor.

## Tareas del dueño

- Fusionar `backlog-server` en `main` y desplegar el servidor. La migración añade la tabla `episodes`.
- Copiar la web a producción: `ssh myrmo-prod 'cp ~/radiopatio/landing/*.html ~/ops-proxy/radiopatio/'`. Hasta entonces el pie sigue con el icono antiguo, los enlaces compartidos llevan a la portada y la política no menciona fotos ni chat.
- Actualizar el formulario de Seguridad de los datos de Play: **fotos** (recogidas, funcionalidad de la aplicación, opcionales) y **mensajes** (contenido generado por el usuario). Ver `docs/LEGAL.md`.
- Subir `versionCode` y lanzar la build `preview` desde `redesign-ui` para probar el rediseño en un móvil.
- Revocar la clave de Myrmo y el token de Expo que quedaron escritos en el chat de la sesión.
- Comprobar el acuerdo de tratamiento de datos con Expo y con Cloudflare por las transferencias a EE. UU.
- Borrar las copias de seguridad previas a cada despliegue en `myrmo-prod` (`~/radiopatio-pre-*.dump`) cuando todo esté estable.
- Decidir si quiere el despliegue automático (tarea 1) y, si es así, crear la clave SSH restringida.

## Pendiente

### 1. Despliegue automático
Hoy el push a `main` solo lanza los tests. El servidor se despliega a mano por SSH y la web copiando ficheros.

- **Qué hacer:** un job de GitHub Actions tras el CI en `main` que entre por SSH en `myrmo-prod` y ejecute, en `~/radiopatio/deploy`, `git pull --ff-only`, `docker compose -f docker-compose.prod.yml --env-file .env up -d --build server` y la copia de `landing/` a `~/ops-proxy/radiopatio/`.
- **Condiciones:** una clave SSH nueva y restringida a ese comando, guardada como secreto del repo. No reutilizar la del dueño. No tocar el proyecto `myrmo` ni `ops-proxy`, que comparten máquina.
- **Bloqueado por:** la decisión del dueño y la clave.

### 2. Abrir la app desde un enlace compartido
`https://radiopatio.app/a.html?id=…` abre el navegador aunque la app esté instalada.

- **Qué hacer:** Android App Links. Servir `/.well-known/assetlinks.json` desde la web con la huella SHA-256 del certificado de firma (la de Play App Signing), añadir `intentFilters` con `autoVerify` en `app/app.json` y resolver el enlace en `App.tsx` con `Linking` para abrir el detalle. Si el aviso no está en la lista local, pedirlo con `GET /api/incidents/:id`.
- **Bloqueado por:** la huella del certificado, que solo se ve en Play Console.

### 3. Avisos de larga duración
Una calle cortada por obras dura semanas y el aviso caduca a las 72 h. El dueño decidió dejarlo así por ahora. Si cambia de idea: fecha de fin opcional solo en `calle_cortada`, con un máximo de 30 días.

### 4. Vista previa del enlace compartido
`landing/a.html` carga el aviso con JavaScript, así que WhatsApp no muestra una tarjeta al pegar el enlace. Para tenerla, el servidor tendría que devolver la página con etiquetas Open Graph (`og:title`, `og:description`) y pedirle a Caddy que enrute `a.html` hacia el servidor. Toca `~/ops-proxy/Caddyfile` en `myrmo-prod`, que comparte máquina con Myrmo: es decisión del dueño.

### 5. Web alineada con la app
Cuando el rediseño de la app esté fusionado, llevar a la web la misma paleta clara (índigo para acciones, coral para avisar) y los mismos colores de categoría.

### 6. Modo oscuro de la app
El rediseño es claro. Un modo oscuro pediría duplicar los tokens de `app/src/theme.ts` según `useColorScheme()` y unas teselas de mapa oscuras, que dependen de un proveedor externo y habría que declarar en la política.

### 7. Moderación de fotos
Hoy la única barrera es limitar las categorías que admiten foto y el botón de denunciar. Si llegan fotos de personas, estudiar una detección de caras en el servidor antes de guardar.

### 8. Calidad del código
- La app no tiene configuración de ESLint aunque `app/AGENTS.md` pide pasar el lint.
- En `IncidentDetailScreen.tsx` la rama `incident.status === 'hidden'` («Recurrir ocultación») no se alcanza nunca: la lista solo devuelve avisos activos, así que un autor no ve sus avisos ocultados. Para que el recurso tenga sentido hace falta un endpoint con los avisos propios ocultados.
- `npm audit` avisa de vulnerabilidades en Fastify 4 y zod. Subir a Fastify 5 es un cambio mayor: hacerlo en una rama con todos los tests.
- Los recibos de Expo se guardan en memoria: si el servidor se reinicia se pierden los pendientes (solo sirven para ver fallos).
