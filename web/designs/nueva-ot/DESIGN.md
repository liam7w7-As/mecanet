# Nueva OT — referencia de diseño

Referencia suministrada: https://unithordemo.netlify.app/ y `unithor_demo_ot.html`.
Revisión visual: 4 de noviembre de 2026. La referencia es un prototipo en desarrollo.

## Sistema observado

- Poppins; azul `#1D396A`, texto `#294D7B`, secundario `#8B9DB8` y fondo `#F5F7FB`.
- Barra azul de cinco pasos, números unidos por una línea; paso actual blanco y anteriores azul claro.
- Paneles blancos sobre fondo pálido, radios de 12–20 px y campos de 44 px.
- Búsqueda y tarjetas para elegir responsable; ficha compacta con acción Cambiar tras seleccionarlo.
- Contacto y facturación en dos columnas, con responsable en una franja independiente.
- Vehículos como tarjetas; propietario separado del responsable del ingreso.
- Inspección con fechas, kilometraje y combustible; llantas, fotos, inventario y observaciones desplegables.
- Nueve guías de foto alrededor de la vista interior, copiadas sin modificar desde el HTML suministrado.
- Catálogo y selección en dos paneles; total estimado destacado en azul.
- Confirmación con cabecera azul, vehículo, tres identidades y desglose; cuerpo desplazable y acciones persistentes.

## Adaptación a la aplicación

Se limita a `.reception-create-page` y `.reception-create-review`. Conserva cinco pasos,
validaciones, permisos, conversión desde COT, unidades, horas estimadas, recuperación
local y reintento de fotos. La revisión final sustituye al resumen lateral.
El estado inicial y la sincronización OT/COT permanecen en los servicios existentes.

El calendario existente admite hora sin cambiar sus filtros de fecha. Las guías
conservan los identificadores compartidos de foto; el orden visual no cambia la
clave almacenada en R2. En móvil se abrevian los pasos y se usa una columna para
personas y servicios, y dos para fotos. El contenido se desplaza con el pie accesible.
La adaptación debe comprobarse en cada revisión; no se asume fidelidad exacta en las
partes aún no terminadas del prototipo.
