# Finanzas y Reportes — fase 6

Referencia: [prototipo de diseño](https://unithordemo.netlify.app/), pantallas `#/finance` y `#/reports`. HTML suministrado: `C:/Users/UnseR/Downloads/index.html`, entrega del 10 de noviembre de 2026. Comparación visual y de estilos realizada el 11 de noviembre de 2026. Se reutiliza la base documentada en `../foundation/DESIGN.md`.

## Evidencia visual

- Poppins; título de Reportes medido en navegador: 26 px, color `#303941`. Azul de acción `#003570`, títulos internos `#1D396A`/`#294D7B`, secundarios `#7185A3`/`#8B9DB8`, fondo `#F2F2F3`, superficies blancas y campos suaves `#F3F6FA`.
- Finanzas del prototipo: tres indicadores compactos, navegación Abonos/Caja en píldoras, búsqueda, movimiento de caja, filtros por estado/tipo, contador y directorio continuo blanco. Filas de aproximadamente 85 px, información secundaria discreta, estado con punto, importe y acciones de icono.
- Movimiento de caja del prototipo: modal blanco de 760 px, título de 17 px, cierre suave, campos en dos columnas y acciones inferiores en píldoras.
- Reportes del prototipo: cuatro indicadores de OT y una tabla de resumen comercial, además de exportación. No presenta las siete áreas, filtros y vistas previas que ya existen en el sistema real. La adaptación conserva ese alcance adicional.
- Capturas de referencia y aplicación en el directorio de artefactos de sesión `design-phase6-20261111`.

## Implementación

- `finance-reference.css` y `reports-reference.css` limitan los estilos a cada área y sus modales; sin cambios globales a formularios, documentos oficiales o PDF.
- Finanzas conserva Análisis, cobranza pendiente, indicadores adicionales y filtros avanzados. Los abonos siguen distinguiendo confirmado, por verificar y rechazado; no se convierten en estados ficticios del prototipo.
- Movimiento, anulación manual, revisión de transferencia y cierre diario conservan sus validaciones, protección al descartar y bloqueo durante el guardado. Formularios de 760 px con cabecera y acciones accesibles.
- El día de caja está en la barra superior. Búsqueda y tipo filtran el directorio manual del día; el arqueo y su exportación siguen incluyendo la caja completa del día y se identifican expresamente como tal.
- Las métricas muestran su alcance real: abonos confirmados del mes, neto de caja de hoy y cotizaciones con saldo. No se agregan importes o conteos de demostración ni cálculos nuevos al servidor.
- Reportes mantiene Finanzas, Comercial, Taller, Almacenes, Catálogo, Clientes/vehículos y Cuentas, con sus reglas de visibilidad y exportación. Se conserva la selección de solo clientes o solo vehículos, rangos, búsqueda, filtros específicos y enlaces de detalle.
- Configuración del informe agrupada en una superficie; indicadores financieros filtrados en tarjetas compactas y tablas de vista previa con cabeceras suaves. PDF y Excel indican que están generándose y evitan solicitudes duplicadas.
- Se preservan las consultas, filtros enviados, permisos, aislamiento de vendedores y contratos de API. Sin mutaciones reales de pagos, movimientos o cierres durante QA.

## Verificación

- TypeScript y compilación de producción correctos. ESLint: cero errores y cuatro advertencias previas fuera de esta fase. Permanece la advertencia previa por tamaño del paquete JavaScript.
- 545 pruebas del frontend en 52 archivos, todas aprobadas; incluye 21 pruebas de Finanzas y 10 de Reportes.
- Navegación visual real de las siete áreas de Reportes en móvil de 390 px, sin desbordamiento del documento. Verificada selección de solo vehículos.
- Finanzas revisado en escritorio, móvil y tablet de 820 px: Abonos, Caja, Análisis, filtros desplegables, movimiento y cierre. Modal móvil de 370 px dentro de viewport de 390 px, sin desbordamiento y con acciones inferiores visibles.
- Recorrido nuevo de Finanzas → Caja → Reportes en una pestaña limpia sin errores de consola. Durante la edición en caliente hubo avisos de remonte de React; no se reproducen con una carga nueva. Viewport restaurado al terminar las pruebas.
- La base local no contiene transferencias pendientes ni movimientos manuales anulables. Revisión/rechazo y anulación se verifican con las pruebas existentes sobre datos controlados; no se crean registros financieros para simularlos.
- PDF comercial abrió una pestaña nueva con URL de documento generado. El navegador de revisión restringe la inspección de URLs blob; no se afirma haber revisado su contenido visual en esta fase. Las pruebas verifican la descarga y los filtros enviados. Los generadores de documentos no se modificaron.
