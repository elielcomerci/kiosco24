# Clikit by ZAP - Sistema Operativo para Negocios

## ¿Qué es Clikit?
**Clikit** (anteriormente Kiosco24) es mucho más que un punto de venta. Es un **sistema operativo diseñado para kioscos, minimarkets y negocios minoristas reales**. Nace de entender que el principal dolor en la trinchera comercial no es "realizar una venta", sino **sostener el orden** cuando el estrés de la fila, los múltiples turnos, y la velocidad de atención superan la capacidad de la memoria de las personas o de un cuaderno.

---

## 🎯 Problemas Reales que Resuelve (vs. Otros Sistemas Genéricos)

Los sistemas tradicionales de gestión suelen ser "software contable" disfrazado de punto de venta. Exigen múltiples clics, complican las tareas sencillas y, en el día a día, el dueño termina dejándolos de usar. **Clikit elimina la fricción**.

### 1. El Caos de la "Memoria del Dueño"
* **El Problema:** La venta sale, pero el stock real queda en la cabeza del que atendió. Al rotar el turno o abrir una nueva sucursal, es imposible saber qué falta reponer sin hacer un conteo físico ciego.
* **Solución Clikit:** El stock se centraliza y debita en tiempo real. Configuración de **Stock Inteligente** con alertas de límites mínimos que indican exactamente cuándo reponer. 

### 2. El Catálogo "Basura"
* **El Problema:** Cada comercio carga los productos diferente. Aparecen nombres desprolijos ("Coca", "Cocacola", "Coca Cola 2L"), fotos faltantes o borrosas, y códigos de barra duplicados. Cuando el sistema está desprolijo, se vuelve una carga y deja de organizar.
* **Solución Clikit:** **Base Colaborativa Curada y Autocompletado Mágico**. Clikit cuenta con un catálogo central estandarizado. Al escanear un producto nuevo, el sistema se provee de fotos en alta calidad, nombres correctos y categorizaciones automáticamente, anulando el data-entry aburrido.

### 3. El Freno Innecesario en la Caja
* **El Problema:** Terminas de pasar toda la compra, el sistema es rápido, pero el cliente te pide un comprobante de pago o factura y la caja se congela. El empleado tiene que salir de la pantalla, abrir AFIP u otro módulo y rogar que el sistema no se cuelgue mientras la fila del local crece.
* **Solución Clikit:** **Comprobantes sin Fricción**. Emisión directa de Tickets No Fiscales y Facturas C interactuando todo en la misma pantalla. Soporte asíncrono para PDF y envíos al cliente por WhatsApp de forma transparente, sin frenar la próxima cuenta.

### 4. El Pánico a Quedar Congelado Venciendo Stock
* **El Problema:** Sistemas estrictos no te dejan vender si el stock figura en 0, lo cual es inaceptable cuando llega el proveedor, bajó la mercadería y el cliente ya la quiere comprar (pero vos no tuviste tiempo de cargar el remito).
* **Solución Clikit:** **Venta en stock negativo con Ajuste Automático.** El sistema permite habilitar la venta libre dándote tiempo para ingresar mercadería luego, pero sin frenar la recaudación nunca. Para blindar tu seguridad administrativa, el sistema lleva registro exacto: *si vendiste 5 sin stock (quedando en -5), cuando cargues la factura del proveedor por 10 unidades, Clikit hace la matemática solo y te deja el stock real en 5, sin que vos tengas reseteos manuales que generen cuadres fallidos*.

### 5. El "Miedo al Apagón" (Modo Offline)
* **El Problema:** En Argentina y Latam la conexión a internet suele fallar. El comerciante tiene pánico a que un micro-corte de red convierta la fila de 10 personas en un motín porque no puede escanear ni cobrar.
* **Solución Clikit:** **Arquitectura Resiliente Offline (PWA).** Clikit permite seguir escaneando y registrando ventas en contingencia, guardando todo de forma segura en la memoria local del navegador. En el instante en que vuelve la red, el sistema sincroniza silenciosamente las ventas a la nube principal.

### 6. La Conciliación de Medios de Pago (El infierno de las billeteras)
* **El Problema:** Hoy la caja se cobra con Efectivo, Mercado Pago, tarjetas, transferencias y QR's locales. Al final del día, el arqueo nunca da porque los medios se mezclan y nunca se sabe si un empleado se equivocó, si el dinero nunca entró, o si falta plata.
* **Solución Clikit:** **Arqueo Blindado por Medios de Pago.** El sistema obliga al empleado a declarar y cuadrar exactamente cuánto retiene en efectivo y cuánto comprobó por transferencias u otras billeteras antes de cerrar el turno. Esto detecta instantáneamente descuadres por método y limpia de inmediato la duda administrativa sobre posibles desvíos.

### 7. Exportaciones para el "Contador"
* **El Problema:** El sistema podrá ser mágico para el mostrador, pero a fin de mes, extraer los datos para la liquidación es una odisea que obliga al dueño a pasar todo a mano a un Excel o enviarle fotos de los totales al estudio contable.
* **Solución Clikit:** **Exportación Total en 1 Clic.** Todo el volumen de ventas, categorías, reportes y comprobantes emitidos se puede bajar a un Excel o CSV impecable en 5 segundos, listo para reenviar a tu contador por WhatsApp y desentenderse de la carga de datos fiscal.

### 8. El Terror a Quedar "Solo" frente a lo Nuevo (Soporte y Onboarding)
* **El Problema:** El mayor freno es el salto al vacío. El comerciante prefiere soportar el dolor de su rutina agobiante antes de enfrentarse solo a semanas de cargar listas de precios o de enseñarle tecnología compleja a sus empleados.
* **Solución Clikit:** **Curva de Aprendizaje Cero y Migración Asistida.** La interfaz es tan veloz e intuitiva que un cajero nuevo lo aprende a operar en 10 minutos. Además, ofrecemos importar de forma masiva tus precios actuales para que empieces a facturar en menos de 24 horas guiado por nuestro equipo.

---

## 🚀 Funcionalidades Principales

### 💳 1. Caja Pensada para la Velocidad Total ("Caja Rápida")
- Interfaz fluida optimizada: Preparada tanto para pantallas táctiles (Touch) como para lectores láser (Barcode).
- Gestión de "Fiados": Cuentas corrientes integradas y asignadas a clientes a un par de clics.
- Configuración y asignación de múltiples variantes y combos con agilidad asombrosa.
- Gestión de Sonidos / Feedback de Audio: Alertas en tiempo real y confirmación acústica instantánea para usar rápido sin mirar todo el tiempo la pantalla.

### 📦 2. Stock y Almacenes (Avisos Previos)
- **Gestión FEFO y Vencimientos:** Asignación de Lotes con fecha de caducidad. El sistema prioriza el desgaste de lotes cercanos a vencer para evitar que se te echen a perder productos (mermas) en el fondo del estante.
- Tableros dinámicos e indicadores con colores semafóricos de acuerdo al nivel del inventario.
- Ingreso de remitos sin "matemáticas mentales": Se carga fácil y con opciones horizontales fluidas.

### 🖨️ 3. Ecosistema de Tickets y Hardware
- Total compatibilidad con **Impresoras Térmicas** (comandos directos sin popups molestos del navegador).
- Diseño de ticket ultra profesional y estilizado.

### 🏢 4. Multi-Sucursal Sin Caos (Escalabilidad Real)
Te acompaña desde tu primera persiana arriba hasta transformarte en una franquicia con decenas de bocas de venta.
- **Stock 100% Individualizado** por cada local.
- **Manejo de Precio Flexible:** Los precios pueden ser globales (afectando a todas tus sucursales) o listas de precios particulares por local.
- **Sincronización:** Movimientos de mercadería entre tus diferentes sucursales arrastrando todo su historial, lotes y vencimientos.
- Roles de trabajo, control de apertura/cierre de cajas y traspasos de mando entre cajeros.

### ⚡ 5. Operativa Técnica PWA Súper Liviana
- Sistema _Progressive Web App_ que funciona excelente sin tener que instalar aplicaciones pirata ni ocupar memoria inmensa.
- Modos oscuros, _glassmorphism_, accesibilidad moderna y estética premium. Es lindo de ver todo el día.

---

## 💡 ¿Cómo ayuda y transforma a cada rubro?

### Kioscos Tradicionales / "24 Horas"
- **Resuelve:** La locura de rotar 3 turnos diarios de empleados. Al cerrar el "Turno ZAP" (apertura/cierre de caja), todo queda registrado impecable.
- Control estricto de faltantes y robos gracias a que la base está digitalizada rápidamente, eliminando de paso los errores a la hora de recordar cuánto cuestan los panchos o el encendedor.
- **El Fiado del Barrio:** Seguimiento implacable de la cuenta del vecino sin un cuaderno que pueda perderse.

### Minimarkets y Fiambrerías
- **Resuelve:** El control de peso y perecederos vencidos. Gracias a los LOTES, una horma de queso feteable o sachets de lácteos se registran con ingreso y vencimiento marcando cuándo darle liquidación, evitando pérdidas masivas.
- Precios de estantería que no mienten ni se duplican, gracias al catálogo base limpiado y colaborativo que siempre te dará la info correcta y actualizada.

### Locales Multi-Rubro / Polirrubros
- **Resuelve:** El orden al vender papelería, perfumería y golosinas juntas. Al soportar rubros múltiples en la arquitectura profunda (diferentes atributos, impuestos y esquemas lógicos), podés abarcar desde una pila hasta una docena de sándwiches bajo el mismo checkout, adaptando la exhibición al vendedor de forma óptima.
- Catálogo de Zap Ads (promociones) directo al POS que informan al vendedor del producto de temporada.

---

## 🏆 El Resumen de los Beneficios Intangibles

1. **Tu tiempo libre devuelto:** Te podés sentar en tu casa y abrir Clikit desde el celular a la noche, ver cómo estuvo la caja en tu sucursal principal y si tus empleados cerraron todo a regla.
2. **Tu dinero cuidado (fin a las mermas):** El control estricto, la baja de productos faltantes y el control de vencimiento literalmente hace que el sistema "se pague solo" en la mercadería que salvás.
3. **Escalabilidad y Delegación Absoluta:** Dejás de ser el *operario* para ser verdaderamente el *dueño* de la franquicia.
4. **Cero Frustración Tecnológica:** La interfaz está pensada para el comerciante normal, no para un técnico. Cuenta con colores amables y no te frena cuando sólo querés que pase el próximo cliente en la fila.

**"Si tu kiosco necesita orden sin volverse tortuoso, Clikit by Zap es la respuesta."**

---

## 🔮 Apéndice: El Futuro de Clikit (Roadmap y Expansión)

Para convertir a Clikit en el **mejor y más completo ecosistema** de su tipo, sin perder la simpleza y velocidad que lo caracteriza, proyectamos los siguientes módulos evolutivos que lo llevarán al próximo nivel de gestión integral:

### 🍳 1. Clikit KDS (Kitchen Display System) - Módulo de Producción
**Ideal para:** Sectores de rotisería, ventas de comida rápida y elaboración interna de viandas o sándwiches integrados a un kiosco/minimarket.
* **El Concepto:** Un sistema paralelo e interconectado donde el punto de venta (POS) y el sector de "Cocina" o "Producción" hablan en tiempo real pero mantienen interfaces adaptadas a cada necesidad.
* **Producción Previa (Batch Mapeado):** Permitirá ejecutar líneas de producción. Por ejemplo, al registrar la producción diaria de 50 sándwiches, el sistema automáticamente descontará la materia prima (pan, fetas de jamón y queso) de tu inventario central en crudo e inyectará exactamente 50 unidades terminadas ("combos") listas para la estantería del local y la caja.
* **Producción en Caliente (Fast-Food):** Cuando el cajero tipea o selecciona una comida elaborada, la comanda viaja instantáneamente sin papel a una tablet/pantalla (KDS) en la cocina. El encargado de preparar ve qué despachar, en qué orden, y con un toque lo marca como "Listo", notificando al cajero.
* **El Beneficio Real:** Separar el mundo de atención del mundo de elaboración. El cajero cobra rapidísimo y no maneja cocina; el cocinero despacha ordenado, digital y no toca el dinero.

### 🤖 2. Reabastecimiento Predictivo (Smart POs)
* **El Concepto:** En lugar de depender de que un encargado revise alarmas o camine la estantería para cargarle un pedido a proveedor, el sistema utilizará el ritmo de venta predictivo para redactar **Órdenes de Compra Automáticas**.
* **El Beneficio:** Con un solo toque ("Aprobar Pedido"), el listado se enviará de forma automática y formateada al WhatsApp o mail de cada distribuidor específico.

### 📱 3. Portal de Clientes (Fidelización y Auto-Auditoría)
* **El Concepto:** Un enlace o mini-app donde tus mejores clientes, vecinos o oficinistas puedan entrar mediante un QR para consultar su historial de compras y puntos de lealtad.
* **El Beneficio - Fin a la discusión del Fiado:** Los clientes con saldo pendiente de pago podrán ver el estado de su cuenta corriente desde su propio celular en cualquier momento, sumando una transparencia absoluta a la operación de "fiar" y evitando cruces verbales o malentendidos.

### 🛵 4. Hub de Integración Unificada (Agregadores de Delivery)
* **El Concepto:** Conectar nativamente con PedidosYa, Rappi u otras plataformas logísticas, centralizando la toma de información. 
* **El Beneficio:** Terminaremos para siempre con "la mesada de las 3 tablets". Se consolida todo pedido de delivery directo al POS, impactando las órdenes en la caja y descontando del único stock real.

### 📊 5. Cierre "Zen" y Resúmenes por IA
* **El Concepto:** Evadir la sobrecarga de entrar a leer aburridos excels cruzados durante el fin de semana para entender qué pasó en un local.
* **El Beneficio:** Recepción en el celular del dueño de un resumen generado por IA en lenguaje coloquial (ej: *"El turno tarde vendió un 20% más que el promedio histórico, tené cuidado que estás casi sin stock de Gaseosas de 2L de cara al fin de semana"*). Insights masticados y procesados para que el dueño pueda tomar decisiones, no pasársela midiendo tablas.

### 💸 6. Módulo de Gastos Operativos (Cashflow Integral)
* **El Concepto:** Muchos dueños sienten que "facturan un montón" en la caja, pero desconocen a dónde se drena el dinero real (pagos de luz, adelantos de sueldos, alquiler, o el simple retiro de dinero de la caja para comprar artículos de limpieza).
* **El Beneficio:** Clikit permitirá asentar toda "Salida de Caja" etiquetándola operativamente de forma simple. Así, a final del mes el dueño tendrá su **Beneficio Neto Real** descontando costos directos. Clikit deja de ser un "emisor de tickets" para convertirse en el mapa financiero contundente del local a nivel P&L.

### 🌐 7. Omnicanalidad: Tu Negocio en Todas Partes, Un Solo Stock
El mayor riesgo de vender online es la falta de sincronización y el desorden administrativo. Clikit actuará como el cerebro central que mantiene tus estanterías físicas y virtuales alineadas en milisegundos.

* **A. Tu Tienda Propia "Light" (Catálogo QR & Clikit Web):** Ideal para que el cliente del barrio haga pedidos precisos desde su celular. Generamos un catálogo web hiper-liviano conectado directo a tu base. Si vendés la última unidad por el mostrador, desaparece automáticamente de tu web, evitando frustraciones. Esos pedidos entran al POS de la caja como una notificación lista para preparar. Cero esfuerzo, cero comisiones a terceros.
* **B. Ecosistema de Gigantes (Tiendanube y Mercado Libre):** Si ya tenés una estructura e-commerce, Clikit se "enchufa" mediante API a tus cuentas. Cada venta en Mercado Libre o en tu Tiendanube descontará de tu depósito local del kiosco automáticamente.

---

## 💎 El Cierre Maestro: El fin de la carga manual duplicada

Invertir en Clikit es invertir en la paz mental y en la eliminación del doble (o triple) trabajo administrativo. Para que el dueño de un negocio sea realmente dueño y no un "técnico cargador de datos", el sistema ofrece la regla de oro:

> **Si sube el precio de la leche, lo cambiás una sola vez en la caja y, en ese mismo milisegundo, se actualiza en tu Tiendanube, en tu catálogo QR para WhatsApp y en Mercado Libre.**

Clikit absorbe el caos y te ahorra horas de administración técnica semanal para que las uses en lo que realmente importa: **hacer crecer tu rentabilidad.**
