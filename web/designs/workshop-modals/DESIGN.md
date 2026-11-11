# Taller: gestión y modales

Referencia visual: https://unithordemo.netlify.app/ y `C:/Users/UnseR/Downloads/index.html` — revisión del 10 de noviembre de 2026.
La versión publicada prevalece sobre el HTML anterior. No se importan datos ni lógica del demo.

## Tratamiento visual

- Ficha rápida: superficie blanca de 960 px como máximo, radio de 24 px, margen interior de 16 px; altura limitada al viewport, cabecera y acciones persistentes.
- Cabecera azul `#1D396A`, esquinas de 16 px, código de 27 px y metadatos pequeños.
- Herramientas PDF/detalle en la cabecera, estado y cierre independientes.
- Pestañas centradas en forma de píldora: Resumen, Trabajos, Solicitudes y Precios (según rol). La cabecera compacta agrupa código y fecha en la misma línea en escritorio.
- Paneles interiores suaves `#F5F6F8`, radio de 16 px, tipografía Poppins heredada del shell.
- Resumen: vehículo y compromiso de entrega destacados, tres identidades separadas debajo, métricas en cuatro tarjetas y trabajos de ancho completo. Se conserva el contexto real de inspección, cotización y correo. La disposición de entrega se extrae de `workshop-modal-delivery-style`; no se importan los datos simulados del demo.
- Ejecución: tarjetas compactas sin bordes extra, responsable por trabajo, horas y acciones principales; notas e historial se despliegan dentro de cada trabajo. Observaciones generales, responsable general y reportes son filas desplegables. El texto verde se reserva para trabajos completados y cronómetros activos.
- Solicitudes: formulario a la izquierda; historial y decisiones reales a la derecha.
- Ficha completa: cabecera azul, navegación por secciones, superficies blancas de 18 px y controles equivalentes.
- En móvil se apilan las columnas; cabecera, pestañas y acciones permanecen accesibles, y el cuerpo del modal tiene su propio scroll.

## Adaptaciones operativas conservadas

- Gestionar trabajo abre directamente el checklist para mantener el acceso corto existente; Resumen sigue disponible.
- Se conservan los cuatro estados operativos, incluido Omitido. La referencia muestra tres.
- Se mantienen el pie de guardado, bloqueo durante mutaciones, confirmación de descarte y restauración de foco/scroll.
- Los mecánicos conservan sus límites de asignación, reversión de estados, precios y documentos financieros.
- Las solicitudes y aprobaciones usan sus servicios reales. No se muestran historiales ficticios del prototipo.
- La edición continúa en modales protegidos; no se cambia al asistente de edición del demo ni se eliminan campos de recepción, facturación, inspección, horas o entrega.
- Se conservan la distinción del propietario, los contactos, la COT vinculada y los avisos de saldo pendiente.
- Los PDF aprobados y la sincronización OT/COT no se modifican.
- Los colores de las cards mantienen las reglas acordadas: ejecución reciente e incompleta `#B3E4D8`; finalizada o todos los trabajos medibles completados, verde oscuro; alertas según antigüedad/estado. Solo Esperando repuesto usa limón `#E9F246` y pulso de toda la card, pausado al interactuar y desactivado si se solicita movimiento reducido. Las alertas por antigüedad usan amarillo claro `#F5D547`, fijo. Después de 30 días, el amarillo dura 48 horas desde el último avance real o registro de horas; las ediciones administrativas no renuevan ese plazo ni reinician los días de ingreso.

## Alcance técnico

Estilos existentes en `web/src/styles/workshop-modals.css`, adaptación final de la referencia en `web/src/styles/workshop-reference.css` y colores de cards en `web/src/styles/workshop.css`. La cuadrícula conserva un máximo de cuatro columnas y se reduce en tablet/móvil. El hover sigue abriendo la información anclada sin mover las tarjetas vecinas; en pantalla táctil y con teclado existe el control explícito. Los filtros mantienen un carril propio cuando no caben, sin generar scroll horizontal de página. Los diálogos de otros módulos y las hojas imprimibles no reciben estos estilos.

Las solicitudes generales de repuestos siguen en la pestaña de Solicitudes, porque el contrato actual no las asocia a una tarea. No se inventan asociaciones ni bitácoras a partir del nombre del servicio ni se sustituye el historial real de horas por el historial simulado del prototipo.

En la revisión de fase 4 (11-11-2026) se completó la adaptación de la ficha de página completa en `work-order-record-reference.css`: cabecera con acciones principales, enlaces por sección, vehículo/entrega e identidades, cuatro métricas y resumen de trabajos. Correo, comprobante de recepción y WhatsApp se agrupan en el resumen sin perder sus acciones. El resto de secciones y modales sigue usando sus permisos y servicios existentes. Las fotos y los PDF aprobados no cambian.

El listado y detalle de OT añaden `lastWorkActivityAt`, calculado con los registros operativos existentes. La sincronización del checklist desde OT/COT registra los cambios de estado en el historial de trabajo. No se requieren nuevas columnas ni migraciones; `updatedAt` sigue indicando ediciones generales y no interviene en la excepción de 48 horas.
