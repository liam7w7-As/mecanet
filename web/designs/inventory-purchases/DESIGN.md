# Catálogo, Almacenes y Compras — fase 5

Referencia: [prototipo de diseño](https://unithordemo.netlify.app/), HTML local `C:/Users/UnseR/Downloads/index.html` (entrega del 10 de noviembre de 2026). Comparación en navegador realizada el 11 de noviembre de 2026. Continúa los tokens y primitivas de `../foundation/DESIGN.md`.

## Patrones observados

- Poppins; títulos azul `#1D396A`, acciones `#003570`, texto `#294D7B`, secundarios `#7185A3`/`#8B9DB8`, fondo `#F2F2F3` y superficies blancas.
- Catálogo: buscador y acciones en la cabecera, filtros en píldoras, contador y directorio continuo de filas compactas con icono, nombre/código, tipo/unidad, precio, disponibilidad y acciones.
- Alta de catálogo: modal blanco de 760 px, selector de tipo, campos en dos columnas, descripción completa y acciones inferiores.
- Almacenes: búsqueda, selector etiquetado del almacén actual, movimiento/traslado, ubicación y edición; inventario en tabla blanca redondeada.
- Alta/edición de almacén: modal de 560 px con cabecera azul, código y nombre, dirección y control de almacén activo.
- Movimiento y traslado: modales de 650 px, cabecera blanca, origen/destino, producto, cantidad y motivo. El prototipo especifica que un ajuste corresponde al saldo final.
- No se encontró una pantalla propia de Compras en la navegación del prototipo. Se adapta el módulo existente al mismo sistema de superficies, campos, iconos y modales; no se inventa un flujo comercial a partir de datos de demostración.

## Aplicación y reglas conservadas

- Estilos separados y limitados a cada módulo: `catalog-reference.css`, `warehouses-reference.css` y `purchases-reference.css`.
- Catálogo conserva los tres tipos reales, horas estándar, unidades, servicios sin inventario, stock mínimo, importación con vista previa y exportación con los filtros actuales. No se agrega un tipo ficticio de accesorio.
- Stock por almacén, validación de saldos, ajuste como saldo final, aprobación/despacho a OT y kardex mantienen sus consultas y mutaciones existentes.
- Cada exportación de almacenes, inventario, solicitudes y kardex permanece asociada a su propio listado y filtros. Se mantiene el precio de venta real del sistema; no se presenta como costo por imitar una etiqueta del prototipo.
- Compras conserva proveedor, comprobante, contado/crédito, impuestos, asociación a taller/flota, recepción de stock, pago y reversión por anulación. Los modales usan acciones fijas, confirmación al descartar y bloqueo durante la petición.
- Se conservan permisos, restricciones por rol y contratos de API. Sin cambios de modelos, servicios, precios, documentos oficiales ni sincronización OT/COT.

## Verificación

- TypeScript: correcto. ESLint: cero errores; cuatro advertencias previas fuera de esta fase.
- Frontend completo: 544 pruebas en 52 archivos, todas aprobadas. Incluye 18 pruebas de almacenes, 10 de catálogo y 14 de compras.
- Compilación de producción correcta; permanece la advertencia previa de tamaño del paquete JavaScript.
- Revisión visual real de Catálogo/alta/ficha/movimiento de stock, Almacenes/alta/movimiento, Compras/listado/alta y lista de proveedores. La base local no contiene compras ni proveedores, por lo que sus fichas, pago, anulación y edición de proveedor se verifican mediante pruebas de componentes con datos controlados.
- Revisión responsive en escritorio, tablet de 820 px y móvil de 390 px; comprobación de ancho del documento, formularios largos y modales con pie accesible. Sin guardar movimientos, compras, pagos ni proveedores sobre la base local. Sin errores de consola en el recorrido móvil. Viewport restaurado y pestaña temporal de revisión cerrada.

Las capturas de esta fase están en el directorio de artefactos de la sesión `design-phase5-20261111`.
