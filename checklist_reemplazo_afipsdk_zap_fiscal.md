# Checklist completo de reemplazo AfipSDK -> zap-fiscal-core

## Referencias verificadas

Este checklist se armó chequeando estas fuentes:

- `C:\Users\eliel\zap-fiscal-core\fiscal-worker-plan.md`
- `C:\Users\eliel\kiosco24\plan_reemplazo_afipsdk_zap_fiscal.md`
- `C:\Users\eliel\kiosco24\src\app\api\fiscal\invoice\route.ts`
- `C:\Users\eliel\kiosco24\src\app\api\fiscal\settings\route.ts`
- `C:\Users\eliel\kiosco24\src\components\fiscal\InvoiceModal.tsx`
- `C:\Users\eliel\kiosco24\prisma\schema.prisma`

## Estado base

### Ya validado

- [x] `fiscal-worker` ya emite transacciones reales contra AFIP/ARCA sin problemas, segun estado operativo actual.
- [x] Clikit ya tiene flujo operativo de emision, historial, PDF y estados `PENDING` / `ISSUED` / `FAILED`.
- [x] Clikit ya bloquea ticket si hay factura emitida y ya reconoce la necesidad de nota de credito para corregir.
- [x] El worker ya tiene contrato base para emision, anulacion, certificados, auth por API key, webhooks y status ARCA en su plan y en su implementacion parcial.

### Decisiones cerradas

- [x] `afipAccessToken` deja de ser dependencia operativa y queda solo como legado temporal durante rollout.
- [x] La estrategia principal sera `sync=true`.
- [x] La resiliencia se resuelve con `async + webhook` como fallback.
- [x] La idempotencia de negocio se basa en `sale.id`.
- [x] El problema arquitectonico a resolver es consistencia eventual, no solo cambio de proveedor.

### Aun no resuelto como reemplazo total

- [ ] Clikit todavia emite directo con `AfipSDK`.
- [ ] Clikit todavia configura `afipAccessToken` propio.
- [ ] Clikit todavia no consume el worker como proveedor fiscal principal.
- [ ] Clikit todavia no tiene webhook receptor firmado para aplicar resultados del worker.
- [ ] Clikit todavia no tiene reconciliacion formal por `jobId` / `voucherId`.
- [ ] El reemplazo de devoluciones con Nota de Credito no esta cerrado de punta a punta en Clikit.

## Bloque A - Contrato funcional minimo

- [ ] Congelar contrato `v1` del worker y declarar una única fuente de verdad entre deploy, repo y plan.
- [x] Confirmar camino principal: `sync=true`.
- [x] Confirmar fallback: `async + webhook` cuando haya timeout, `202` o respuesta ambigua.
- [ ] Confirmar que el worker expone establemente:
- [ ] `GET /v1/status/arca`
- [ ] `POST /v1/invoices/emit`
- [ ] `POST /v1/invoices/emit?sync=true`
- [ ] `POST /v1/invoices/emit?dryRun=true`
- [ ] `POST /v1/invoices/void`
- [ ] `GET /v1/invoices/jobs/:jobId`
- [ ] `GET /v1/invoices/:voucherId`
- [ ] `POST /v1/contributors`
- [ ] `GET /v1/contributors/:cuit`
- [ ] `POST /v1/contributors/:cuit/certificate`
- [ ] `GET /v1/contributors/:cuit/certificate`
- [ ] `POST /v1/contributors/:cuit/points-of-sale`
- [ ] `GET /v1/contributors/:cuit/points-of-sale`
- [ ] Confirmar payload minimo de exito para emision:
- [ ] `jobId`
- [ ] `status`
- [ ] `externalId`
- [ ] `voucherId`
- [ ] `voucherType`
- [ ] `voucherNumber`
- [ ] `cae`
- [ ] `caeFchVto`
- [ ] `issuedAt`
- [ ] `pointOfSale`
- [ ] `rawResponse`
- [ ] `observations`

## Bloque B - Worker listo para integración externa

### Emision y jobs

- [ ] Validar `sync=true` end-to-end en TEST.
- [ ] Validar `sync=true` end-to-end en PROD.
- [ ] Validar modo async end-to-end con Queue real.
- [ ] Confirmar que el mensaje Queue -> DO incluye lo necesario para procesar el job.
- [ ] Confirmar idempotencia real con doble submit del mismo payload.
- [ ] Confirmar retry de error recuperable sin duplicar comprobante.
- [ ] Confirmar que timeout de ARCA no deja jobs colgados sin reintento.
- [ ] Confirmar que `GET /v1/invoices/jobs/:jobId` refleja estados reales del job.
- [ ] Confirmar que `GET /v1/invoices/:voucherId` devuelve el comprobante emitido y sus metadatos.
- [ ] Confirmar que el worker acepta `externalId = sale.id` como correlacion estable de negocio.
- [ ] Confirmar restriccion unica efectiva para evitar doble emision por venta.
- [ ] Recomendada: `UNIQUE(externalId, cuit, pointOfSale)` o equivalente semantico estable en worker.

### Certificados y autenticación fiscal

- [ ] Confirmar que el worker usa el certificado activo real desde DB para WSAA.
- [ ] Confirmar que ya no quedan placeholders de certificado/key en el flujo de emision.
- [ ] Confirmar upload, activacion y rotacion de certificado en TEST.
- [ ] Confirmar upload, activacion y rotacion de certificado en PROD.
- [ ] Confirmar reset de sesion del DO luego de cambio de certificado.
- [ ] Confirmar que el estado de certificados del código coincide con el schema.
- [ ] Confirmar que no hay drift entre estados `ACTIVE`, `PENDING_PROPAGATION`, `EXPIRED`, `REVOKED` y los usados en handlers/cron.

### Puntos de venta y contribuyentes

- [ ] Confirmar alta de contributor sin valores placeholder no validos.
- [ ] Confirmar registro real de `ContributorPointOfSale`.
- [ ] Confirmar asignacion consistente de `TenantContributor.pointOfSaleId`.
- [ ] Confirmar lectura de PdV activos por CUIT y entorno.
- [ ] Confirmar que Clikit puede descubrir o seleccionar el PdV correcto sin intervención manual fuera de flujo.

### Webhooks y observabilidad

- [ ] Confirmar firma HMAC documentada y estable.
- [ ] Confirmar reintentos de webhook con backoff.
- [ ] Confirmar persistencia consistente de `WebhookDelivery` con schema real.
- [ ] Confirmar dashboard interno o endpoints internos para soporte.
- [ ] Confirmar `/health` operativo.
- [ ] Confirmar `/v1/status/arca` operativo sin auth.
- [ ] Confirmar logs estructurados suficientes para correlacionar job, CUIT y voucher.

### Anulaciones

- [ ] Confirmar `POST /v1/invoices/void` en TEST.
- [ ] Confirmar `POST /v1/invoices/void` en PROD.
- [ ] Confirmar creación correcta de NC A/B/C según comprobante original.
- [ ] Confirmar vínculo persistente entre comprobante original y NC.
- [ ] Confirmar idempotencia de anulaciones.
- [ ] Confirmar unicidad por `originalVoucherId` para evitar doble anulación.
- [ ] Alinear semántica interna: `void` es abstracción API, pero la operación real es `createCreditNote(originalVoucher)`.

### Calidad y despliegue

- [ ] Reemplazar el test template actual por tests reales.
- [ ] Cubrir con tests:
- [ ] emision sync
- [ ] emision async
- [ ] idempotencia
- [ ] webhook firmado
- [ ] circuit breaker
- [ ] void / NC
- [ ] upload y activacion de certificado
- [ ] Confirmar que el deploy de `arca.zap.com.ar` coincide con la versión del repo que se integrará.

## Bloque C - Desacople de Clikit de AfipSDK

### Provider abstraction

- [ ] Crear interfaz `FiscalProvider` en Clikit.
- [ ] Mantener `FiscalProvider` mínimo.
- [ ] Superficie recomendada:
- [ ] `emit()`
- [ ] `void()`
- [ ] `getStatus()`
- [ ] Crear `AfipSdkFiscalProvider` como adapter del flujo actual.
- [ ] Crear `ZapFiscalProvider` para hablar con el worker.
- [ ] Mover la lógica fiscal de `src/app/api/fiscal/invoice/route.ts` a providers.
- [ ] Hacer que el route fiscal dependa del provider elegido y no del SDK.
- [ ] Agregar feature flag o configuración de proveedor activo.

### Configuración fiscal

- [ ] Definir nuevo modelo de configuración fiscal para worker.
- [ ] Agregar campos de configuración requeridos:
- [ ] `fiscalProvider`
- [ ] `workerContributorCuit`
- [ ] `workerEnvironment`
- [ ] `workerPointOfSale`
- [ ] `workerOnboardingStatus`
- [ ] `workerLastSyncAt`
- [ ] Mantener `afipAccessToken` solo como campo legado temporal.
- [ ] Sacar la dependencia operativa de `afipAccessToken` en `src/app/api/fiscal/settings/route.ts`.
- [ ] Reemplazar la UI de token en `src/app/(app)/[branchId]/configuracion/page.tsx` por onboarding de worker.
- [ ] Definir onboarding de PdV con default automático y override manual obligatorio.
- [ ] Definir secretos backend:
- [ ] `ZAP_FISCAL_BASE_URL`
- [ ] `ZAP_FISCAL_API_KEY`
- [ ] `ZAP_FISCAL_WEBHOOK_SECRET`
- [ ] `FISCAL_PROVIDER`

## Bloque D - Modelo de datos de Clikit

### Invoice

- [ ] Extender `Invoice` en `prisma/schema.prisma`.
- [ ] Agregar:
- [ ] `provider`
- [ ] `workerJobId`
- [ ] `workerVoucherId`
- [ ] `externalId`
- [ ] `idempotencyKey`
- [ ] `providerRawResponse`
- [ ] `providerObservations`
- [ ] Definir índices para búsqueda por `workerJobId`, `workerVoucherId` y `externalId`.
- [ ] Mantener `afipRawResponse` mientras dure la migración.
- [ ] Evaluar si `pdfAfipUrl` sigue teniendo sentido o queda definitivamente legacy.

### Persistencia de estados

- [x] Redefinir el significado de estado local: ya no es “todavía no emití”, sino “pedí emisión y sigo esperando confirmación externa”.
- [ ] Definir estados locales explícitos:
- [ ] `DRAFT`
- [ ] `REQUESTED`
- [ ] `CONFIRMED`
- [ ] `FAILED`
- [ ] Definir estados remotos explícitos:
- [ ] `QUEUED`
- [ ] `PROCESSING`
- [ ] `DONE`
- [ ] `ERROR`
- [ ] Definir mapeo UI estable:
- [ ] `REQUESTED` -> UI `PENDING`
- [ ] worker `DONE` -> `ISSUED`
- [ ] worker `ERROR` -> `FAILED`
- [ ] Confirmar transición `REQUESTED` -> `CONFIRMED` vía sync o webhook.
- [ ] Confirmar transición `REQUESTED` -> `FAILED` vía error terminal o reconciliación negativa.
- [ ] Definir política de liberación manual cuando el worker no confirma.

## Bloque E - Cliente del worker en Clikit

- [ ] Crear `src/lib/fiscal-worker-client.ts`.
- [ ] Implementar cliente para:
- [ ] emitir
- [ ] dry run
- [ ] consultar job
- [ ] consultar voucher
- [ ] anular
- [ ] consultar estado ARCA
- [ ] mapear `Sale` / `Branch` / `Invoice` al contrato del worker.
- [ ] usar `externalId = sale.id`.
- [x] Usar `externalId = sale.id` como identificador estable de negocio.
- [x] Usar `idempotencyKey` determinístico basado en `sale.id`.
- [ ] Definir fórmula concreta recomendada:
- [ ] `idempotencyKey = hash(sale.id)`
- [ ] Asegurar que la key no dependa de datos mutables.
- [ ] centralizar manejo de errores y respuestas ambiguas.
- [ ] registrar logs locales con correlación `saleId` / `invoiceId` / `jobId`.

## Bloque F - Webhook receptor en Clikit

- [ ] Crear `POST /api/fiscal/webhook`.
- [ ] Verificar firma HMAC.
- [ ] Verificar timestamp si el contrato lo soporta.
- [ ] Crear tabla de recepción idempotente de eventos.
- [ ] Propuesta mínima:
- [ ] `WebhookEvent`
- [ ] `eventId` único
- [ ] `jobId`
- [ ] `receivedAt`
- [ ] Ignorar eventos ya aplicados retornando `200`.
- [ ] Resolver job por `jobId`.
- [ ] Resolver factura por `externalId` o `saleId`.
- [ ] Hacer upsert o update idempotente, nunca `create` ciego.
- [ ] Persistir:
- [ ] `workerJobId`
- [ ] `workerVoucherId`
- [ ] `cae`
- [ ] `caeFchVto`
- [ ] `comprobanteTipo`
- [ ] `comprobanteNro`
- [ ] `puntoDeVenta`
- [ ] `providerRawResponse`
- [ ] `providerObservations`
- [ ] Regenerar PDF local cuando llegue emisión exitosa.
- [ ] Responder `200` de forma consistente para evitar retries innecesarios cuando ya se aplicó.
- [ ] Registrar idempotencia de recepción del webhook.

## Bloque G - Emisión desde caja y UX

- [ ] Reemplazar el submit de `InvoiceModal` en `src/components/fiscal/InvoiceModal.tsx` para que use el provider y no asuma respuesta directa tipo AfipSDK.
- [ ] Soportar respuesta sync con comprobante inmediato.
- [ ] Soportar respuesta `202` con job pendiente.
- [ ] Mostrar estado claro:
- [ ] "emitiendo"
- [ ] "pendiente en worker"
- [ ] "emitida"
- [ ] "fallida"
- [ ] Mantener descarga de PDF desde Clikit.
- [ ] Mantener WhatsApp desde Clikit.
- [ ] Ajustar mensajes de error para referir a worker/job y no solo a AFIP.

## Bloque H - Reconciliación y soporte

- [ ] Agregar acción administrativa para consultar job por `workerJobId`.
- [ ] Agregar acción para rehidratar una factura local desde `voucherId`.
- [x] Tratar reconciliación como capacidad obligatoria de soporte, no como extra.
- [ ] Agregar vista o filtros de facturas:
- [ ] pendientes locales
- [ ] pendientes en worker
- [ ] emitidas no reconciliadas
- [ ] fallidas terminales
- [ ] Registrar auditoría de reintentos manuales.
- [ ] Definir playbook de soporte para:
- [ ] job creado pero sin webhook
- [ ] webhook recibido pero factura no actualizada
- [ ] job `DONE` y Clikit `PENDING`
- [ ] job `FAILED` y Clikit `PENDING`
- [ ] job `REQUESTED` local con timeout y voucher existente en worker

## Bloque I - Devoluciones y Nota de Crédito en Clikit

- [ ] Diseñar flujo de devolución comercial desde historial de tickets/facturas.
- [ ] Reponer stock correctamente.
- [ ] Ajustar caja o medio de pago devuelto.
- [ ] Llamar a `POST /v1/invoices/void`.
- [ ] Persistir comprobante anulador en Clikit.
- [ ] Vincular factura original con NC.
- [ ] Reflejar estado en historial y preview fiscal.
- [ ] Validar flujo completo en TEST.
- [ ] Validar flujo completo en PROD con caso controlado.

## Bloque J - Migración y rollout

### Preparación

- [ ] Ejecutar migraciones de DB de Clikit.
- [ ] Cargar secretos del worker en entorno de Clikit.
- [ ] Preparar feature flag para cambiar proveedor por branch o kiosco.
- [ ] Mantener `AfipSDK` como fallback temporal.
- [ ] Mantener `FISCAL_PROVIDER=afip | zap` como bandera simple al inicio.

### Piloto

- [ ] Habilitar `ZapFiscalProvider` solo en TEST interno.
- [ ] Validar venta -> emisión -> webhook -> PDF -> historial.
- [ ] Validar timeout / respuesta ambigua.
- [ ] Validar reconciliación manual.
- [ ] Habilitar piloto PROD en 1 kiosco.
- [ ] Monitorear 48-72 horas.
- [ ] Habilitar piloto PROD en 3 kioscos.

### Corte

- [ ] Desactivar alta de nuevos `afipAccessToken`.
- [ ] Migrar kioscos activos al worker.
- [ ] Mantener fallback por ventana acotada.
- [ ] Confirmar que no quedan ventas nuevas emitidas con `AfipSDK`.
- [ ] Remover `@afipsdk/afip.js` de `package.json`.
- [ ] Deprecar definitivamente `src/lib/fiscal-server.ts`.
- [ ] Limpiar UI y API legacy de token AfipSDK.

## Bloque K - Criterio de "listo"

El reemplazo puede considerarse realmente completo cuando se cumplan estas condiciones:

- [ ] Clikit ya no llama directo a `AfipSDK` para emitir.
- [ ] Clikit ya no necesita `afipAccessToken` para operar fiscalmente.
- [ ] Toda emisión nueva pasa por `zap-fiscal-core`.
- [ ] Toda anulación fiscal pasa por `zap-fiscal-core`.
- [ ] Los resultados se aplican por sync o webhook firmado e idempotente.
- [ ] Hay reconciliación por `jobId` y `voucherId`.
- [ ] El PDF sigue siendo local en Clikit.
- [ ] Soporte puede resolver casos ambiguos sin tocar DB a mano.
- [ ] `AfipSDK` puede eliminarse del runtime principal.

## Orden recomendado de ejecución

1. Cerrar contrato y endpoints del worker.
2. Crear `FiscalProvider` en Clikit.
3. Extender schema `Invoice`.
4. Implementar `FiscalWorkerClient`.
5. Implementar webhook receptor.
6. Migrar emisión de `InvoiceModal` y route fiscal.
7. Implementar reconciliación.
8. Implementar devoluciones con NC.
9. Hacer piloto y corte.
