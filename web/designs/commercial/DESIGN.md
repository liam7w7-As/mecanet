# Cotizaciones y abonos · fase 3

Referencia: https://unithordemo.netlify.app/ y `C:/Users/UnseR/Downloads/index.html` (entrega del 10-11-2026). Se contrastaron visualmente el listado, el editor y el detalle con la aplicación local.

## Sistema visual observado

- Poppins, títulos navy `#1D396A`, texto `#294D7B`, secundarios `#7185A3`, fondo `#F2F2F3`.
- Buscador blanco de 46 px, botón principal redondeado y siete filtros en píldoras. En móvil, búsqueda, fecha y alta comparten fila; los filtros conservan icono y nombre accesible.
- Registros sobre una superficie blanca continua, radios 22 px y divisores suaves. Código y cliente dominan; fecha, asesor y estado tienen menor peso. Importes con cifras tabulares.
- Detalle con cabecera clara, bloque navy para el código, fichas de identidad y tres tarjetas financieras. Los modales se ajustan al contenido con cuerpo desplazable y acciones persistentes.
- Campos suaves `#F3F6FA`, esquinas de 11–14 px, foco azul visible y acciones secundarias discretas.

## Adaptación al sistema real

El listado conserva numeración, RUT y patente bajo cliente, OT verde bajo código, avisos de inactividad, archivo y exportación con los filtros actuales. Las acciones dependen de los permisos reales; no se muestran conteos o totales globales inventados a partir de una página.

Nueva cotización conserva su formulario y confirmación existentes, recuperación de borrador, descuentos por línea y generales, condiciones comerciales y alta de cliente. Una cotización de repuestos sigue pudiendo crearse sin vehículo. El editor mantiene los identificadores de las líneas y la sincronización operativa; el prototipo no sustituye las reglas del backend.

El detalle conserva checklist, aprobación de conceptos sugeridos, ajustes de precio autorizados, historial y correo. El abono mantiene resumen de trabajos terminados, saldo real descontando transferencias pendientes, banco de procedencia, número de transacción, comprobante y fecha automática editable. El archivo tiene una zona identificable, vista previa y opción de quitarlo. No se ofrecen tarjetas; las transferencias requieren verificación. Guardar desde el listado cierra el modal sin navegar a otra pantalla.

Estilos acotados en `commercial-reference.css` y `quotation-forms-reference.css`. No se aplican al documento PDF aprobado ni cambian consultas, permisos, importes, conversión a OT o almacenamiento R2.

## Corrección del listado (11-11-2026)

Se volvió a contrastar el listado real con `#/quotations` del prototipo después de la revisión de las siete fases. La cuadrícula anterior conservaba etiquetas de pago con fondo y una jerarquía distinta para los metadatos. Se ajustan los registros al patrón `cq-row`: icono de documento, código destacado, fecha/asesor secundarios, cliente con RUT y vehículo, estado con un punto, importes tabulares y flecha de detalle. En anchos intermedios el estado y los importes pasan a una segunda fila; en móvil se separa la franja financiera y se rotulan Editar/PDF/Ver detalle. Abonar sigue siendo un icono y abre el formulario sin navegar.

Se conservan la numeración, OT verde bajo el código, patente bajo el RUT, avisos y colores de inactividad/archivo. El contador de la pestaña seleccionada usa el total filtrado del servidor y se oculta mientras el resultado es provisional. No se inventan conteos para las otras pestañas ni se añaden consultas por cada estado. El resumen indica “Total cotizado” sólo si la respuesta incluye todos los registros; con paginación indica “Total de esta página”. Excel y PDF mantienen la exportación completa con los filtros actuales.

La comprobación visual incluyó escritorio, 1304 px, tablet de 820 px y móvil de 390 px, sin desbordamiento horizontal. Se abrieron detalle y abono sin guardar operaciones. La suite completa pasó 549 pruebas y la prueba dirigida de Cotizaciones incluye el alcance correcto del resumen al paginar. Capturas: `quotation-design-review-20261111` en los artefactos de esta sesión.

## Verificación (11-11-2026)

- Web: TypeScript, compilación y 539 pruebas en 52 archivos aprobados. ESLint: cero errores y cuatro advertencias preexistentes fuera de este bloque.
- Revisión visual en escritorio, tablet (820 px) y móvil (390 px), incluyendo detalle, edición y abono. En móvil se comprobó desplazamiento del cuerpo, acciones persistentes, banco de procedencia y protección al cerrar con cambios. Sin desbordamiento horizontal en las vistas comprobadas.
- No se registraron cotizaciones ni pagos reales durante la revisión visual. Las pruebas con API simulada cubren descuentos, recuperación, comprobantes, reintentos, permisos y conservación de IDs y avances de las líneas.
