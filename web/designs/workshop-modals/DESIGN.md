# Taller: gestión y modales

Referencia visual: https://unithordemo.netlify.app/ — revisión del 5 de noviembre de 2026.
La versión publicada prevalece sobre el HTML anterior. No se importan datos ni lógica del demo.

## Tratamiento visual

- Ficha rápida: superficie blanca de 948 px como máximo, radio de 24 px, margen interior de 16 px.
- Cabecera azul `#1D396A`, esquinas de 16 px, código de 27 px y metadatos pequeños.
- Herramientas PDF/detalle en la cabecera, estado y cierre independientes.
- Pestañas centradas en forma de píldora: Resumen, Avances y Checklist, Solicitudes.
- Paneles interiores suaves `#F5F6F8`, radio de 16 px, tipografía Poppins heredada del shell.
- Resumen: identidad en dos columnas, métricas agrupadas, trabajos/avance a la izquierda y contexto/correo a la derecha.
- Ejecución: checklist a la izquierda; reporte y bitácora a la derecha. Selector segmentado con selección blanca y texto verde solo para un trabajo completado.
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

Estilos de modales acotados en `web/src/styles/workshop-modals.css` y colores de cards en `web/src/styles/workshop.css`. Los diálogos de otros módulos y las hojas imprimibles no reciben estos estilos.

El listado y detalle de OT añaden `lastWorkActivityAt`, calculado con los registros operativos existentes. La sincronización del checklist desde OT/COT registra los cambios de estado en el historial de trabajo. No se requieren nuevas columnas ni migraciones; `updatedAt` sigue indicando ediciones generales y no interviene en la excepción de 48 horas.
