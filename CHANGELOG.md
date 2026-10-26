# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

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
