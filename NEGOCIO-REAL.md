# Checklist Para Negocio Real

Este documento baja a tierra que falta para que Kiosco24 pase de piloto funcional a producto confiable para negocios reales.

La idea no es inflar alcance. La prioridad es mantener el sistema simple, rapido y entendible, mientras sube la confianza operativa.

## Criterio De Salida

Podemos decir que Kiosco24 esta listo para negocio real cuando cumple estas 5 condiciones:

1. El local puede operar todo el dia sin bloqueos ni dudas de caja.
2. El duenio puede recuperar datos o volver atras si algo sale mal.
3. Migrar desde otro sistema o desde Excel no da miedo.
4. Un error en produccion deja rastro claro y accionable.
5. Lo basico esta probado siempre antes de desplegar.

## Checklist Prioritario

### 1. Operacion diaria

- Login de duenio y empleado estable.
- Un turno activo por sucursal, con apertura, transferencia y cierre correctos.
- Ventas, gastos, retiros y fiados consistentes.
- Productos listos para venta solo cuando tengan precio, costo y stock.
- Scanner por camara y lectora USB suficientemente confiables para mostrador.
- Impresion `Ctrl+P` util y entendible en las pantallas clave.

### 2. Datos y recuperacion

- Backup de base completo, no solo catalogo.
- Restore probado al menos una vez en entorno controlado.
- Exportes simples para el duenio o contador.
- Plan de rollback documentado y utilizable sin improvisar.

### 3. Migracion y alta inicial

- Importador `CSV/Excel` para productos, variantes, stock y precios.
- Flujo de alta inicial rapido para que un kiosco arranque en menos de 1 hora.
- Catalogo base moderado y vivo con aportes de usuarios.

### 4. Confiabilidad tecnica

- `npm run verify:release` pasando siempre.
- `lint` sin errores y con warnings razonables.
- Smoke tests minimos de negocio automatizados.
- Monitoreo de errores frontend y backend.
- Auditoria basica de cambios importantes.

### 5. Soporte y uso real

- Guia corta de primer dia.
- Checklist de instalacion en local.
- Guia de “que hacer si algo falla”.
- Un canal simple para soporte inicial.

## Lo Que Ya Esta Bien

- Caja rapida y enfocada.
- Flujo de empleados simple.
- Turnos bastante alineados con la operatoria real.
- Alta por codigo de barras y catalogo global moderado.
- Build de produccion, typecheck y release check funcionando.

## Lo Que Falta De Verdad

Esto es lo que mas valor suma ahora mismo.

### Bloque 1: imprescindible

- Backup y restore completo.
- Importacion `CSV/Excel`.
- Smoke tests criticos.
- Monitoreo de errores.
- Auditoria minima.

### Bloque 2: muy importante

- Mejorar ayudas y onboarding de primer dia.
- Bajar warnings de hooks que quedaron.
- Limpiar los `<img>` importantes.
- Endurecer soporte a hardware y escenarios de poca conectividad.

### Bloque 3: despues del piloto

- Reportes mas lindos o mas profundos.
- Integraciones extras.
- Capas nuevas de permisos avanzados.
- Features menos usadas del long tail.

## Plan Realista

## Fase 0: hoy

Objetivo:

- Instalar en dos kioscos sin romper la simplicidad.

Entregables:

- Checklist de produccion cumplido.
- Smoke test manual completo.
- Duenio y empleados operando.
- Primeros productos, stock y turnos configurados.

No hacer hoy:

- Refactors grandes.
- Features nuevas no esenciales.
- Cambios profundos en caja.

## Fase 1: 3 a 5 dias

Objetivo:

- Proteger datos y detectar fallos temprano.

Entregables:

- Backup completo documentado.
- Restore de prueba ejecutado.
- Monitoreo de errores instalado.
- Registro basico de eventos criticos.
- Lista de fricciones reales del piloto.

## Fase 2: 1 semana

Objetivo:

- Reducir la barrera de entrada para nuevos negocios.

Entregables:

- Importador `CSV/Excel` para productos e inventario.
- Guia de alta inicial de un kiosco.
- Mejoras de onboarding segun feedback real.
- Limpieza de warnings mas sensibles.

## Fase 3: 2 semanas

Objetivo:

- Convertir el piloto en proceso repetible.

Entregables:

- Smoke tests automaticos de login, turno, venta, gasto, retiro, fiado y cierre.
- Auditoria minima de cambios.
- Exportes utiles para el negocio.
- Instalacion estandarizada para nuevos locales.

## Fase 4: 1 mes

Objetivo:

- Estar en condiciones de sumar mas kioscos sin depender de memoria o heroicidad.

Entregables:

- Flujo de soporte claro.
- Checklist operacional versionado.
- Importacion madura.
- Panel admin mas util para soporte y control.

## Regla De Prioridad

Si hay que elegir, hacer primero lo que aumenta estas 3 cosas:

1. Confianza del duenio.
2. Velocidad de puesta en marcha.
3. Capacidad de recuperacion ante errores.

Si una mejora no ayuda a ninguna de esas 3, probablemente no sea prioritaria ahora.

## Veredicto

Kiosco24 ya esta en etapa de piloto serio.

No necesita volverse mas grande antes de tiempo.
Necesita volverse mas confiable, mas migrable y mas repetible.

Ese es el camino mas realista para que un negocio del rubro lo sienta suyo.
