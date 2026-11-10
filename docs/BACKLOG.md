# Trabajo pendiente de Radio Patio

Actualizado el 10 de noviembre de 2026 (tarde) para quien retome el proyecto, persona o agente. Cada tarea es independiente y dice qué tocar y cómo saber que está hecha. Antes de empezar lee `AGENTS.md` y `app/AGENTS.md`.

Reglas que valen para todas:

- Las dependencias viven dentro de los contenedores. Ejecuta las comprobaciones ahí: `docker compose exec -T server sh -c 'npm run build && npm test && npm run check:parity'` y `docker compose exec -T app sh -c 'npx tsc --noEmit && npm test'`.
- Si cambias el código del servidor y el contenedor de desarrollo no lo recarga (`tsx watch` a veces se queda sin ver los ficheros nuevos), reinícialo con `docker compose restart server`.
- `server/src/db/schema.ts` y `schema.sql` deben quedar idénticos.
- Commits convencionales. No hagas push a `main` ni despliegues sin que el dueño lo pida.
- El catálogo de categorías está repetido en cinco sitios (servidor: `routes/categories.ts`, `types/index.ts`, el enum de `routes/incidents.ts`; app: `data/categories.ts`, `data/types.ts`) y en las páginas `landing/a.html` y `landing/balance.html`. Si tocas uno, toca todos.

## Estado de las ramas

| Rama | Contiene | Estado |
|---|---|---|
| `main` | Notificaciones, categorías de emergencias, recuento diario, chat, fotos, compartir, recibos de Expo, episodios y balance, privacidad | Desplegado en el servidor (`43ad6d5`) |
| `trust-lifetimes` | Duración por tipo, «¿sigue ahí?» y «resuelto», umbral de verificación único (3), cuarentena sin emergencias, nivel de zona solo con seguridad, borradores de episodio | Probado (108 tests de servidor, 63 de app). Sin fusionar ni desplegar |
| `redesign-ui` | Rediseño visual claro de la app y `versionCode` 15 (sin lo de `trust-lifetimes`) | Probado en navegador a 360 px. Sin probar en un móvil |

Orden recomendado: fusionar `trust-lifetimes` en `main`, desplegar el servidor y copiar la web; después fusionar `main` en `redesign-ui` (conflictos previsibles en `IncidentDetailScreen.tsx`, `ReportScreen.tsx`, `HelpScreen.tsx` y los estilos: en esa rama cada `fontWeight` es una `fontFamily` de Plus Jakarta) y probarla en Android.

## Hecho en `trust-lifetimes` (para revisar)

- **Duración por tipo** (`server/src/lib/lifetime.ts`, `expires_at`): de 12 horas (incendio, ruido) a 7 días (farolas, asfalto, limpieza, objeto perdido, derrumbe, calle cortada). Un aviso caducado deja de servirse antes de purgarse. Las coordenadas exactas se borran a las 72 h aunque el aviso siga.
- **«¿Sigue ahí?»** (`POST /api/incidents/:id/still-there`): en la segunda mitad de su vida, un vecino distinto del autor amplía el aviso la mitad de su duración (una vez por cuenta, tope de 3 veces la duración). Con `VERIFIED_AT` vecinos que dicen «ya no está» (y más que los que dicen que sigue) se cierra.
- **«Ya está resuelto»** (`POST /api/incidents/:id/resolve`): solo el autor; desaparece a las 2 horas.
- **Umbral de verificación único** (`VERIFIED_AT`, 3 por defecto): servidor, estadísticas, notificaciones y app lo leen de `GET /api/config`. Antes estaba escrito a mano en unos 12 sitios.
- **Cuarentena de ráfagas**: las emergencias quedan exentas, y se quita el código que intentaba liberar un aviso «con 2 confirmaciones», que no podía ejecutarse porque un aviso en cuarentena es invisible y nadie puede confirmarlo.
- **Nivel de zona**: una sola escala para la tarjeta y el mapa (menos de 1 tranquilo, de 1 a 3 moderado, de 3 a 6 atención, 6 o más alerta) y solo cuentan los avisos de seguridad de las últimas 72 h. Una agresión verificada ya es «atención».
- **Borradores de episodio**: el servidor propone un episodio privado ante un pico de avisos de emergencias; un moderador lo publica (`docs/EPISODIOS.md`).
- Todos los textos que decían «72 horas» o «2 vecinos» (app, web, README, docs).

## Tareas del dueño

- Fusionar `trust-lifetimes` en `main` y desplegar el servidor. La migración añade `expires_at`, `resolved_at`, la tabla `incident_presence_votes` y las columnas de borrador de `episodes`; los avisos existentes conservan 72 h.
- Copiar la web a producción: `ssh myrmo-prod 'cd ~/radiopatio && git pull --ff-only -q && cp landing/*.html ~/ops-proxy/radiopatio/'`.
- Opcional: poner `ADMIN_WEBHOOK_URL` en `deploy/.env` para que te llegue el aviso de cada borrador de episodio, y ajustar `VERIFIED_AT`, `EPISODE_MIN_NOTICES` y `EPISODE_MIN_CONFIRMED` si hace falta.
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

### 3. Preguntar «¿sigue ahí?» sin que abran el aviso
Hoy la pregunta solo sale dentro del detalle del aviso. Lo natural, como en las apps de tráfico, es preguntarlo al pasar cerca: al abrir la app con la ubicación, si hay a menos de 400 m un aviso en su segunda mitad de vida que el usuario no ha respondido (`shouldAskPresence` en `app/src/lib/lifetime.ts`), mostrar una tarjeta con los dos botones. Una notificación push para esto exigiría saber dónde está el vecino a todas horas, y no se hace.

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
