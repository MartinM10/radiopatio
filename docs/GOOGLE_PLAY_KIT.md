# Kit Oficial de Publicación en Google Play — Radio Patio

Este documento contiene **absolutamente todos los textos, respuestas legales y configuraciones técnicas** que Google Play Console te solicitará durante el proceso de publicación de **Radio Patio**.

---

## 📧 1. Solución para los Correos (`hola@`, `privacidad@`, `moderacion@`)

No necesitas contratar un servidor de correo de pago. Cloudflare incluye **Email Routing 100% gratuito**:

1. Entra a tu panel de **Cloudflare** -> Selecciona el dominio `radiopatio.app`.
2. En el menú lateral izquierdo, haz clic en **Email Routing** (Enrutamiento de correo).
3. Pulsa **Get Started** y escribe tu correo personal real (por ejemplo, tu cuenta de Gmail).
4. Cloudflare te enviará un correo de verificación a tu Gmail para confirmar que eres el dueño. Haz clic en el enlace.
5. Crea las 3 reglas de reenvío (tardan 10 segundos):
   * `hola@radiopatio.app` -> Reenviar a tu Gmail.
   * `privacidad@radiopatio.app` -> Reenviar a tu Gmail.
   * `moderacion@radiopatio.app` -> Reenviar a tu Gmail.
6. Pulsa en **Add records automatically** para que Cloudflare añada los registros MX a tu DNS con 1 clic. ¡Listo! Cualquier correo que te envíen o que Google revise te llegará directo a tu bandeja de Gmail.

---

## 📝 2. Ficha de la App en Google Play Store (Copiar y Pegar)

### Título de la App (Máx. 30 caracteres)
```text
Radio Patio — Alerta Vecinal
```

### Descripción corta (Máx. 80 caracteres)
```text
Avisos vecinales en tiempo real, 100% anónimos y sin registros en tu barrio.
```

### Descripción completa (Texto optimizado para conversión y revisión de Google)
```markdown
Radio Patio es la primera red de información e incidencias vecinales en tiempo real diseñada bajo el principio de privacidad radical y colaboración ciudadana.

Sin registros. Sin pedirte tu número de teléfono. Sin cuentas de Google ni rastreadores publicitarios.

¿QUÉ PUEDES HACER EN RADIO PATIO?
• Enterarte al instante de cortes de suministro (agua, luz, gas o internet en tu bloque).
• Avisar de desperfectos urbanos (farolas fundidas, obras imprevistas, socavones).
• Reportar o localizar objetos perdidos en tu calle o parque.
• Conocer situaciones de alerta en tu zona gracias a los avisos de tus propios vecinos.

DISEÑADA PARA PROTEGER TU PRIVACIDAD (RGPD):
• 100% Anónimo: Tu identidad nunca queda expuesta. No creas cuenta ni compartes tu teléfono.
• Geometría Hexagonal (~450 m): Tu portal o vivienda jamás se publica. El servidor redondea matemáticamente las coordenadas a celdas hexagonales para proteger tu intimidad.
• Consenso Vecinal Obligatorio: Un aviso individual no genera alarmismo. Requiere al menos 2 confirmaciones independientes de vecinos cercanos para marcarse como verificado.
• Caducidad en 72 Horas: La información vive solo mientras es útil. Tras 72 horas, los avisos se purgan automáticamente de la base de datos para no devaluar barrios.
• Filtro Anti-Spam: Algoritmos automáticos contra publicaciones duplicadas y abusos coordinados.

AVISO IMPORTANTE DE EMERGENCIAS:
Radio Patio es una red ciudadana de convivencia y apoyo mutuo. NO es un canal de emergencias policiales. Ante delitos flagrantes, emergencias médicas o riesgo inminente, llama siempre al 112, 091 (Policía Nacional) o 062 (Guardia Civil).
```

### Categoría y Datos de Contacto
* **Categoría de la app**: `Estilo de vida` (o `Noticias y revistas` / `Herramientas`).
* **Etiquetas**: `Comunidad`, `Local`, `Utilidades`, `Seguridad`.
* **Correo de soporte**: `hola@radiopatio.app`
* **Sitio web**: `https://radiopatio.app`
* **Enlace a la Política de Privacidad**: `https://radiopatio.app/privacidad.html`

---

## 🛡️ 3. Cuestionario de Seguridad de los Datos (Data Safety)

Google Play exige responder con exactitud qué datos se recopilan. Selecciona estas opciones exactas para evitar revisiones manuales o rechazos:

### Preguntas generales:
1. **¿Tu aplicación recopila o comparte alguno de los tipos de datos de usuario obligatorios?**
   * Selecciona: **SÍ** (debido a la ubicación técnica aproximada y el identificador de dispositivo).
2. **¿Se cifran en tránsito todos los datos de usuario que recopila tu aplicación?**
   * Selecciona: **SÍ** (todas las conexiones van cifradas por HTTPS/TLS con HSTS).
3. **¿Ofreces un método para que los usuarios soliciten la supresión de sus datos?**
   * Selecciona: **SÍ** (especifica que los datos caducan automáticamente en 72h o escribiendo a `privacidad@radiopatio.app`).

### Datos específicos declarados:

#### A. Ubicación (Location)
* **¿Recopilas ubicación aproximada?** -> **SÍ**.
* **¿Recopilas ubicación precisa?** -> **NO** (la app solo solicita permiso de ubicación para situar el centro de la celda de ~450m y el servidor descarta el GPS exacto).
* **Finalidad**: *Funcionalidad de la aplicación (App functionality)*.
* **¿Se comparte con terceros?** -> **NO**.
* **¿Es efímera?** -> **SÍ** (el dato no se almacena permanentemente de forma vinculada a personas).

#### B. Identificadores de dispositivo u otros (Device or other IDs)
* **¿Recopilas identificadores de dispositivo?** -> **SÍ**.
* **Finalidad**: *Prevención de fraudes, seguridad y conformidad (Fraud prevention, security)*.
* **¿Se comparte con terceros?** -> **NO**.
* **¿Está vinculado al usuario?** -> **NO** (es un identificador seudónimo técnico con sal criptográfica).

#### C. Datos personales (Nombre, Email, Teléfono, Fotos, Contactos, Finanzas)
* **NO se recopila NINGUNO**. (Marca todo como NO).

---

## ⚖️ 4. Otras Declaraciones Obligatorias de la Consola

### Acceso a la aplicación (App Access)
* Selecciona: **«Todas las funciones están disponibles sin restricciones especiales»** (la app no tiene muro de registro ni contraseña, por lo que los revisores de Google pueden entrar directamente).

### Anuncios (Ads)
* Selecciona: **«No, mi aplicación no contiene anuncios»**.

### Público objetivo y contenido (Target Audience)
* Selecciona: **18 años o más** (o mayores de 16). Esto evita los requisitos estrictos de la política familiar y de menores (*Families Policy*).

### Contenido generado por usuarios (UGC Policy)
* Google te preguntará si la app permite contenido de usuarios: Selecciona **SÍ**.
* Mecanismos de moderación declarados:
  * Términos de uso claros (`radiopatio.app/terminos.html`).
  * Botón para denunciar contenidos abusivos integrado en cada aviso.
  * Ocultación automática tras 3 denuncias comunitarias.
  * Purga física en 72 horas.

---

## 📦 5. Cómo compilar el APK y el AAB con EAS

El proyecto ya está preconfigurado en [app/eas.json](file:///c:/Users/marti/Downloads/radio-patio/app/eas.json) apuntando a `https://api.radiopatio.app`.

### Opción 1: Generar el archivo `.apk` para instalarlo en tu móvil ahora
En tu terminal:
```bash
cd c:\Users\marti\Downloads\radio-patio\app
npx eas login
npx eas build -p android --profile preview
```
*EAS compilará en la nube y te dará un enlace directo para descargar e instalar el archivo `.apk` en tu Android en 5 minutos.*

### Opción 2: Generar el archivo `.aab` para subir a Google Play Console
```bash
cd c:\Users\marti\Downloads\radio-patio\app
npx eas build -p android --profile production
```
*Esto generará el paquete oficial `.aab` listo para arrastrar y soltar en Google Play Console.*
