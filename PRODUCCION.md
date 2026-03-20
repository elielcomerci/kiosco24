# Checklist De Produccion

Este documento concentra la pasada minima antes de instalar Kiosco24 en un local real.

## Previo Al Deploy

1. Confirmar rama y commit exactos a instalar.
2. Ejecutar `npm run typecheck`.
3. Ejecutar `npm run verify:release`.
4. Verificar que las variables de entorno productivas sigan completas y alineadas con `.env.example`.
5. Tomar backup real de la base de datos antes de desplegar.

Nota:
- El backup dentro de `/admin/productos` cubre el catalogo global de productos.
- El backup de la base operativa completa debe hacerse desde la base/hosting.

## Smoke Test Sagrado

Hacer esta pasada completa en una sucursal de prueba o en un entorno ya desplegado antes de instalar:

1. Ingresar como dueno.
2. Ingresar como empleado por enlace/codigo.
3. Abrir turno.
4. Registrar una venta en efectivo.
5. Registrar una venta con transferencia o Mercado Pago.
6. Registrar una venta fiada.
7. Registrar un gasto.
8. Registrar un retiro.
9. Transferir turno a otro empleado.
10. Confirmar que el empleado anterior queda bloqueado para operar.
11. Cerrar turno y revisar que el esperado sea coherente.
12. Crear un producto nuevo por barcode.
13. Agregar stock y confirmar que aparezca en caja solo cuando queda listo.
14. Suspender un empleado y confirmar que no pueda volver a operar.
15. Bloquear y desbloquear el kiosco desde `/admin`.

## Instalacion En El Local

1. Confirmar acceso del dueno.
2. Confirmar acceso de empleados y enlace compartible.
3. Probar camara y, si aplica, lectora USB.
4. Probar impresion con `Ctrl+P` en las pantallas importantes.
5. Verificar sucursal correcta en caja.
6. Hacer una venta real de monto chico.
7. Confirmar apertura y cierre de turno en el dispositivo principal.

## Rollback

Si algo falla en produccion:

1. Frenar el uso de la caja.
2. Volver al ultimo commit/deploy estable.
3. Restaurar base de datos solo si hubo corrupcion real de datos.
4. Repetir el smoke test minimo antes de reabrir el local.

## Riesgos Conocidos

- `npm run lint` hoy sigue siendo ruidoso y no funciona como guardrail de release.
- No hay smoke tests automaticos todavia.
- La integracion de facturacion fiscal no forma parte del alcance actual.
