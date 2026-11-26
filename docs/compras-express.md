# Compras express

## Configuración

En `api/.env` (o secretos del servidor):

```dotenv
OPENAI_API_KEY=
OPENAI_PURCHASE_MODEL=gpt-6-luna
```

La clave pertenece al proyecto/organización API donde se activaron los créditos. Nunca se incluye en variables `VITE_`, el repositorio o el navegador.
Reiniciar la API después de configurarla. Sin clave el registro manual y la carga de evidencias siguen funcionando.

Las migraciones aditivas `068-purchases-express` y `069-express-stock-returns-and-late-expenses` se aplican en el arranque mediante el bootstrap existente. Conservan compras históricas.

## Uso móvil

`/purchases` muestra solicitudes aprobadas/pendientes del taller y el alta en la misma vista.
`/purchases/new` abre directamente esa alta. `/purchases/history` conserva historial, proveedores, reportes y consulta/anulación.

La captura usa la cámara nativa del dispositivo; también hay selección desde galería. Para usar el sistema desde un teléfono publicar una URL HTTPS accesible (el `localhost` del teléfono no apunta al PC).
El escáner acepta JPG/PNG/WebP hasta 8 MB, comprime y elimina metadatos antes de enviar a OpenAI. La foto original se conserva como evidencia privada si se confirma la compra.
No se llama a OpenAI al guardar una compra ni se envían OTs o datos del cliente al modelo. El texto de la imagen no tiene herramientas ni permisos de escritura.

## Reglas

- Una compra express corresponde a un accesorio y una OT. Un recibo con varios productos permite elegir el accesorio antes de aplicar los datos. No se registra el total del recibo como costo de cada producto.
- Solo se crean compras express desde la interfaz; el historial conserva las compras anteriores. Una solicitud se compra completa y su cantidad debe coincidir con la línea actual de OT.
- El precio de compra es el importe unitario **realmente pagado**. La venta final al cliente debe ser al menos ese importe multiplicado por 1,25.
- La venta se adapta al neto e IVA de la cotización existente, sin modificar sus reglas de redondeo. El resumen muestra el importe final resultante.
- La aplicación exige confirmación humana: tomar una foto no registra movimientos.
- Si no se informa proveedor, queda un registro «por identificar» independiente para esa compra; completar uno no cambia otras compras de proveedores desconocidos.
- Al confirmar se crea un egreso, una compra y una línea ACC (o se actualiza la línea de la solicitud). Se sincroniza su cotización dentro de la misma transacción.
- No se registran ingresos ficticios de inventario ni firmas de bodega/taller. La compra queda identificada como abastecimiento externo: al confirmar físicamente su entrega, bodega no descuenta un saldo que nunca se ingresó. Las solicitudes ya entregadas no admiten compra.
- No se modifican OTs entregadas/canceladas ni cotizaciones pagadas en su totalidad. Si falla esa validación no se crea egreso.
- La clave de operación se conserva en el borrador; los reintentos idénticos retornan la compra original sin duplicar cargos. Un reintento con datos distintos se rechaza.
- El mínimo de venta también se protege al editar la OT/cotización o aplicar descuentos. La identidad y cantidad de una línea comprada no se pueden cambiar sin regularización.
- Las compras no requieren una caja abierta. Los egresos posteriores a un cierre quedan identificados en Finanzas; el cierre guardado conserva sus importes originales.
- Un accesorio comprado que no se utiliza se envía al stock general desde el detalle de compra. Se registra un ingreso automático en `CENTRAL`, se crea la ficha ACC si hacía falta y se conserva la compra y su egreso. No requiere una tarea ni selección de almacén por bodega.
- La línea original queda omitida y sin cobro en OT/COT, conservando notas, horas, custodia e historial. No admite volver a utilizarse. Si ya se utilizó o el nuevo total no permite conservar los abonos, toda la devolución se rechaza sin alterar stock ni cobros.
- La devolución es transaccional e idempotente. El endpoint antiguo de anulación rechaza compras express para evitar eliminar un egreso real.
- Las nuevas lecturas sustituyen datos automáticos anteriores. Si van a cambiar datos editados manualmente, muestran una confirmación antes de sobrescribirlos. No cambian la identidad ni la cantidad de una solicitud aprobada.

## Operación

El escáner limita a seis intentos por minuto y usuario por proceso de API, con timeout. En un despliegue con varias réplicas conviene trasladar el contador al rate limiter compartido.
Las respuestas incompletas, rechazos y errores no alteran los datos introducidos. Los borradores y fotos pendientes se guardan localmente por usuario usando el sistema de recuperación existente.
El modelo y los cargos reales deben verificarse con fotografías representativas; no hay un costo fijo por foto.
