# Nueva OT — diseño de referencia

## Fuentes y cascada vigente

- Prototipo: https://unithordemo.netlify.app/.
- Entrega local: `C:/Users/UnseR/Downloads/index.html`, revisada el 10 de noviembre de 2026.
- Base visual anterior: captura `design-review-2026-11-04/new-ot-services-desktop.png`, inspeccionada como punto de comparación; no representa una captura nueva del HTML actual.

Se aplicaron las reglas finales, no solamente las plantillas WREF iniciales. En el
HTML, los estilos de Nueva OT terminan antes del script de decoración. Los bloques
`reception-progress-bar-style`, `reception-photo-guides-style`,
`reception-review-refinement-style`, `reception-search-only-style`,
`reception-compact-fields-style` y `reception-dense-flow-style` reemplazan reglas
anteriores. Los decoradores desde aproximadamente la línea 9500 completan los
números de la línea de tiempo, iconos, guías y estructura de revisión.

## Valores extraídos

| Elemento | Referencia final |
| --- | --- |
| Tipografía | Poppins, ya disponible en la aplicación |
| Línea de tiempo y selección | `#1D396A` |
| Texto / texto secundario | `#294D7B` / `#8B9DB8` |
| Fondo del cuerpo | `#F5F7FB` |
| Ancho máximo de formulario | 1280 px |
| Cuerpo / pie | 16 × 18 px / 10 × 18 px |
| Pregunta / ayuda | 18 px / 12 px |
| Hitos de la línea de tiempo | Círculos de 31 px, cinco números conectados |
| Campos | 44 px; búsqueda de vehículo compacta de 40 px |
| Paneles de servicios | Dos columnas, separación de 14 px |
| Modal de revisión | 820 px; medida centralizada en `reference-foundation.css` |

La forma circular de los hitos y el cuerpo compacto provienen de los últimos
overrides: sustituyen las versiones intermedias con hitos cuadrados de 38 px.

## Estructura adaptada

Una sola tarjeta contiene línea de tiempo azul, cuerpo pálido y pie blanco con
acciones persistentes. El resumen previo al guardado se abre en un modal; no se
añade un panel lateral permanente.

1. **Responsable:** buscador blanco ancho y Crear cliente como acción lateral.
   La lista se presenta al escribir; la ficha elegida usa azul sólido y conserva
   Cambiar. Se mantienen los registros reales y su consulta existente.
2. **Facturación:** responsable en una franja; contacto y facturación en dos
   paneles, conservando sus selecciones independientes y las acciones para copiar
   los datos del responsable.
3. **Vehículo:** búsqueda y creación en una fila, selección compacta y propietario
   registrado separado de quien entrega el vehículo. El buscador compartido
   conserva sus vehículos recientes y sus validaciones; no se modifica fuera del
   alcance de esta fase.
4. **Inspección:** datos y llantas lado a lado en escritorio; fotos, inventario y
   observaciones ocupan el ancho completo. Desplegables con iconos y contadores.
   Las nueve fotos mantienen una grilla espacial de tres columnas, incluso en
   móvil, con acciones e indicaciones más compactas. Las imágenes reales se
   muestran con `object-fit: contain`. Inventario seleccionado en azul sólido.
5. **Servicios:** catálogo y selección en dos paneles, total azul, controles de
   cantidad/unidad/horas y asignaciones existentes. El responsable general permanece
   aquí y no se traslada al paso Vehículo como en el demo. Los servicios importados
   de una COT siguen siendo de lectura, salvo las asignaciones autorizadas, y se
   apilan en pantallas estrechas para evitar scroll horizontal.

La revisión conserva vehículo, propietario, responsable, contacto, facturación,
fechas, inspección, inventario y trabajos. Incluye unidades, estimaciones de horas,
mecánico por servicio y los descuentos heredados usando el helper compartido de
precios; el total cotizado original permanece intacto. Cabecera y pie permanecen
visibles, con desplazamiento solamente en el cuerpo.

## Límites de implementación

- CSS nuevo: `web/src/styles/reception-reference.css`, a importar después de
  `reference-foundation.css` y los estilos existentes de recepción.
- Selectores limitados a `.reception-create-page` y `.reception-create-review`.
  No se cambian las vistas guardadas de OT/COT ni sus documentos PDF.
- Se conservan los cinco pasos, las validaciones de avance, vehículo obligatorio,
  permisos y titular separado. La conversión COT comienza en Vehículo, mantiene
  sus ítems y solo crea la OT después de confirmar.
- No se cambian claves, orden ni assets de `reception-photo-guides.ts`, archivos,
  R2, recuperación local, reintentos, cargas confirmadas, emails o endpoints.
- Calendario, editor de catálogo/manual, descuentos, horas y asignaciones usan
  los componentes y datos existentes, sin lógica simulada del prototipo.
- Se mantienen etiquetas accesibles, foco, bloqueo durante guardado, campos de
  16 px en móvil y alternativa de movimiento reducido.

La comprobación visual integrada corresponde a la tarea principal. Esta subparte
no abre el navegador ni inicia servicios; no se declara fidelidad pixel a pixel
sin esa revisión.
