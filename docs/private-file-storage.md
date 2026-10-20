# Archivos persistentes en Hostinger con Cloudflare R2

## Que cambia

Fotos de inspeccion, comprobantes y logos usan la misma capa de archivos. En
desarrollo se mantiene el disco local; en produccion se puede usar un bucket
privado compatible con S3. MySQL conserva las mismas claves y metadatos, sin
guardar BLOB y sin necesitar una migracion de tablas.

Las rutas HTTP actuales no cambian. Fotos y comprobantes conservan sus permisos
y proteccion CSRF. Solo el logo corporativo sigue siendo publico por la API,
porque el login lo necesita. El navegador nunca recibe las claves de R2 ni una
URL publica del bucket. Los PDF leen los archivos a traves de esta misma capa.

## Configurar R2 y hPanel

1. En Cloudflare, habilitar R2 y crear un bucket dedicado, por ejemplo
   `unithor-produccion`. Revisar antes la facturacion de la cuenta.
2. Mantener deshabilitados el acceso publico `r2.dev` y los dominios publicos.
   No hace falta CORS en el bucket: es Node quien accede, no el navegador.
3. Crear credenciales S3 con permiso **Object Read & Write** limitado a ese
   bucket. Guardar el Access Key ID y el Secret Access Key en un gestor seguro.
   No usar el token general de la cuenta como Secret Access Key.
4. En las variables de entorno de la aplicacion Node de Hostinger, configurar:

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=unithor-produccion
S3_REGION=auto
S3_ACCESS_KEY_ID=<ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
S3_PREFIX=unithor
```

Usar exactamente el endpoint S3 que muestra Cloudflare para el bucket, incluido
un endpoint jurisdiccional si corresponde. No agregar el nombre del bucket a
la URL. No usar una direccion `r2.dev`.

Estas variables son solo del backend: **nunca** deben llevar prefijo `VITE_`,
guardarse en Git ni enviarse por chat. No cambiar las variables de MySQL/JWT.

5. Antes de habilitar trafico, ejecutar desde la raiz del proyecto, en el mismo
   entorno Node con esas variables:

```sh
npm run storage:check --workspace=api
```

El comando escribe, lee y borra un objeto temporal `_checks/`, comparando su
contenido. No modifica MySQL. El arranque de la API ademas verifica acceso al
bucket; si no funciona, no inicia el servidor. No hay fallback silencioso al
disco de una version de Hostinger. Esto exige configurar las variables **antes
de desplegar esta version**. Si hPanel no ofrece una consola/comando de
ejecucion, usar SSH si esta disponible o pedir a soporte que indique como
ejecutar el comando con el entorno de la app; no poner secretos en el comando
de compilacion ni en logs.

## Desarrollo y alternativa local

```dotenv
STORAGE_DRIVER=local
UPLOAD_DIR=./storage/uploads
```

`UPLOAD_DIR` relativo se resuelve desde el directorio de trabajo del proceso.
Se mantiene este comportamiento para no romper archivos existentes de
desarrollo. En produccion la configuracion rechaza rutas locales relativas y
rutas dentro de `hbuilds` o `public_html`. Una ruta absoluta local solo se debe
usar si el proveedor garantiza persistencia y acceso de escritura fuera del
despliegue. R2 evita depender de esa garantia.

No cambiar `S3_BUCKET` o `S3_PREFIX` despues de cargar archivos sin copiarlos
primero al nuevo destino: las claves de MySQL se resuelven usando esa ubicacion.

## Copiar archivos que todavia existan

No se recuperan fotos perdidas desde una referencia de MySQL. Buscar primero
respaldos del hosting o copias originales; no borrar referencias para ocultar
el problema.

Con `STORAGE_DRIVER=s3`, configurar `UPLOAD_DIR` con la ruta real de los archivos
anteriores. Conservar la estructura `work-orders/`, `payment-receipts/` y
`branding/`. El comando usa la base indicada por `DATABASE_URL`; verificar que
sea la correspondiente a esos archivos y hacer respaldo antes.

```sh
# Solo simula: lee las referencias y comprueba archivos locales y SHA-256.
npm run storage:migrate --workspace=api

# Copia a R2, verifica el contenido y conserva todos los originales locales.
npm run storage:migrate --workspace=api -- --apply

# Comprueba las referencias de MySQL contra el almacenamiento configurado.
npm run storage:audit --workspace=api
```

La simulacion no escribe en R2 ni modifica tablas. La copia es reanudable:
omite archivos identicos que ya existan en destino y rechaza sobrescribir
contenido diferente. Procesa referencias activas de fotos, comprobantes y
logo, no archivos huerfanos ni la carpeta de recuperacion. Los ausentes o los
fallos producen codigo de salida 1 y un resumen `missing/failed`. No interpretar
una migracion con errores como completa. Hacer el cambio con las cargas
pausadas; no activar lecturas de R2 hasta terminar la copia y auditoria.

## Recuperacion y respaldos

Al reemplazar/eliminar una foto o logo, o anular un pago, el archivo se mueve a
`unithor/_retained/AAAA-MM-DD/<UUID>/<clave-original>` en R2. Primero se copia y
solo despues se elimina la clave activa. Si la copia falla, el original no se
borra. En local se usa la misma estructura dentro de `UPLOAD_DIR`.

Los archivos de una transaccion rechazada se eliminan sin retencion, porque
nunca tuvieron una referencia confirmada. Si falla la limpieza se registra un
aviso y puede quedar un archivo huerfano; no se revierte un commit por ello.
La retencion no tiene purga automatica: ocupa espacio hasta que el operador
defina una politica. Si se configura una regla de expiracion, limitarla
estrictamente a `unithor/_retained/`, por ejemplo 90 dias. **Nunca** aplicarla a
las fotos activas. Cambiar este prefijo si se cambio `S3_PREFIX`.

Para recuperar: identificar la clave en la copia y en un respaldo de MySQL,
copiar los bytes a la clave original y restaurar la referencia correspondiente
si fue eliminada. La recuperacion es administrativa, no una URL publica ni un
boton implementado en la interfaz.

Esta retencion **no es un respaldo independiente**. Antes del uso real:

- Programar copias de MySQL y del bucket en otro destino/cuenta con credenciales
  independientes; conservar tambien `_retained/` y un inventario de archivos.
- Usar permisos de solo lectura para la cuenta que extrae los respaldos y no
  propagar automaticamente borrados al destino de respaldo.
- Probar una restauracion conjunta de datos y fotos. Vigilar espacio y costos.

Los respaldos externos, alertas y reglas del bucket no se crean automaticamente
con este cambio: requieren configurar la cuenta y el destino del respaldo.

## Prueba de aceptacion en produccion

1. Comprobar `storage:check`, subir fotos a una OT de prueba y un comprobante.
2. Revisar que las claves esten en el bucket privado, abrirlas desde la app y
   generar PDF de OT y COT. Confirmar que el comprobante exige iniciar sesion.
3. Volver a desplegar la aplicacion y abrir exactamente la misma OT y pago.
4. Comprobar que las imagenes siguen disponibles y ejecutar `storage:audit`.
5. Reemplazar una foto y verificar que la anterior queda en `_retained/`.

Un objeto ausente devuelve 404. Un problema de red, credenciales o proveedor
devuelve 503; no se trata como una imagen inexistente ni se guarda en disco.

## Referencias oficiales

- [SDK S3 de Node para R2](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Credenciales de R2](https://developers.cloudflare.com/r2/api/tokens/)
- [Precios y operaciones](https://developers.cloudflare.com/r2/pricing/)
- [Despliegues Node en Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
