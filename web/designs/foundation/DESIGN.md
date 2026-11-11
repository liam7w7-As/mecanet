# UNITHOR: base visual compartida

Referencia: https://unithordemo.netlify.app/ y `C:/Users/UnseR/Downloads/index.html`, revisión del 10 de noviembre de 2026. Se consideran los últimos estilos del archivo, que reemplazan varias medidas anteriores.

## Identidad

Poppins; fondo de aplicación `#F2F2F3`; títulos y cabeceras operativas `#1D396A`; navegación activa y acción principal `#003570`; texto `#294D7B`; texto secundario `#7185A3`; bordes suaves `#E7EDF5`. Controles de modal con radio de 12 px y ventanas de 24 px (20 px en móvil). No reemplazar los colores semánticos de OT acordados con el cliente.

## Navegación

En escritorio, barra lateral completa o carril de iconos de 76 px. Las secciones conservan sus nombres accesibles y los iconos muestran ayudas al pasar el cursor o recibir foco. Cuenta y herramientas comparten un bloque inferior. En móvil, barra inferior y panel Más, sin barra lateral; las entradas se obtienen de los permisos reales y los accesos principales disponibles para cada rol.

## Dimensiones de modales

| Familia | Ancho de escritorio |
| --- | ---: |
| Almacén | 560 px |
| Movimientos y ajustes de inventario | 650 px |
| Documentos de flota | 680 px |
| Cliente | 720 px |
| Catálogo y formulario de usuario | 760 px |
| Vehículo y revisión de nueva OT | 820 px |
| Entrega de OT | 900 px |
| Abonos | 920 px |
| Ficha de vehículo | 940 px |
| Gestión de trabajo | 960 px |

El detalle real de cotización y su editor conservan 960 px para alojar sus funciones operativas adicionales. Confirmaciones de anulación/eliminación y previsualizaciones de documentos conservan sus medidas específicas. No ampliar todas las ventanas con un mismo multiplicador.

Las medidas son máximos: la ventana se limita al ancho disponible. Márgenes de 20 px en escritorio y 10 px en móvil, considerando áreas seguras. Los formularios comparten un cuerpo desplazable con cabecera y acciones persistentes; se conserva el bloqueo de fondo, la devolución del foco y las protecciones por cambios sin guardar o peticiones en curso.

## Implementación y límites de esta fase

`reference-foundation.css` centraliza colores y dimensiones; `navigation-reference.css` adapta la navegación. Ambos se cargan después de los estilos anteriores para resolver la cascada sin modificar los documentos imprimibles.

Esta fase no modifica estados, precios, permisos, asignaciones, horas, sincronización OT/COT, aislamiento por vendedor, almacenamiento, correos ni documentos PDF aprobados. El contenido y la distribución específica de cada módulo se adaptan en las siguientes fases.
