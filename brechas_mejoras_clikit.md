# Análisis de Brechas y Mejoras para Clikit (Nivel Enterprise)

Tras revisar el documento actual del estado de Clikit (`quehaceclikit.md`), el sistema tiene una base sólida y cubre la operativa crítica diaria. Sin embargo, para escalar a un estándar **"Enterprise"** (propio de cadenas, grandes minimarkets o sistemas de alta confiabilidad), existen algunas **brechas operativas y de seguridad** que se pueden pulir en diferentes áreas del negocio.

Aquí detallo la lista concreta de fallas detectadas, por qué afectan al negocio y la solución óptima para cada caso.

---

## 1. Seguridad en las Anulaciones de Caja (Flujo / Seguridad)

**🔴 Qué Falla:** Un cajero puede escanear productos y luego eliminarlos del carrito (anulación de línea parcial) mientras el ticket está abierto, sin dejar ningún rastro sistémico rastreable.
**🤔 Por qué es un problema:** Es la modalidad de "robo hormiga" más común en mostradores. El cajero pasa los ítems, el cliente ve el monto total en el visor, entrega el efectivo y en ese segundo el empleado borra 1 producto (el más caro), cerrando la venta por menor dinero. El saldo del ticket le cuadra en la caja porque la diferencia se la guarda. El stock baja silenciosamente ya que al fallar el control nadie se da cuenta hasta meses después.
**✅ Mejor Opción:** Crear un **"Log de Anulaciones en Caja"**. Todo ítem eliminado del punto de venta temporal (luego de ser ingresado), debe guardarse en background en una tabla. En el panel de estadísticas, el encargado debe acceder a un listado de "Borrados", filtrando por qué productos borra más cada empleado, identificando desviaciones.

## 2. Arqueo y Declaración Ciega (Flujo / Seguridad)

**🔴 Qué Falla:** Al momento de hacer el cierre de turno y arqueo, el sistema le enuncia explícitamente al empleado cuánta plata debería haber (Ej: "Efectivo esperado: $24,500").
**🤔 Por qué es un problema:** Si el responsable sabe qué número debe "clavar", los sobrantes de dinero (errores al cobrar a favor del negocio) mágicamente desaparecen en sus bolsillos. En el sector corporativo, al cajero nunca se le dice cuánto debería dar.
**✅ Mejor Opción:** Implementar **"Cierre Ciego"**. El sistema solo le pregunta al cajero: "¿Cuánta plata contaste físicamente en el cajón?". El empleado ingresa el número o la cantidad de billetes, y finaliza. La diferencia real (faltante o sobrante) **solo la analiza y la aprueba el administrador/gerente luego**.

## 3. Límites de Riesgo en Fiados (Finanzas / Funcional)

**🔴 Qué Falla:** El Módulo de Fiados cuenta con gestión de cuenta corriente, saldos totales y cobros, pero depende 100% del umbral de dolor subjetivo del empleado para decidir si continuar fiando.
**🤔 Por qué es un problema:** Si no existen límites duros en un sistema de fiado, se pueden cargar créditos impagables a clientes (por amiguismo o error) destruyendo el capital de giro de la semana e incobrables altísimos.
**✅ Mejor Opción:** Agregar un campo opcional **`Límite de Crédito`** en el Perfil de cada Cliente. Si el saldo actual sumado a un nuevo fiado en caja quiere rebasar ese tope, el sistema tira un "bloqueo suave" y pide obligatoriamente un PIN de administrador/encargado para autorizar la excepción de límite.

## 4. Devoluciones y Notas de Crédito (Funcional / Fiscal)

**🔴 Qué Falla:** El diseño habla de emitir "Factura C" y "Tickets", pero no detalla el flujo reverso oficial para devolver/anular una venta después de cobrada.
**🤔 Por qué es un problema:** Legal y administrativamente una factura no "se borra", requiere una Nota de Crédito. Al no existir un flujo claro, el empleado saca pata con el botón "Gastos / Retiros" para la caja, y eso genera que el ítem de stock no se reponga automáticamente al consumíble en FEFO ni que AFIP nos descuente esa venta de la carga de IVA. 
**✅ Mejor Opción:** Crear una función **"Devolución Comercial"** desde el Historial de Tickets. Al activarla: 
  1. Repone stock respetando último Lote FEFO de salida.
  2. Pregunta a qué cofre regresa el dinero retirado al cliente (Efectivo / MP).
  3. Emite de forma sincronizada una **Nota de Crédito C** si el originario era fiscal (FC C).

## 5. El Costeo necesita "Proveedores" (Inventario / Workflow)

**🔴 Qué Falla:** El stock permite ajustes rápidos e ingreso de lotes muy avanzado, pero ese ingreso flotante no se asocia a la entidad origen real de un comercio: El Proveedor.
**🤔 Por qué es un problema:** El nivel *enterprise* necesita responder: ¿A quién le compramos los chicles Minto? ¿Resulta ahora más barato comprarle a "Distribuidora A" o al canal de Preventa Directo? Sin esto, es imposible luego realizar "órdenes de compra" o prever pagos obligatorios si un reparto se fía.
**✅ Mejor Opción:** Incorporar una tabla simple de **`Proveedores`**. En las vistas de Ingresos Masivos Rápidos o Carga de Lote, agregar un selector opcional para vincular mercancía <-> proveedor, destrabando a nivel gerencial un informe de "Margen x Categoría x Proveedor".

## 6. Comisiones Ocultas de las Cobranzas Digitales (Finanzas / UI)

**🔴 Qué Falla:** Las ventas digitales vía Mercado Pago, transferencias o débito asientan reportes contra el "Ingreso Bruto" recibido. El cajero cruza totales.
**🤔 Por qué es un problema:** Mercado Pago o Prisma cobran comisiones y hacen retenciones de IIBB. Si el panel de inicio marca que hoy vendiste $250.000 (todo crédito), engaña psicológicamente al negocio al ocultar que el desembolso final serán $230.000 netos. En un negocio transaccional con márgenes pequeños (como un Minisnack), esas comisiones afectan todo el cálculo de ROI.
**✅ Mejor Opción:** Establecer configuración de **"Tasa de Retención (%)"** en las Formas de Pago. Los reportes visuales diarios pasarán a mostrar la doble visión en el dashboard: "Ingresos Brutos ($X)" y al ladito más remarcado en una placa de cristal: **"Recibible Estimado a tu Cuenta / Neto"**.

## 7. Alta Operatividad: Control First-Keyboard (UX/UI)

**🔴 Qué Falla:** Un buen POS no debe exigir mouse o dedo para las tareas transaccionales que se emiten cada 20 segundos en hora pico.
**🤔 Por qué es un problema:** El diseño general asume un mundo amigable "táctil", lo cual está bárbaro para tablets. Pero en un PC de mostrador con terminal USB, cada viaje de la mano del teclado al mouse quita de 1.5 a 2 segundos por venta. Son minutos perdidos para una fila de 10 personas impacientes.
**✅ Mejor Opción:** Arquitectura base de **Atajos de Teclado Universales (Shortcuts)** documentada en la UI. Sobre los botones grandes de la caja renderizar teclas `[F1]`, `[F9]`.
   - `[Espacio / Enter]` focaliza constantemente el buscador o escáner.
   - `[F1]` Confirmar Ticket y cobrar en 'Efectivo Justo'.
   - `[F2]` Confirmar Cobro MP.
   - `[Esc]` Limpiar mesa de trabajo rápidamente.

## 8. Inventario Parcial ("Auditoría Viva") (Flujo / Inventario)

**🔴 Qué Falla:** Las correcciones masivas de stock hoy imponen dinámicas en donde un humano debe recorrer algo o exportar un XLS pesado para corregir.
**🤔 Por qué es un problema:** Operar 18hs al día imposibilita "bajar las cortinas para contar un local" perdiendo ventas.
**✅ Mejor Opción:** Módulo de **"Check de Góndola / Auditoría Cíclica"**. Un flujo de UI cerrado donde un empleado ingresa modo auditoría solo limitando ciertas "Categorías". El cajero sigue vendiendo sándwiches, mientras un repositor toma una tablet, escanea todos los desodorantes, los valida in situ, cruzándolos contra tu BD. Se generan 'Ajustes' controlados a lotes sin congelar el kiosco entero.

---

### Resumen de Próximos Pasos

Podemos dividir esta evolución en prioridades:

1. **Prioridad 1 (Control de Caja):** Cierre Ciego, Log de Anulaciones en Carrito, y Límites por Cliente en Fiados. (Para frenar cualquier fuga de dinero o mercancía encubierta).
2. **Prioridad 2 (Core Empresarial y Fiscal):** Devoluciones formales con Notas de Crédito, y Alta de Entidad Proveedores para cruzar envíos a lotes.
3. **Prioridad 3 (UX y Rentabilidad):** Estimación automatizada de comisiones (Neto vs Bruto) para MP, Inventario Cíclico sin frenar ventas, y Hotkeys Globales (Toda la caja operada por F1-F12 y teclado).
