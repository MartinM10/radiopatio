# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.4.0](https://github.com/MartinM10/radiopatio/compare/radiopatio-v1.3.0...radiopatio-v1.4.0) (2026-10-31)


### ✨ Funcionalidades

* **app:** redesign map and feed with working gestures, filters and detail page ([cc9b33b](https://github.com/MartinM10/radiopatio/commit/cc9b33bff5f0c4b9befe1dd0d45601bea87d4cba))
* **app:** street suggestion, grouped map markers and a richer feed ([a76a250](https://github.com/MartinM10/radiopatio/commit/a76a250c4191f8dc6b93fd58556228019c68b7ec))
* **server:** suggest the street of a pin and strip portal numbers ([9cd34d9](https://github.com/MartinM10/radiopatio/commit/9cd34d96729085f7db6250a84cfcedb06713ec02))


### 🐛 Correcciones

* **app:** onboarding no longer claims the exact position is never stored ([3dfc12e](https://github.com/MartinM10/radiopatio/commit/3dfc12e796ad0ec97c799aedabfd649f049ffb73))
* **privacy:** publish the same hex-cell centre for every point in a cell ([372d670](https://github.com/MartinM10/radiopatio/commit/372d670074036b0942274c366b97ef01314aab9b))


### 📝 Documentación

* **landing:** add account and data deletion page for Google Play ([fbee286](https://github.com/MartinM10/radiopatio/commit/fbee286845728d13a28948334c4d9408fe4f602a))
* **landing:** drop unpkg from the privacy policy ([835b98a](https://github.com/MartinM10/radiopatio/commit/835b98a8b76708d8740841e18687d59578899216))
* **landing:** list the third parties the app really talks to ([a3ac27c](https://github.com/MartinM10/radiopatio/commit/a3ac27ca8a8024a10f79f0ee14decd526788c8a8))
* **landing:** name the data controller in the privacy policy ([87efac3](https://github.com/MartinM10/radiopatio/commit/87efac3efe63af36643dabc767ce6f5cafee53c9))
* state that exact coordinates are kept up to 72 h in landing and LEGAL ([75d8697](https://github.com/MartinM10/radiopatio/commit/75d8697d79795b849554dd6c51f87a9ce91a0715))


### 📦 Compilación y EAS

* **app:** bump android versionCode to 7 ([e90ac0f](https://github.com/MartinM10/radiopatio/commit/e90ac0fa8a4d3e10f576932a9f7d1da8a165fddb))
* **app:** bump android versionCode to 8 ([a58f447](https://github.com/MartinM10/radiopatio/commit/a58f4478ac41abc355777bc209d0477371280572))
* **app:** bump android versionCode to 9 ([1f6958d](https://github.com/MartinM10/radiopatio/commit/1f6958d5dc3593be7c91c1b34fe60efb692a1f7a))

## [1.3.0](https://github.com/MartinM10/radiopatio/compare/radiopatio-v1.2.0...radiopatio-v1.3.0) (2026-10-28)


### ✨ Funcionalidades

* **app:** Google sign-in gate for writing and delete-my-identity button ([ba34681](https://github.com/MartinM10/radiopatio/commit/ba34681cbaf1239e214e4738389ddc1ef7b3305f))
* **server:** require Google-verified identity to write and add identity deletion ([ea42dbe](https://github.com/MartinM10/radiopatio/commit/ea42dbefd1291b3ed4694f91d977b1dfb93a63e9))


### 📝 Documentación

* describe verified identity model in README, TRUST and LEGAL ([0de11f5](https://github.com/MartinM10/radiopatio/commit/0de11f51753f5d5f6fff8e780e6ac448786d195b))
* **landing:** align privacy policy and terms with Google verification ([05915a9](https://github.com/MartinM10/radiopatio/commit/05915a96be5af76261aa13079575f934fc02d0a9))


### 📦 Compilación y EAS

* **app:** bump android versionCode to 6 ([36851e6](https://github.com/MartinM10/radiopatio/commit/36851e6a3d04a33950433c89b0db91c09f266924))


### 🔧 Mantenimiento

* **scripts:** add google play feature graphic generator and ignore generated assets ([295b06b](https://github.com/MartinM10/radiopatio/commit/295b06b6bd015d890b5c9fd475e3c5a48b6dbd58))

## [1.2.0](https://github.com/MartinM10/radiopatio/compare/radiopatio-v1.1.2...radiopatio-v1.2.0) (2026-10-26)


### ✨ Funcionalidades

* **app:** add light theme support and configure local development environment ([829b2e6](https://github.com/MartinM10/radiopatio/commit/829b2e6b0fb1c4d23eb6770ce90f4409d451f3bb))
* **app:** elevate UI/UX to 9.5 with SVG icons, search, and onboarding ([2885cea](https://github.com/MartinM10/radiopatio/commit/2885cea6795c60292ba938cc592c312a3543deb1))
* **app:** upgrade to Expo SDK 58 and configure Android release metadata ([0a2c75d](https://github.com/MartinM10/radiopatio/commit/0a2c75ddf0c1eb9260ca0ad97787d1abe60fe6ca))
* **branding:** configure Radio Patio domain, landing page, and privacy policy ([a1e75f8](https://github.com/MartinM10/radiopatio/commit/a1e75f82f993fbb3f323fd5b767f56c9de719399))
* **branding:** implement high-contrast Radar Pin logo, favicons, and app icons ([5ff5d2a](https://github.com/MartinM10/radiopatio/commit/5ff5d2af8f2766683a1e2b0866edb87b5b1fd43c))
* **branding:** implement official Radio Patio logo, app icons, and favicons ([458e013](https://github.com/MartinM10/radiopatio/commit/458e0136710b18fa789b4358be38c38250a5fd0b))
* **categories:** add urban and public service categories with categorized report UI ([c55552b](https://github.com/MartinM10/radiopatio/commit/c55552b088645536bebd58886dbe25082a04bf0c))
* **changelog:** automate CHANGELOG.md generation from conventional commits ([9ea3c2d](https://github.com/MartinM10/radiopatio/commit/9ea3c2d8dcf19e18933048586c8ce4f0c411a30e))
* **landing:** add scroll-reveal animations, interactive mockup filters, and FAQ accordion ([057e6cf](https://github.com/MartinM10/radiopatio/commit/057e6cf3e434ccf6e9d5ae3f9090a4047e3e1e25))
* **server:** harden admin auth with timingSafeEqual and update CORS headers ([d2efeef](https://github.com/MartinM10/radiopatio/commit/d2efeefb797e00f105f4d4a28219dba982d2dc99))


### 🐛 Correcciones

* **app:** configure expo-splash-screen with dark Radar Pin branding ([d1cbb31](https://github.com/MartinM10/radiopatio/commit/d1cbb31149feae4d50a2cade7efcd86381d31411))
* **app:** harden API base URL against localhost in production and update branding links ([a6989ed](https://github.com/MartinM10/radiopatio/commit/a6989ed668fdb6527c41ff5524edf487bbfa0ff4))
* **build:** correct eas.json schema with app-bundle buildType and remove invalid description ([ccd19e1](https://github.com/MartinM10/radiopatio/commit/ccd19e1bb43b84283313ba9f3f990f71f07db462))
* **ci:** ensure db migrations run and close pool in server test suites ([25eb2ef](https://github.com/MartinM10/radiopatio/commit/25eb2ef651df45dc296c2ffcf5a4ff1f952a7a8e))
* **landing:** improve light mode contrast across mockups, comparison table, and tags ([5ab1b65](https://github.com/MartinM10/radiopatio/commit/5ab1b65839b9b344c7e105c1986ea08b89d1d28c))


### 📝 Documentación

* add CHANGELOG.md following Keep a Changelog standard ([75d2ce5](https://github.com/MartinM10/radiopatio/commit/75d2ce5fca7fa657fa594bda4baca846f5b021fe))
* add Google Play Console publishing kit with data safety and store listing metadata ([427b123](https://github.com/MartinM10/radiopatio/commit/427b1234b579329f9fd3f3daa384a1773fd3b5b6))


### 📦 Compilación y EAS

* **app:** add eas-cli to package.json and update build docs ([a91035f](https://github.com/MartinM10/radiopatio/commit/a91035f8854540f20e283775411e50ebd783ffbd))
* **eas:** set appVersionSource to local ([dd2b4f2](https://github.com/MartinM10/radiopatio/commit/dd2b4f243d21f6959dc7e2d9533cde6535cc76ee))


### 🚀 Integración Continua

* configure release-please for automated semver releases and changelog ([110b01f](https://github.com/MartinM10/radiopatio/commit/110b01fb1e43e8a2572a55e686f428544807c3d6))


### 🔧 Mantenimiento

* **deploy:** support reverse proxy network and update compose configurations ([6b0cd7e](https://github.com/MartinM10/radiopatio/commit/6b0cd7e71bf61b225e194455dbcb39308b5b476d))
* **docs:** keep GOOGLE_PLAY_KIT private and add to gitignore ([90e1002](https://github.com/MartinM10/radiopatio/commit/90e1002ea38e97084882ca5c03357be0099868a3))
* **doctor:** pass 20/20 expo doctor checks by removing deprecated splash and eas-cli ([f1eae5b](https://github.com/MartinM10/radiopatio/commit/f1eae5b534c379c2adeaea137ab91c4fed2b54a2))
* ignore aab and apk build binaries in git ([b8ea146](https://github.com/MartinM10/radiopatio/commit/b8ea1466e1220fed710774cb9149225a6e409f45))
* **release:** bump app version to 1.0.0 for initial store release ([f9087df](https://github.com/MartinM10/radiopatio/commit/f9087dfb4c44c27476858f18f569f17dfff0e75f))
* **release:** bump app version to 1.1.0 (versionCode 2) ([f6d4fd9](https://github.com/MartinM10/radiopatio/commit/f6d4fd93332577295db3dfb0c3cdd759806a87ce))
* **release:** bump versionCode to 3 for brand icon update ([14576f6](https://github.com/MartinM10/radiopatio/commit/14576f63043ba1a4efce4a59ea4b0d54956aefef))

## [1.1.2] - 2026-10-26

### Mejorado
- **Rediseño de Identidad Visual — El Radar Vecinal**:
  - Sustitución del isotipo detallado por una silueta geométrica minimalista y rotunda: Pin de mapa hiperlocal + ondas concéntricas de radio en cian eléctrico y azul cobalto sobre fondo azul noche (`#021536`).
  - Máxima legibilidad y nitidez en escalas reducidas (16 px en favicon del navegador, 32–40 px en la barra de navegación y pantallas móviles).
  - Regeneración completa de assets de marca: `radio-patio-logo.png`, `favicon.png`, `favicon-32.png`, `icon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png` y `splash-icon.png`.
  - Incremento de `versionCode` a 4 en `app.json`.

---

## [1.1.0] - 2026-10-26

### Añadido
- **Categorías cívicas y urbanas de ayuda mutua**:
  - 💧 `corte_agua`: Corte de agua, baja presión o rotura de tuberías.
  - ⚡ `corte_luz`: Avería o corte del suministro eléctrico en manzana o edificio.
  - 💡 `alumbrado`: Farolas rotas, fundidas o tramos de calle a oscuras.
  - 🚧 `calzada`: Baches, desperfectos en el asfalto, socavones u obras en vía pública.
  - 🗑️ `limpieza`: Contenedores desbordados, suciedad grave o residuos.
  - 🐾 `perdido`: Mascotas extraviadas u objetos perdidos.
  - 📍 `otro`: Otras incidencias de interés vecinal.
- **Selector de grupos en modal de reporte**: Pestañas organizadas (`Todos (14)`, `🛡️ Seguridad (7)`, `⚡ Servicios y Vía (7)`) para agilizar el aviso.
- **Iconografía SVG dedicada**: Nuevos iconos vectoriales nítidos para todas las categorías urbanas en app, selector y marcadores del mapa.
- **Identidad Visual Oficial de Radio Patio**:
  - Nuevo logotipo e icono oficial: hexágono comunitario con torre de transmisión vecinal y ondas de radio de neón concéntricas.
  - Iconos adaptativos completos para Android (`android-icon-foreground.png`, `android-icon-background.png` y `android-icon-monochrome.png`).
  - Nuevos favicons web (32×32 y 48×48) y actualización del logo en la barra de navegación de la landing page y páginas legales.
- **Soporte de tema claro en la app móvil**: Paleta equilibrada en modo claro (`#F8FAFC`, `#FFFFFF`, `#0F172A`) con marcadores de mapa de alto contraste.

### Corregido
- **Contraste en Modo Claro (Landing Page)**: Corrección de textos de bajo contraste en modo claro (tabla comparativa, tarjetas del mockup interactivo, badges e insignias) para cumplir con el estándar WCAG AAA.
- **Capa cartográfica OpenStreetMap**: Sustitución de teselas con marca de agua por la capa cartográfica oficial libre de OpenStreetMap, sin dependencias de API key externa.

---

## [1.0.0] - 2026-10-25

### Añadido
- **Arquitectura de Privacidad por Diseño (GDPR-friendly)**:
  - Rejilla hexagonal universal (~450 metros de diámetro por celda) para anonimizar la ubicación exacta del domicilio.
  - Cero recogida de PII: filtro en tiempo real contra números de teléfono, DNIs/NIEs, matrículas, emails, cuentas bancarias y enlaces.
  - Consenso vecinal obligatorio: al menos 2 confirmaciones independientes de vecinos del mismo sector para validar un aviso.
  - Caducidad y purga automática estricta a las 72 horas.
- **App Móvil (React Native + Expo SDK 58)**:
  - Mapa interactivo con polígonos de sectores vecinales y marcadores categorizados.
  - Filtros por categoría, proximidad geográfica y búsqueda por texto.
  - Onboarding interactivo para explicar las garantías de privacidad y el funcionamiento del consenso.
  - Configuración completa para Android (Google Play Store Bundle `.aab`, iconos adaptativos y metadatos).
- **Backend Fastify + PostgreSQL**:
  - Motor de deduplicación semántica en tiempo real (similitud de texto y distancia geográfica).
  - Sistema de moderación comunitaria con ocultación automática ante doble denuncia y panel de auditoría.
  - Autenticación administrativa endurecida con comparación de hashes en tiempo constante (`timingSafeEqual`).
- **Página de aterrizaje (Landing Page)**:
  - Mockup interactivo con sincronización simulada, comparativa frente a WhatsApp y Nextdoor, y sección de preguntas frecuentes (FAQ).
  - Políticas de Privacidad y Términos de Servicio adaptados a la arquitectura sin registro de usuarios.
