# Checklist De Produccion

Este documento concentra la pasada minima antes de instalar Kiosco24 en un local real.

Complemento recomendado:

- Ver [NEGOCIO-REAL.md](/c:/Users/eliel/kiosco24/NEGOCIO-REAL.md) para el checklist de madurez y el plan posterior al piloto.

## Estado Actual

Validado al 20/03/2026:

- `npm run typecheck`: OK
- `npm run lint`: OK, con `12 warnings` y `0 errores`
- `npm run verify:release`: OK
- `next build`: OK

Advertencia honesta:

- Los warnings restantes son principalmente de `react-hooks/exhaustive-deps` y algunos `<img>` sin migrar a `next/image`.
- No son bloqueantes para la instalacion de hoy, pero siguen siendo deuda tecnica de calidad.

## Previo Al Deploy

1. Confirmar rama y commit exactos a instalar.
2. Ejecutar `npm run typecheck`.
3. Ejecutar `npm run verify:release`.
4. Verificar que las variables de entorno productivas sigan completas y alineadas con `.env.example`.
5. Tomar backup real de la base de datos antes de desplegar.
6. Confirmar que `/api/health` responda OK despues del deploy.
7. Confirmar que el login cargue en ventana normal e incognito.

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

Resultado esperado:

- Si cualquiera de estos puntos falla, no instalar en el local hasta resolverlo.

## Instalacion En El Local

1. Confirmar acceso del dueno.
2. Confirmar acceso de empleados y enlace compartible.
3. Probar camara y, si aplica, lectora USB.
4. Probar impresion con `Ctrl+P` en las pantallas importantes.
5. Verificar sucursal correcta en caja.
6. Hacer una venta real de monto chico.
7. Confirmar apertura y cierre de turno en el dispositivo principal.

## Instalacion Express Por Local

Secuencia sugerida para cada kiosco:

1. Entrar como dueno.
2. Crear o confirmar sucursal correcta.
3. Configurar empleados y copiar el enlace directo de ingreso.
4. Cargar 3 a 5 productos reales que usen todos los dias.
5. Agregar precio, costo y stock a esos productos.
6. Probar una venta de efectivo.
7. Probar una venta de transferencia o MP.
8. Abrir turno con un empleado y vender desde ese usuario.
9. Transferir turno y validar bloqueo del empleado anterior.
10. Imprimir una pantalla clave con `Ctrl+P`.
11. Confirmar que el duenio sabe:
    - como abrir turno
    - como cerrar turno
    - como agregar stock
    - como suspender un empleado

Objetivo de salida:

- El kiosco debe poder operar aunque hoy no use todas las funciones.
- Lo importante es que caja, productos, stock y turnos queden claros y confiables.

## Rollback

Si algo falla en produccion:

1. Frenar el uso de la caja.
2. Volver al ultimo commit/deploy estable.
3. Restaurar base de datos solo si hubo corrupcion real de datos.
4. Repetir el smoke test minimo antes de reabrir el local.

## Riesgos Conocidos

- No hay smoke tests automaticos todavia.
- Quedan `12 warnings` no bloqueantes en hooks e imagenes.
- La integracion de facturacion fiscal no forma parte del alcance actual.
