# Usuarios, permisos y Configuración — fase 7

Referencia: [prototipo de diseño](https://unithordemo.netlify.app/), `#/users` y `#/settings`; HTML suministrado `C:/Users/UnseR/Downloads/index.html` (entrega del 10 de noviembre de 2026). Comparación visual realizada el 11 de noviembre de 2026; continúa los tokens de `../foundation/DESIGN.md`.

## Patrones observados

- Poppins, títulos `#303941`, acciones `#003570`, cabeceras destacadas `#1D396A`, texto `#294D7B`/`#526F96`, secundarios `#8097B7`, campos `#F3F6FA` y superficies blancas sobre `#F2F2F3`.
- Usuarios: buscador, filtros Todos/Activos/Inactivos y botón de alta en una barra; contador y directorio de filas blancas compactas de aproximadamente 85 px. Avatar cuadrado suave, identidad, rol, estado con punto e iconos de acción.
- Alta de usuario y detalle: 760 px medidos en navegador, radio de 24 px, cabecera blanca y acciones inferiores. Alta con nombre completo, usuario y rol, correo y contraseña temporal. Detalle con bloque azul de identidad y datos en dos columnas.
- Configuración: panel de empresa de 1050 px y formulario de 850 px, medidos en navegador. Dos columnas, campos de 43 px, rótulos pequeños, panel redondeado y acción de guardado en el pie.
- El prototipo contiene copias locales de datos ficticios. El sistema real mantiene su configuración persistente y gestión del logo. La matriz de permisos se adapta al mismo lenguaje visual; el prototipo no ofrece una matriz equivalente en esta pantalla.

## Adaptación operativa

- Estilos separados `users-reference.css` y `settings-reference.css`, limitados a las páginas y a sus propios modales.
- Se conservan los roles reales, filtro por rol, nombre de usuario usado para entrar, permisos de lectura/creación/edición/eliminación, protección de la propia cuenta y reglas del servidor para cuentas administrativas.
- El formulario conserva las validaciones compartidas y la contraseña mínima de ocho caracteres. El mínimo de seis indicado por el demo no se traslada al sistema.
- Altas, edición, estado y eliminación mantienen protección de cambios pendientes, estados de petición y manejo de errores. No se guardan cuentas ni se cambian credenciales durante la comprobación visual.
- Permisos mantiene roles protegidos, selección por módulo/acción, borradores, confirmación al cambiar de rol, bloqueo al guardar y exportaciones con su alcance actual. No se modifican asignaciones reales durante QA.
- Datos de empresa y logo mantienen sus campos completos, validaciones, guardado/descarte, tratamiento de errores, permisos de administrador/desarrollador y almacenamiento existente. El formulario conserva los cambios de identidad pendientes al actualizar el logo.
- Configuración conserva el logo corporativo aplicado al sistema y documentos. La restauración tiene su propia confirmación. Los generadores PDF, correos y contratos de API no se modifican.

## Verificación

- Las diez pruebas existentes de Configuración pasan, incluidas validación, permisos, errores, guardado y conservación de borradores.
- Las dieciséis pruebas de Usuarios pasan. Se comprueban también la contraseña mínima antes de enviar, la conservación del formulario ante un conflicto al editar y el guardado de la selección de permisos por módulo con datos controlados.
- La suite web completa pasa: 52 archivos y 548 pruebas. Typecheck y compilación de producción pasan. Lint no presenta errores; conserva cuatro advertencias previas en archivos ajenos a esta fase.
- Comprobadas las páginas reales en escritorio, móvil de 390 px y tablet de 820 px, sin desbordamiento horizontal. Alta y detalle miden 760 px en escritorio; las confirmaciones de cuenta mantienen 510 px y el alta móvil se adapta a 370 px con ambos botones accesibles.
- Revisados visualmente alta, detalle, edición, desactivación y eliminación sin confirmar operaciones. Verificados los bloqueos de la propia cuenta y la matriz protegida de Administrador; el rol Vendedor conserva la información de su alcance y el guardado deshabilitado mientras no hay cambios.
- La carga limpia de Usuarios, apertura/cierre de alta y navegación a Configuración no producen errores de consola. Los errores de React detectados durante la sustitución en caliente de estilos/importaciones no se reproducen en una pestaña nueva.
- Las cuentas, credenciales, permisos y configuración de la base local no se guardan durante QA. El logo configurado localmente es el original; las operaciones de subida/restauración se verifican con las pruebas sobre datos controlados.

Las capturas de esta fase se guardan en el directorio de artefactos de la sesión `design-phase7-20261111`.
