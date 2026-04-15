# Plan de accion para reemplazar AfipSDK por zap-fiscal-core

Checklist operativo relacionado: `checklist_reemplazo_afipsdk_zap_fiscal.md`

## Resumen ejecutivo

Hoy Clikit **no esta listo** para reemplazar `@afipsdk/afip.js` por completo, pero el reemplazo ya tiene una base muy seria.

La conclusion despues de revisar ambos lados es esta:

- Clikit ya tiene armado el flujo operativo de facturacion, persistencia, historial, PDF, estados `PENDING/ISSUED/FAILED` y UX de reintento.
- `zap-fiscal-core/fiscal-worker` ya tiene una arquitectura correcta para ser el backend fiscal central: multi-tenant, API keys, certificados, Durable Object por CUIT, cola, circuit breaker, webhooks y soporte conceptual para Factura A/B/C/T y Nota de Credito.
- El problema no es la idea, sino el **estado de integracion**: hoy todavia hay piezas faltantes y algunas inconsistencias internas en el worker que impiden usarlo como reemplazo total sin una etapa previa de estabilizacion.

Mi recomendacion es hacer el reemplazo en **dos tracks en paralelo**:

1. Estabilizar `fiscal-worker` hasta que tenga contrato confiable.
2. Desacoplar Clikit de `AfipSDK` con una capa `FiscalProvider`, para que el cambio de backend no toque toda la app.

Decisiones ya cerradas:

- `afipAccessToken` deja de ser dependencia operativa y queda solo como legado temporal durante rollout.
- La estrategia correcta es `sync-first` con `async + webhook` como fallback.
- La idempotencia de negocio debe basarse en `sale.id`.
- El problema a resolver ya no es solo emitir, sino operar un sistema distribuido con consistencia eventual.

## Estado actual de Clikit

### Lo que hoy depende de AfipSDK

- `src/lib/fiscal-server.ts` crea la instancia de `Afip` y resuelve el `afipAccessToken`.
- `src/app/api/fiscal/invoice/route.ts` emite directo con `afip.ElectronicBilling.createNextVoucher(...)`.
- `src/app/api/fiscal/settings/route.ts` guarda y valida `afipAccessToken`.
- `src/app/(app)/[branchId]/configuracion/page.tsx` expone UI para cargar el token de AfipSDK.
- `prisma/schema.prisma` guarda `FiscalProfile.afipAccessToken`, `Invoice.afipRawResponse` y `Invoice.pdfAfipUrl`.

### Lo que Clikit ya tiene bien resuelto

- Estado de emision por venta con `PENDING`, `ISSUED` y `FAILED`.
- Historial y consulta de facturas.
- Reintento manual y liberacion de pendientes.
- Generacion de PDF local con `src/lib/fiscal-pdf.tsx`.
- Persistencia de CAE, fecha de vencimiento, punto de venta y raw response.
- Restriccion operativa actual: V1 solo `Factura C` y `Monotributo`.

### Implicancia para el reemplazo

Clikit no necesita que el worker genere PDF ni maneje la experiencia de usuario. Lo que si necesita es un backend fiscal que entregue de forma confiable:

- emision
- anulación / nota de credito
- consulta / reconciliacion
- setup de contribuyente, certificado y punto de venta
- webhooks firmados
- idempotencia real

## Estado actual de zap-fiscal-core

### Lo que ya esta implementado y sirve

En `C:\Users\eliel\zap-fiscal-core\fiscal-worker` ya existen:

- router principal en `src/index.ts`
- auth por `X-Api-Key` en `src/middleware/auth.ts`
- `Contributor`, `FiscalCertificate`, `WsaaToken`, `ContributorPointOfSale`, `TenantContributor`, `FiscalJob`, `IssuedVoucher` y `WebhookDelivery` en `prisma/schema.prisma`
- emision en `src/handlers/emit.ts`
- anulacion por nota de credito en `src/handlers/void.ts`
- Durable Object por CUIT en `src/durable-objects/FiscalAgent.ts`
- webhooks HMAC en `src/webhooks/sender.ts`
- circuit breaker ARCA en `src/services/circuitBreaker.ts`
- deploy en Cloudflare Workers con Queue + DO + KV en `wrangler.toml`

### Lo mas valioso del worker

El worker ya modela el problema correcto:

- el certificado vive en el worker y no en Clikit
- el token WSAA se cachea por CUIT
- la serializacion la hace un DO por CUIT
- hay concepto de `job`, `voucher`, webhook y reintento
- el proveedor fiscal deja de ser un SDK embebido en la app

Eso es exactamente la direccion que conviene.

## Brechas reales para reemplazar AfipSDK

### Brecha 1: el worker no esta listo como contrato publico completo

El plan del worker habla de endpoints como:

- `POST /v1/contributors/:cuit/points-of-sale`
- `GET /v1/contributors/:cuit/points-of-sale`
- `GET /v1/invoices/jobs/:jobId`
- `GET /v1/invoices/:voucherId`

Pero en la implementacion actual de `src/index.ts` no estan expuestos.

Sin esos endpoints, Clikit no puede:

- configurar PdV desde UI
- consultar un job pendiente
- reconciliar emisiones
- ver un comprobante emitido desde el worker

### Brecha 2: el flujo async del worker hoy esta roto

En `src/handlers/emit.ts` el modo async encola:

- `env.FISCAL_QUEUE.send({ jobId: job.id })`

Pero en `src/index.ts` el consumidor de queue solo procesa si recibe:

- `jobId`
- `cuit`

Como el mensaje actual no envia `cuit`, el queue consumer no dispara el DO.

Resultado:

- `sync=true` puede funcionar
- el modo async hoy no es confiable como camino principal

### Brecha 3: certificados modelados pero todavia no conectados al flujo real de emision

En `src/handlers/certificates.ts` se suben y cifran PEMs, pero en `src/durable-objects/FiscalAgent.ts` el metodo `getValidToken()` todavia no lee el certificado activo desde la DB.

Hoy hace esto:

- usa `CERT_ENCRYPTION_KEY_V1` como placeholder de cert y key
- deja un `TODO` para cargar y descifrar el certificado real

Hasta que eso no se conecte, el worker no reemplaza de verdad a AfipSDK en produccion.

### Brecha 4: setup de Contributor/PdV todavia inconsistente

`src/handlers/contributors.ts` crea un `TenantContributor` con:

- `pointOfSaleId: 'pending'`

Pero `TenantContributor.pointOfSaleId` en schema referencia una entidad real.

Eso sugiere que el flujo de alta de contribuyente y asignacion de PdV todavia no esta cerrado.

### Brecha 5: inconsistencias entre codigo y schema

Hay varias que conviene corregir antes de integrar Clikit:

- `src/handlers/certificates.ts` usa estado `INACTIVE`, pero `CertStatus` en schema no lo define.
- `src/cron/certWatcher.ts` tambien usa `INACTIVE`.
- `src/durable-objects/FiscalAgent.ts` crea y actualiza `webhookDelivery` con campos como `eventId`, `url`, `attempts`, `responseCode`, `lastError`, `nextAttemptAt`, pero el schema de `WebhookDelivery` no coincide con todos esos nombres.
- `src/durable-objects/FiscalAgent.ts` usa `voidedByVoucherId: 'PLACEHOLDER'` antes de corregir la relacion real.

No son detalles cosmeticos. Son puntos que pueden bloquear runtime, persistencia o reconciliacion.

### Brecha 6: coverage de tests insuficiente

El test actual `test/index.spec.ts` sigue siendo el template de "Hello World", asi que no hay cobertura real para:

- emision sync
- emision async
- idempotencia
- webhook firmado
- circuit breaker
- nota de credito
- certificados

### Brecha 7: drift entre lo desplegado y el repo local

El root de `arca.zap.com.ar` responde `200 OK` y reporta servicio operativo, pero el metadata observado en el deploy no coincide del todo con el codigo local.

Eso sugiere posible drift entre:

- lo desplegado
- el repo local
- el plan del worker

Antes del corte conviene congelar una version exacta del contrato.

## Que falta del lado de Clikit

Aunque el worker quede bien, Clikit necesita cambios propios para soltar AfipSDK sin dolor.

### 1. Capa de abstraccion fiscal

Hoy Clikit llama directo a AfipSDK.

Hay que extraer una interfaz tipo:

```ts
type FiscalProvider = {
  emitInvoice(input: EmitInvoiceInput): Promise<EmitInvoiceResult>;
  voidInvoice(input: VoidInvoiceInput): Promise<VoidInvoiceResult>;
  getJob(input: GetFiscalJobInput): Promise<GetFiscalJobResult>;
  getVoucher(input: GetVoucherInput): Promise<GetVoucherResult>;
  getStatus(): Promise<FiscalProviderStatus>;
};
```

Con eso, el route de Clikit deja de saber si abajo hay:

- AfipSDK
- zap-fiscal-core

### 2. Nuevo modelo de configuracion fiscal

`FiscalProfile.afipAccessToken` tiene que dejar de ser el centro del setup.

Clikit deberia pasar a guardar:

- `fiscalProvider` (`AFIPSDK` o `ZAP_FISCAL`)
- `workerContributorCuit`
- `workerEnvironment`
- `workerPointOfSale`
- estado de onboarding fiscal
- metadatos de ultimo sync con worker

La API key del worker no deberia quedar por kiosco; conviene manejarla como secreto del backend de Clikit.

### 3. Webhook receptor en Clikit

Clikit necesita un endpoint nuevo, por ejemplo:

- `POST /api/fiscal/webhook`

Ese endpoint tiene que:

- validar HMAC
- resolver `jobId` / `externalId`
- actualizar `Invoice`
- persistir `voucherId`, `cae`, `caeFchVto`, `rawResponse`, observaciones
- regenerar PDF local
- dejar trazabilidad idempotente

### 4. Nuevos campos de correlacion

La tabla `Invoice` hoy esta pensada para respuesta directa de AfipSDK.

Conviene agregar al menos:

- `provider`
- `workerJobId`
- `workerVoucherId`
- `externalId`
- `idempotencyKey`
- `providerRawResponse`
- `providerObservations`

`afipRawResponse` puede quedar temporalmente por compatibilidad, pero ya queda chico si el proveedor pasa a ser el worker.

### 5. Reconciliacion de pendientes

Hoy Clikit libera pendientes manualmente.

Con worker conviene cambiar la estrategia a:

- poll por `jobId`
- webhook signed
- accion administrativa de reconciliacion

La pantalla de facturas deberia poder diferenciar:

- pendiente local
- pendiente en worker
- emitida en worker pero no aplicada en Clikit

### 6. Flujo de devolucion / nota de credito

Si el objetivo es reemplazo total, hay que cerrar tambien el flujo inverso.

Clikit hoy ya reconoce que una venta facturada no se corrige sin nota de credito, pero todavia no tiene el flujo comercial completo.

Con worker disponible, el plan correcto es:

- devolucion comercial en Clikit
- reposicion de stock
- ajuste de caja / medio de pago
- llamada a `/v1/invoices/void`
- enlace entre comprobante original y NC

## Contrato minimo que debe existir para conectar Clikit

Antes de tocar produccion, este deberia ser el contrato minimo estable de `zap-fiscal-core`:

- `GET /v1/status/arca`
- `POST /v1/contributors`
- `GET /v1/contributors/:cuit`
- `POST /v1/contributors/:cuit/points-of-sale`
- `GET /v1/contributors/:cuit/points-of-sale`
- `POST /v1/contributors/:cuit/certificate`
- `GET /v1/contributors/:cuit/certificate`
- `POST /v1/invoices/emit?sync=true`
- `POST /v1/invoices/emit`
- `GET /v1/invoices/jobs/:jobId`
- `GET /v1/invoices/:voucherId`
- `POST /v1/invoices/void`

Respuesta minima para emision:

- `jobId`
- `status`
- `externalId`
- `voucherId`
- `voucherType`
- `voucherNumber`
- `cae`
- `caeFchVto`
- `issuedAt`
- `pointOfSale`
- `rawResponse`
- `observations`

## Plan de accion recomendado

### Fase 0 - Congelar contrato y version

- Elegir una unica fuente de verdad para el contrato del worker.
- Alinear repo local, deploy de `arca.zap.com.ar` y documentacion.
- Versionar el contrato (`v1`) y no seguir integrando sobre supuestos.

### Fase 1 - Estabilizar fiscal-worker

Objetivo: que el worker pueda ser usado de forma confiable por una app externa.

Checklist minimo:

- corregir queue payload async para incluir `cuit` o resolverlo server-side
- implementar endpoints reales de `points-of-sale`
- implementar `GET /v1/invoices/jobs/:jobId`
- implementar `GET /v1/invoices/:voucherId`
- conectar `getValidToken()` con el certificado activo real
- corregir estados de certificados (`INACTIVE` vs schema)
- corregir persistencia de `WebhookDelivery`
- eliminar placeholders en flujo de `void`
- agregar tests reales de emision, void, webhook e idempotencia

### Fase 2 - Desacoplar Clikit de AfipSDK

Objetivo: que Clikit pueda cambiar de proveedor sin reescribir el flujo fiscal entero.

Cambios:

- crear interfaz `FiscalProvider`
- mover implementacion actual a un `AfipSdkFiscalProvider`
- crear `ZapFiscalProvider`
- hacer que `src/app/api/fiscal/invoice/route.ts` dependa del provider y no del SDK

Con esto se puede migrar por feature flag.

### Fase 3 - Nuevo onboarding fiscal en Clikit

Objetivo: sacar el token de AfipSDK del flujo de configuracion.

Cambios:

- reemplazar UI de token por onboarding de worker
- alta o sync de contributor
- carga de certificado
- seleccion o alta de punto de venta
- healthcheck de ARCA y validacion `dryRun`

Secrets sugeridos en Clikit:

- `ZAP_FISCAL_BASE_URL`
- `ZAP_FISCAL_API_KEY`
- `ZAP_FISCAL_WEBHOOK_SECRET`
- `FISCAL_PROVIDER`

### Fase 4 - Emision via worker con compatibilidad

Objetivo: emitir por worker sin romper el flujo actual.

Estrategia:

- mantener PDF local en Clikit
- emitir con `sync=true` cuando la UX necesite respuesta inmediata
- si el worker responde `202`, persistir `PENDING` con `workerJobId`
- aplicar resultado via webhook o reconciliacion

Idempotencia recomendada:

- `externalId = sale.id`
- `idempotencyKey = branchId:saleId:invoice:v1`

### Fase 5 - Reconciliacion y observabilidad

Objetivo: que soporte pueda resolver casos ambiguos sin tocar DB a mano.

Agregar en Clikit:

- endpoint webhook firmado
- vista de jobs pendientes
- boton de reconciliar job
- logs correlacionados por `saleId`, `invoiceId`, `jobId`, `voucherId`

Agregar en worker:

- consulta por job
- consulta por voucher
- dashboard interno consistente

### Fase 6 - Nota de credito y devoluciones

Objetivo: reemplazo total, no solo emision.

Cambios:

- flujo de devolucion comercial en Clikit
- llamada a `/v1/invoices/void`
- persistencia del comprobante anulador
- union entre original y NC
- reposicion de stock y movimiento de caja

### Fase 7 - Corte final

Objetivo: sacar AfipSDK del runtime principal.

Orden recomendado:

1. TEST con kioscos internos
2. PROD con 1-3 kioscos piloto
3. habilitar `ZapFiscalProvider` por feature flag
4. monitorear pendientes, CAEs y webhooks
5. desactivar alta de nuevos tokens AfipSDK
6. remover `@afipsdk/afip.js`
7. deprecar `afipAccessToken`

## Prioridades practicas para arrancar ya

Si mañana quisieramos avanzar de forma concreta, yo haria esto:

1. Corregir `fiscal-worker` hasta dejar operativo el camino `emit sync + emit async + get job + points of sale + cert real`.
2. Crear en Clikit la interfaz `FiscalProvider` y mover ahi la integracion actual con AfipSDK.
3. Agregar en Clikit el webhook receptor y los campos de correlacion (`workerJobId`, `workerVoucherId`, `externalId`, `idempotencyKey`).
4. Reemplazar la UI de token por onboarding fiscal basado en contributor/certificado/PdV.
5. Recien despues hacer piloto de emision real por worker.

## Veredicto

`zap-fiscal-core` va en la direccion correcta y tiene potencial real para reemplazar `AfipSDK`, pero **todavia no esta en estado drop-in**.

El reemplazo completo es viable si primero hacemos:

- una etapa corta de estabilizacion del worker
- una capa de abstraccion en Clikit
- un flujo serio de webhook + reconciliacion

Si hacemos eso, el resultado final mejora mucho la arquitectura:

- Clikit deja de depender de un SDK fiscal embebido
- certificados y WSAA salen de la app comercial
- el proveedor fiscal queda centralizado
- emitir, anular y auditar pasa a ser un servicio transversal
