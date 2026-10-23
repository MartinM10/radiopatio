# Open source y modelo de sostenibilidad

> Opinión de diseño, no asesoramiento jurídico ni financiero. La elección de
> licencia y la vía de ingresos deben revisarse con abogado cuando el
> proyecto se constituya formalmente (entidad, titularidad del copyright).

## 1. Licencia recomendada: AGPL-3.0-or-later

Este proyecto nace ciudadano: los datos los genera el barrio y el código lo
financia la comunidad. Ese origen pide **copyleft fuerte**, no una licencia
permisiva. Comparación de las opciones serias:

| Licencia | ¿Alguien puede hacer un fork cerrado y venderlo? | ¿Cubierto si alguien lo monta como SaaS? | Veredicto |
|---|---|---|---|
| MIT / Apache-2.0 | **Sí** | Sí (no obliga a nada) | Máxima adopción, cero protección: una empresa puede cerrar «tu» app |
| GPL-3.0 | No (derivados también libres) | **No** (el loop de SaaS queda abierto) | Protege el binario, no el servicio |
| **AGPL-3.0** | **No** | **Sí** (modificar y servir obliga a publicar) | El estándar de facto del software cívico (Mastodon, Nextcloud, Odoo Community) |

Por qué AGPL-3.0 gana aquí:

1. **Protege la confianza como activo.** Si una empresa toma el código,
   quita los filtros de privacidad y lo vende con los datos, el proyecto
   muere. Con AGPL, cualquier fork debe seguir siendo libre.
2. **Cierra el bucle SaaS**: montarlo como servicio de pago obliga a publicar
   las modificaciones — la comunidad siempre hereda las mejoras.
3. **No impide monetizar.** La licencia condiciona el *código*, no el
   *servicio*. Se puede cobrar por operarlo, soportarlo o extenderlo (§2).
4. **Doble licencia futura.** Siendo el titular del copyright (y con
   acuerdos de cesión de los contribuidores, tipo CLA), se puede ofrecer
   AGPL a la comunidad y licencias comerciales cerradas a quien lo necesite
   (p. ej. integraciones con software municipal propietario). Es el modelo de
   MySQL, Nextcloud o Odoo. Esta opción solo existe si la licencia inicial es
   fuerte y el copyright está ordenado desde el día uno.

Tareas concretas:

- [x] `LICENSE` con AGPL-3.0 en la raíz.
- [ ] Cabecera SPDX (`SPDX-License-Identifier: AGPL-3.0-or-later`) opcional por archivo.
- [ ] CLA o DCO para contribuidores antes de aceptar PRs externos (necesario para la doble licencia).
- [ ] Revisar compatibilidad de dependencias (Expo y React Native son licencias permisivas: compatibles).

## 2. Monetización: con el servicio, nunca con los datos

La idea de monetizar «con los datos y las estadísticas» merece una advertencia
clara: **es la vía que mataría este producto**. Razones:

1. **Confianza**: la app pide al vecino avisar de delitos de forma anónima.
   «Anónimo» se rompe en el momento en que hay un cliente pagando por esos
   avisos. La percepción basta: un titular «la app de tu barrio vende tus
   denuncias» es el fin del proyecto.
2. **Incentivos perversos**: si los ingresos dependen del volumen de avisos,
   el sistema deja de penalizar el spam y empieza a estimularlo. Contra el
   modelo entero de calidad del dato (docs/DATA-QUALITY.md, docs/TRUST.md).
3. **Legal**: los avisos tocan datos de infracciones penales (RGPD art. 10);
   cualquier comercialización añade riesgo sancionador de la AEPD que ya ha
   multado por esto.
4. **Valor real limitado**: tras agregación, celdas de 150 m y caducidad a
   72 h, el dato bruto vale poco; el activo es la *confianza* de la
   comunidad, y eso no se vende dos veces.

### Vías de ingresos compatibles (de más a menos recomendada)

| Vía | Qué se cobra | A quién | Por qué es compatible |
|---|---|---|---|
| **SaaS municipal** | Panel de zona, alertas oficiales verificadas, estadísticas agregadas (solo confirmadas, muestra mínima), integración con policía local | Ayuntamientos, policía local | Se paga el *servicio y el soporte*, no el dato. El convenio además aporta el «anclaje de verdad» de TRUST.md §3 |
| **Suscripción de asociaciones vecinales** | Funciones de gestión: estadísticas de zona, alertas personalizadas, informe mensual | Asociaciones de vecinos, juntas | Igual que la anterior; los agregados siguen las reglas de TRUST.md |
| **Doble licencia comercial** | Licencia cerrada del código para integraciones propietarias | Empresas, administraciones con software cerrado | Modelo MySQL/Nextcloud; exige CLA desde hoy (§1) |
| **Financiación cívica** | Subvenciones EU (DEP/CEF), programas de innovación municipal, fondos de impacto | Instituciones | Sin conflictos de interés; muy habitual en civic tech |

### Regla dura por escrito

> **Ninguna vía de ingresos puede depender del volumen de avisos ni del
> acceso a los avisos en sí.** Los agregados que se ofrezcan a cualquier
> cliente (público o de pago) se publican con las mismas reglas que la app:
> solo avisos confirmados, tamaño mínimo de muestra, celdas aproximadas y
> caducidad. Si un cliente quiere «más detalle», la respuesta es no.

Esa regla debe acabar en los términos de servicio y en el contrato con
cualquier ayuntamiento: es lo que diferencia «la app del barrio» de
«otro business de data».
