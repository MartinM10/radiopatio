# Análisis normativo (España / UE) — borrador, no es asesoramiento jurídico

> Hecho a partir de una investigación preliminar. Antes de un lanzamiento público, **debe revisarlo un abogado** especializado en protección de datos y servicios digitales. Los puntos marcados con (*) no se han verificado en fuente primaria.

## Panorama existente

- **AlertCops** (Ministerio del Interior): app oficial para alertar a Policía Nacional y Guardia Civil, con geolocalización, chat y servicio «Guardián». Es un canal hacia la policía, no un mapa comunitario.
- **Citizen** (EE. UU.): mapa de incidentes en tiempo real. Documentados: pánico, desinformación y comentarios racistas.
- No se encontró una app ciudadana equivalente en España (búsqueda limitada).

## Riesgos y cómo los trata el diseño

| Riesgo | Norma | Mitigación en el prototipo |
|---|---|---|
| Tratar datos sobre infracciones penales sin habilitación legal | RGPD art. 10, LOPDGDD art. 10 (la AEPD ha sancionado esto con 2 M€) | No hay datos de personas: sin nombres, sin cuentas, filtro de texto, solo hechos y zona aproximada |
| Ubicación = dato personal | RGPD | Celdas hexagonales de ~450 m derivadas en el servidor: la API devuelve el centro de la celda, **nunca el GPS exacto** (ni siquiera al propio autor) |
| Difamación, injurias, calumnias | Código Penal arts. 205-210 (*) | Filtro de identificación, botón de denuncia de abuso, aviso de «solo lo que has visto» |
| Odio / discriminación | CP art. 510 (*) | Filtro de descriptores por origen/etnia; moderación |
| Denuncias falsas / pánico | CP art. 456 (*) | Etiqueta «sin confirmar», confirmación vecinal, caducidad 72 h |
| Manipulación de estadísticas de un barrio (ataque Sybil, fines especulativos) | DSA (abusos de plataforma), CP art. 456 (*) | Plan de pseudonimato y confianza progresiva: docs/TRUST.md. En el prototipo ya hay esquema v2 con pseudónimos, deduplicación y pesos de confianza |
| Responsabilidad de la plataforma por contenido de usuarios | Reglamento (UE) 2022/2065 (DSA), LSSI (*) | Canal de notificación y retirada, política de moderación (pendiente en backend) |
| Confusión con un servicio de emergencias | — | Banner «Llama al 112», aviso de que no es una denuncia |

## Pseudonimato: cuentas pseudónimas (decisión de diseño para el lanzamiento)

El plan de producción (docs/TRUST.md) sustituye el anonimato total del
prototipo por **pseudonimato**: cuenta obligatoria para publicar (Google o
verificación por SMS), anonimato completo ante el público. Consecuencias
normativas que debe revisar el abogado:

1. **El hash sigue siendo dato personal.** Guardar un hash salado del ID de
   Google o del teléfono **no** anonimiza: el RGPD (considerando 26) trata
   los datos pseudonimizados como personales mientras exista cualquier medio
   razonable de reidentificación. El tratamiento de cuentas debe estar
   amparado por una base jurídica (interés legítimo o ejecución del
   servicio), documentada en la política de privacidad.
2. **Minimización**: guardar solo el hash + fecha de alta + historial de
   fiabilidad. No pedir nombre, ni avatar, ni exponer email en ninguna API
   pública; si se recupera el email de Google, su retención debe
   justificarse o evitarse.
3. **Derechos RGPD**: con cuentas existen derechos de acceso, supresión y
   oposición. La supresión debe diseñarse: disociar el pseudónimo del
   contenido histórico puede ser más razonable que borrar los avisos, que
   son «hechos» y no datos personales (*).
4. **Trazabilidad (LSSI art. 12 / Ley 25/2007 (*))**: los prestadores de
   alojamiento de datos deben poder identificar el origen de los datos
   alojados y el momento de la prestación, a disposición judicial. El
   anonimato radical del prototipo dificulta cumplirlo; el pseudonimato con
   `identity_hash` y registro de alta lo resuelve. Nota: la Ley 25/2007
   transpuso la Directiva 2006/24, anulada por el TJUE (Tele2/Watson), y su
   alcance real para servicios de alojamiento está discutido (*).
5. **DSA**: con cuentas llegan deberes reforzados de moderación (condiciones
   claras, recursos, informes de transparencia) y la posibilidad de suspender
   cuentas — ya prevista en docs/TRUST.md §3.
6. **EIPD**: cualquier cambio hacia cuentas obligatorias exige actualizar la
   evaluación de impacto (vectores nuevos: vinculación de avisos con
   identidad, fuga de la tabla de hashes).

Coordenadas y dispositivo en el backend actual:

- El GPS se recoge con consentimiento y **no sale de la base de datos**: la
  API devuelve únicamente el centro de la celda hexagonal (~450 m). También
  el `address` opcional es dato aportado por el vecino y depende del
  cuidado en no identificar a terceros (el filtro de texto no lo excluye;
  revisar en la EIPD — (*)).
- La identidad es un **token de dispositivo emitido por el servidor**, del
  que solo se guarda el hash; las escrituras sin token se rechazan. Las
  cuentas verificadas con Google guardan un **HMAC con secreto** del `sub`
  (nunca email ni nombre). Ambos siguen siendo datos personales
  pseudonimizados (considerando 26): ninguno se traslada a una API pública.
- Para limitar altas por IP se usa la IP de la petición en memoria, sin
  guardarla en la base de datos.

La publicación restringida por geografía (TRUST.md §3, capa 2) usa
geolocalización con consentimiento: dato personal con base jurídica propia,
minimización (se comprueba la celda, no se guarda) y explicación clara en la
primera ejecución.

## Pendiente antes de lanzar

1. **Responsable del tratamiento**: si lo opera un particular/empresa, evitar cualquier dato personal. Si lo operase una administración, aplicaría la normativa de la Directiva (UE) 2016/680 (LO 7/2021 (*)).
2. Decidir el modelo de acceso definitivo (anonimato total vs. pseudonimato con cuentas) y su base jurídica; ver docs/TRUST.md.
3. Evaluación de impacto (EIPD/DPIA), registro de actividades y política de privacidad.
3. Términos de uso, política de moderación y canal de retirada de contenidos (DSA).
4. Moderación efectiva en backend, límites de uso (anti-spam) y conservación mínima.
5. Revisión de las políticas de App Store y Google Play sobre contenido generado por usuarios.
6. Posible convenio con ayuntamiento/policía local si se quiere enviar avisos a las autoridades.
