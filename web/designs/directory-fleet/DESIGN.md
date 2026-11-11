# Clientes, Vehículos y Flota · fase 4

Fuentes: https://unithordemo.netlify.app/ (`#/clients`, `#/vehicles`, `#/work-orders/detail/o1`) y `C:/Users/UnseR/Downloads/index.html`, entrega del 10-11-2026. Revisión visual del 11-11-2026 en el prototipo y la aplicación local. Las capturas del demo contienen datos simulados y no definen permisos ni validaciones.

## Patrones observados

- Poppins, títulos `#303941`, navy `#1D396A`, texto `#294D7B`, secundarios `#7185A3`, fondo `#F2F2F3`.
- Directorios sobre superficies blancas continuas, radios de 22 px, divisores suaves, identificación destacada y acciones con iconos. Las filas de vehículos se expanden en azul claro y mantienen acceso explícito a la ficha.
- Barra superior compacta: buscador, pestañas/filtros y alta. Flota incorpora estado y vencimientos; cada fila resume permiso de circulación, SOAP y revisión técnica.
- Alta de cliente de 720 px con cabecera navy, tipo segmentado, bloques de identidad y contacto, dirección/notas desplegables. RUN/RUT y ubicación mantienen el tratamiento real del sistema.
- Fichas de vehículos de hasta 940 px con identidad navy, acciones dentro de la cabecera, pestañas de ancho completo y métricas técnicas/comerciales autorizadas. Los formularios de vehículo/flota usan cabecera clara, campos suaves y datos agrupados. Los documentos tienen su propio diálogo.
- Cuerpo desplazable, acciones de pie persistentes, foco visible y columnas apiladas en móvil. Se comprueban también botones dentro de fichas e historiales, no solo el listado.

## Adaptaciones conservadas

La numeración y las exportaciones Excel/PDF con filtros siguen disponibles aunque el prototipo no muestre ambos formatos. Las importaciones mantienen su vista previa y distinción entre altas y actualizaciones. No se inventan conteos globales a partir de una página.

Clientes y vehículos de taller siguen compartidos. Las consultas de OT/COT y los historiales usan los servicios existentes, con su aislamiento por vendedor y restricciones por rol. Nueva OT conserva las precargas reales de cliente y vehículo.

Flota mantiene responsable, documentos con o sin vencimiento, versiones, vista previa/descarga y almacenamiento existente. El propietario privado conserva sus controles reales para administrador/desarrollador y el selector opcional de visualización; no se oculta solo mediante CSS. Dado de baja sigue siendo distinto de Fuera de servicio, con la ordenación vigente al final del listado.

Los estilos de esta fase están acotados en `clients-reference.css` y `vehicles-reference.css`; no cambian backend, esquemas, permisos o documentos PDF aprobados.

El listado de Flota utiliza el resumen documental real disponible. No añade fechas ficticias de permiso, SOAP o revisión técnica para reproducir los ejemplos del prototipo. Las fechas y archivos reales continúan en la ficha y sus documentos.

## Ajuste adicional solicitado: detalle completo de OT

Se contrastó la ficha completa, además del modal Gestionar trabajo. `work-order-record-reference.css` adapta la cabecera, enlaces por sección, identidades, métricas y resumen de trabajos al diseño. Las tres acciones principales quedan en la cabecera; comprobante de recepción y WhatsApp se agrupan en Documentos y compartir. Se conservan los botones, sus manejadores, los permisos y la distinción entre OT oficial y comprobante.

El avance usa la misma utilidad de tareas medibles que el tablero (incluyendo Omitido). Recepción, fotos, estados, entrega, bitácora, cotización espejo y edición de trabajos continúan accesibles. La tabla económica se adapta a fichas etiquetadas en móvil. No se duplican formularios operativos ni se sustituye la gestión protegida de horas y asignaciones.

## Verificación

- 541 pruebas de web aprobadas en 52 archivos. TypeScript y compilación de producción correctos. ESLint: cero errores y cuatro advertencias previas fuera de esta fase; el aviso previo de tamaño de bundle continúa.
- Comprobación visual en escritorio, tablet de 820 px y móvil de 390 px. Se verificaron listados, alta de cliente, dirección/notas, edición y ficha de vehículo, resumen desplegable, filtros de Flota, propietario opcional y formularios de vehículo/documento.
- Se comprobó el cierre del documento anidado sin cerrar la ficha padre, la navegación por pestañas y el acceso a la importación. La baja se previsualizó sin guardarla. No se crearon ni modificaron registros reales durante la revisión visual.
- Se comprobó el detalle completo de OT y su navegación hasta actividad/costos, con tabla adaptable y sin desbordamiento horizontal en los tamaños revisados. Evidencias en la carpeta de visualizaciones `design-phase4-20261111`.
