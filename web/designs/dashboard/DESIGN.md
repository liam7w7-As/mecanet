# Dashboard — referencia de diseño

Referencia: https://unithordemo.netlify.app/#/dashboard y `unithor_demo_ot.html`.
Revisión visual: 4 de noviembre de 2026, captura de escritorio de 1280 × 720.
El prototipo continúa en desarrollo. Firecrawl y el DOM renderizado aportan los
tokens; la comparación visual confirma la distribución de escritorio.

## Sistema observado

- Poppins, texto `#7185A3`, títulos `#294D7B`, acción principal `#1D396A`.
- Tres estilos de texto: cuerpo de 14 px, títulos y acciones de 14 px en semibold,
  y saludo e indicadores de 20 px. Los importes usan cifras tabulares.
- Tarjetas blancas de radio 18 px, sin sombra habitual, con iconos circulares
  neutros de 38 px y hover de borde y sombra suave. Tres indicadores por fila.
- Acciones rápidas dentro de un panel blanco: tres botones de 56 px y buscador
  compacto con flecha. Solo Nueva OT lleva fondo azul; el resto usa azul pálido.
- Bandeja de tareas con dos columnas en escritorio, contadores redondeados y
  separadores suaves. Órdenes recientes y alertas se colocan debajo.
- La hoja móvil del HTML usa dos indicadores por fila, acciones en tres columnas,
  buscador debajo, logo en la cabecera y registros de OT reorganizados sin scroll
  horizontal. La comparación móvil se verifica sobre la aplicación implementada.

## Adaptación

`dashboard.css` se limita a `.workspace-dashboard`; las plantillas PDF y los
modales compartidos conservan su diseño. Se mantienen los permisos de acciones,
los indicadores de la API, los avisos de flota, los enlaces concretos de tareas,
la creación de clientes, el ajuste de stock y la búsqueda real de clientes/autos.
La cuadrícula se adapta también a usuarios con menos acciones autorizadas.

La implementación conserva títulos descriptivos y prioridades reales de cada
tarea, en vez de las filas repetidas con datos de demostración del prototipo.
El móvil mantiene tipografía legible e inputs de 16 px para evitar zoom de iOS.

## Comprobación

Aplicación revisada visualmente a 1280, 768, 390 y 320 px de ancho. No se observó
desbordamiento horizontal de la página. Las OT se reorganizan en filas compactas
cuando el espacio disponible es reducido. Se comprobó la apertura y cierre del
modal de cliente sin guardar datos, y las pruebas verifican permisos, rutas y
resultados de búsqueda. Se conserva la barra móvil existente con el menú Más.
