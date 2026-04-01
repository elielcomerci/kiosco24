# 📊 Estadísticas - Plan de Implementación

**Estado:** Fase 0 completada ✅  
**Última actualización:** 2026-04-01  
**Prioridad:** Alta (sistema en producción con clientes reales)

---

## 🎯 Objetivos

1. **Modularizar** la pantalla de estadísticas en 6 tabs independientes
2. **Preservar** toda la funcionalidad existente del Tab 1 (Resumen)
3. **Implementar** cada tab con datos reales del schema de Prisma
4. **Diseñar** responsive (móvil + desktop)
5. **Mantener** compatibilidad con impresión y atajos de teclado

---

## 📁 Estructura de Archivos

```
src/app/(app)/[branchId]/estadisticas/
├── page.tsx                          # Main: tab bar + estado global
├── ESTADISTICAS-PLAN.md              # Este documento
└── tabs/
    ├── index.ts                      # exports de todos los tabs
    ├── TabResumen.tsx                # 📊 (refactor del existente)
    ├── TabVentas.tsx                 # 💰 (nuevo)
    ├── TabTurnos.tsx                 # 🕐 (nuevo)
    ├── TabEmpleados.tsx              # 👷 (nuevo)
    ├── TabStock.tsx                  # 📦 (nuevo)
    └── TabFiados.tsx                 # 💳 (nuevo)

src/app/api/stats/
├── periodo/                          # ✅ Existe - GET /api/stats/periodo
├── inventory-value/                  # ✅ Existe - GET /api/stats/inventory-value
├── ventas/                           # 🔲 Nuevo - GET /api/stats/ventas
├── turnos/                           # 🔲 Nuevo - GET /api/stats/turnos
├── empleados/                        # 🔲 Nuevo - GET /api/stats/empleados
├── stock/                            # 🔲 Nuevo - GET /api/stats/stock
└── fiados/                           # 🔲 Nuevo - GET /api/stats/fiados
```

---

## 📊 Tabs - Especificación Detallada

### 📊 Tab 1: Resumen General

**Propósito:** Vista ejecutiva del período seleccionado

#### Métricas Principales (4 KPIs)

| KPI | Cálculo | Fuente | Trend |
|-----|---------|--------|-------|
| Total ventas | `SUM(Sale.total)` donde `voided = false` | `Sale` | vs período anterior |
| Ganancia neta | `SUM((SaleItem.price - SaleItem.cost) * quantity) - gastos` | `SaleItem`, `SaleCostAllocation`, `Expense` | vs período anterior |
| Gastos | `SUM(Expense.amount)` | `Expense` | vs período anterior |
| Margen % | `(gananciaNeta / totalVentas) * 100` | Calculado | — |

#### Métricas Secundarias (4 KPIs)

| KPI | Cálculo | Fuente |
|-----|---------|--------|
| Cantidad de ventas | `COUNT(Sale)` donde `voided = false` | `Sale` |
| Ticket promedio | `totalVentas / cantidadVentas` | Calculado |
| Resultado neto | `totalVentas - gastos - retiros` | `Sale`, `Expense`, `Withdrawal` |
| Ventas anuladas | `COUNT(Sale)` + `SUM(Sale.total)` donde `voided = true` | `Sale` |

#### Componentes Visuales

| Componente | Datos | Orden |
|------------|-------|-------|
| InventoryValuationPanel | API `/api/stats/inventory-value` | Arriba del todo |
| KPIs principales | 4 cards en grid 2x2 | Fila 1 |
| KPIs secundarios | 4 cards en grid 2x2 | Fila 2 |
| Gráfico ventas | Barras por día/semana | Línea 3 |
| Gráfico ganancia | Barras por día/semana (si hay costos) | Línea 3 |
| Métodos de cobro | Barras de progreso con % | Línea 4 |
| Top productos | Lista numerada (top 10) | Línea 5 |
| Gastos por categoría | Lista simple | Línea 6 |
| TurnosHistorial | Componente existente | Línea 7 |

#### Selector de Período

- **Opciones:** Día / Semana / Mes
- **Navegación:** Anterior / Siguiente (deshabilitado si es período actual)
- **Label:** "Hoy", "Esta semana", "Este mes" o nombre del mes/semana

#### Responsive

| Elemento | Móvil (< 640px) | Desktop (≥ 640px) |
|----------|-----------------|-------------------|
| Tab bar | Scroll horizontal | Todos visibles |
| KPIs grid | 1 columna | 2 columnas |
| Gráficos | 100% ancho | 100% ancho |
| Top productos | Scroll vertical | Sin scroll |
| TurnosHistorial | Colapsable | Expandido |

---

### 💰 Tab 2: Ventas

**Propósito:** Detalle operativo de todas las ventas

#### API: `GET /api/stats/ventas`

**Query params:**
- `periodo`: "dia" | "semana" | "mes"
- `isoDate`: YYYY-MM-DD
- `metodo`: CASH | MERCADOPAGO | TRANSFER | DEBIT | CREDIT_CARD | CREDIT (opcional)
- `empleadoId`: String (opcional)
- `search`: texto para buscar por ticket/producto (opcional)

**Response:**
```typescript
{
  ventas: Array<{
    id: string
    ticketNumber: number | null
    createdAt: string
    total: number
    paymentMethod: PaymentMethod
    employeeName: string | null
    voided: boolean
    invoiceStatus: InvoiceStatus | null
    itemsCount: number
  }>
  totalVentas: number
  cantidadVentas: number
  ventasPorMetodo: Record<PaymentMethod, number>
  ventasPorHora: Array<{ hora: number; cantidad: number; total: number }>
  productosMasVendidos: Array<{ name: string; cantidad: number; total: number }>
  productosMenosVendidos: Array<{ name: string; cantidad: number; total: number }>
  categoriasTop: Array<{ name: string; cantidad: number; total: number }>
  ventasFiado: { cantidad: number; total: number }
  facturasAfip: { emitidas: number; pendientes: number; fallidas: number }
}
```

#### Componentes Visuales

| Componente | Datos | Orden |
|------------|-------|-------|
| Filtros | Período + método + empleado + búsqueda | Arriba |
| KPIs resumen | 4 cards (total, cantidad, ticket prom, fiado) | Fila 1 |
| Tabla de ventas | Lista paginada (20 por página) | Línea 2 |
| Ventas por hora | Heatmap o barras (24 horas) | Línea 3 |
| Productos más vendidos | Top 10 | Línea 4 |
| Productos menos vendidos | Bottom 10 | Línea 5 |
| Facturas AFIP | 3 KPIs pequeños (emitidas, pendientes, fallidas) | Línea 6 |

#### Tabla de Ventas

| Columna | Datos | Ordenable |
|---------|-------|-----------|
| Fecha | `createdAt` (DD/MM HH:mm) | ✅ |
| Ticket | `ticketNumber` o "Sin ticket" | ✅ |
| Empleado | `Employee.name` o "—" | ✅ |
| Método | Icono + label | ✅ |
| Items | `COUNT(SaleItem)` | ❌ |
| Total | `Sale.total` | ✅ |
| Estado | "Anulada" (rojo) / AFIP status | ✅ |
| Acciones | Ver detalle, Imprimir | — |

#### Responsive

| Elemento | Móvil (< 640px) | Desktop (≥ 640px) |
|----------|-----------------|-------------------|
| Filtros | Stack vertical | Grid 2x2 |
| KPIs grid | 1 columna | 2 columnas |
| Tabla | Scroll horizontal + columnas prioritarias | Todas las columnas |
| Heatmap | 12 horas (día) / 7 días (semana) | 24 horas / 30 días |
| Listas productos | Scroll vertical | 2 columnas |

---

### 🕐 Tab 3: Turnos

**Propósito:** Performance por turno y caja

#### API: `GET /api/stats/turnos`

**Query params:**
- `periodo`: "dia" | "semana" | "mes"
- `isoDate`: YYYY-MM-DD
- `empleadoId`: String (opcional)
- `estado`: "abiertos" | "cerrados" | "todos" (opcional)

**Response:**
```typescript
{
  turnos: Array<{
    id: string
    employeeName: string
    employeeId: string | null
    openedAt: string
    closedAt: string | null
    openingAmount: number
    closingAmount: number | null
    expectedAmount: number | null
    difference: number | null
    ventasTotal: number
    ventasCantidad: number
    gastosTotal: number
    retirosTotal: number
    duracionMinutos: number | null
  }>
  resumen: {
    totalTurnos: number
    turnosAbiertos: number
    turnosCerrados: number
    diferenciaPromedio: number
    diferenciaTotal: number
    turnosConDiferenciaNegativa: number
    duracionPromedioMinutos: number | null
  }
  diferenciasPorTurno: Array<{ id: string; label: string; difference: number }>
}
```

#### Componentes Visuales

| Componente | Datos | Orden |
|------------|-------|-------|
| Filtros | Período + empleado + estado | Arriba |
| KPIs resumen | 5 cards (ver abajo) | Fila 1 |
| Alertas | Lista de turnos con diferencia negativa | Línea 2 |
| Tabla de turnos | Lista completa | Línea 3 |
| Gráfico diferencias | Barras por turno | Línea 4 |

#### KPIs de Resumen

| KPI | Cálculo | Alerta |
|-----|---------|--------|
| Total turnos | `COUNT(Shift)` | — |
| Turnos abiertos | `COUNT(Shift)` donde `closedAt = null` | — |
| Turnos cerrados | `COUNT(Shift)` donde `closedAt != null` | — |
| Diferencia promedio | `AVG(Shift.difference)` | Si < 0 |
| Turnos con diferencia negativa | `COUNT(Shift)` donde `difference < 0` | Si > 0 |

#### Tabla de Turnos

| Columna | Datos | Ordenable |
|---------|-------|-----------|
| Empleado | `Employee.name` | ✅ |
| Apertura | `openedAt` (DD/MM HH:mm) | ✅ |
| Cierre | `closedAt` o "Abierto" | ✅ |
| Apertura caja | `openingAmount` | ✅ |
| Ventas | `COUNT(Sale)` + total | ✅ |
| Gastos/Retiros | `SUM(Expense)` + `SUM(Withdrawal)` | ❌ |
| Diferencia | `difference` (verde/rojo) | ✅ |
| Duración | Minutos o "—" | ✅ |
| Acciones | Ver detalle, Cerrar | — |

#### Responsive

| Elemento | Móvil (< 640px) | Desktop (≥ 640px) |
|----------|-----------------|-------------------|
| Filtros | Stack vertical | Grid 3 columnas |
| KPIs grid | 1 columna | 2-3 columnas |
| Alertas | Cards apiladas | Grid 2 columnas |
| Tabla | Scroll horizontal | Todas columnas |
| Gráfico | Barras verticales | Barras horizontales |

---

### 👷 Tab 4: Empleados

**Propósito:** Rendimiento individual por empleado

#### API: `GET /api/stats/empleados`

**Query params:**
- `periodo`: "dia" | "semana" | "mes"
- `isoDate`: YYYY-MM-DD
- `empleadoId`: String (opcional, para detalle individual)
- `rol`: CASHIER | MANAGER (opcional)

**Response:**
```typescript
{
  empleados: Array<{
    id: string
    name: string
    role: EmployeeRole
    active: boolean
    suspendedUntil: string | null
    ventasCantidad: number
    ventasTotal: number
    ticketPromedio: number
    gastosCantidad: number
    gastosTotal: number
    retirosCantidad: number
    retirosTotal: number
    turnosCantidad: number
    reposicionesCantidad: number
    anulacionesCantidad: number
    anulacionesTotal: number
  }>
  ranking: Array<{ id: string; name: string; total: number }>
  resumen: {
    totalEmpleados: number
    empleadosActivos: number
    empleadosSuspendidos: number
    topEmpleadoId: string
    topEmpleadoVentas: number
  }
}
```

#### Componentes Visuales

| Componente | Datos | Orden |
|------------|-------|-------|
| Filtros | Período + rol | Arriba |
| KPIs resumen | 4 cards (ver abajo) | Fila 1 |
| Ranking empleados | Top 5 con medallas | Línea 2 |
| Tabla de empleados | Lista completa | Línea 3 |
| Detalle empleado | Modal o panel lateral (si se selecciona uno) | Overlay |

#### KPIs de Resumen

| KPI | Cálculo |
|-----|---------|
| Total empleados | `COUNT(Employee)` |
| Empleados activos | `COUNT(Employee)` donde `active = true` y `suspendedUntil = null` |
| Empleados suspendidos | `COUNT(Employee)` donde `suspendedUntil != null` |
| Top empleado | `Employee` con mayor `SUM(Sale.total)` |

#### Tabla de Empleados

| Columna | Datos | Ordenable |
|---------|-------|-----------|
| Nombre | `Employee.name` + estado (activo/suspendido) | ✅ |
| Rol | CASHIER / MANAGER | ✅ |
| Ventas | Cantidad + total | ✅ |
| Ticket prom | `totalVentas / cantidadVentas` | ✅ |
| Gastos | Cantidad + total | ✅ |
| Retiros | Cantidad + total | ✅ |
| Turnos | `COUNT(Shift)` | ✅ |
| Anulaciones | `COUNT(Sale)` donde `voided = true` | ✅ |
| Acciones | Ver detalle | — |

#### Responsive

| Elemento | Móvil (< 640px) | Desktop (≥ 640px) |
|----------|-----------------|-------------------|
| Filtros | Stack vertical | Grid 2 columnas |
| KPIs grid | 1 columna | 2 columnas |
| Ranking | Cards apiladas | Grid 5 columnas |
| Tabla | Scroll horizontal | Todas columnas |
| Detalle | Panel full-width | Modal lateral |

---

### 📦 Tab 5: Stock

**Propósito:** Valorización, reposiciones y alertas de inventario

#### API: `GET /api/stats/stock`

**Query params:**
- `scope`: "branch" | "kiosco" (solo owner)
- `categoria`: String (opcional)
- `alerta`: "bajo" | "cero" | "vencimiento" | "pendiente" (opcional)

**Response:**
```typescript
{
  meta: {
    scope: "branch" | "kiosco"
    scopeLabel: string
    branchCount: number
  }
  resumen: {
    valorizacionTotal: number
    productosConStock: number
    productosSinStock: number
    productosStockBajo: number
    productosVencidos: number
    productosPorVencer: number
    reservasPendientes: number
    unidadesPendientesValorizar: number
    capasAbiertas: number
  }
  alertas: Array<{
    tipo: "stock_bajo" | "sin_stock" | "vencido" | "por_vencer" | "reserva_pendiente"
    productoId: string
    productoNombre: string
    branchId: string
    branchName: string
    cantidad: number
    detalle: string
  }>
  reposicionesRecientes: Array<{
    id: string
    type: RestockEventType
    fecha: string
    empleadoName: string | null
    proveedorName: string | null
    itemsCantidad: number
    costoTotal: number | null
  }>
  productosTop: Array<{
    key: string
    displayName: string
    image: string | null
    stock: number
    minStock: number | null
    valorizacion: number
    precioVenta: number | null
    margen: number | null
  }>
}
```

#### Componentes Visuales

| Componente | Datos | Orden |
|------------|-------|-------|
| Selector scope | Branch / Kiosco (solo owner) | Arriba |
| Filtros | Categoría + tipo de alerta | Arriba |
| KPIs resumen | 8 cards (ver abajo) | Fila 1 |
| Alertas | Lista con iconos por tipo | Línea 2 |
| Reposiciones recientes | Tabla últimas 10 | Línea 3 |
| Productos top | Grid con imágenes | Línea 4 |
| InventoryValuationPanel | Componente existente (si scope = branch) | Línea 5 |

#### KPIs de Resumen

| KPI | Cálculo | Alerta |
|-----|---------|--------|
| Valorización total | `SUM(InventoryCostLayer.remainingQuantity * unitCost)` | — |
| Productos con stock | `COUNT(Product)` donde `stock > 0` | — |
| Productos sin stock | `COUNT(Product)` donde `stock = 0` o `null` | Si > 0 |
| Productos stock bajo | `COUNT(Product)` donde `stock < minStock` | Si > 0 |
| Productos vencidos | `COUNT(StockLot)` donde `expiresOn < hoy` y `remainingQuantity > 0` | Si > 0 |
| Productos por vencer | `COUNT(StockLot)` donde `expiresOn` en próximos N días | Si > 0 |
| Reservas pendientes | `COUNT(NegativeStockReservation)` donde `quantityPending > 0` | Si > 0 |
| Unidades sin valorizar | `SUM` de unidades sin `InventoryCostLayer` | Si > 0 |

#### Alertas Visuales

| Tipo | Icono | Color |
|------|-------|-------|
| Stock bajo | ⚠️ | Ámbar |
| Sin stock | ❌ | Rojo |
| Vencido | 🕐 | Rojo |
| Por vencer | ⏰ | Ámbar |
| Reserva pendiente | 📋 | Ámbar |

#### Responsive

| Elemento | Móvil (< 640px) | Desktop (≥ 640px) |
|----------|-----------------|-------------------|
| Selector scope | Toggle horizontal | Toggle horizontal |
| Filtros | Stack vertical | Grid 2 columnas |
| KPIs grid | 1 columna | 2-4 columnas |
| Alertas | Cards apiladas | Grid 2-3 columnas |
| Reposiciones | Tabla scroll horizontal | Tabla completa |
| Productos top | Grid 2 columnas | Grid 4-5 columnas |

---

### 💳 Tab 6: Fiados

**Propósito:** Gestión de cuentas corrientes y deuda pendiente

#### API: `GET /api/stats/fiados`

**Query params:**
- `search`: texto para buscar por nombre (opcional)
- `estado`: "deudores" | "todos" | "sin_deuda" (opcional)

**Response:**
```typescript
{
  clientes: Array<{
    id: string
    name: string
    phone: string | null
    balance: number
    createdAt: string
    ultimaCompra: string | null
    ultimoPago: string | null
    comprasCantidad: number
    comprasTotal: number
    pagosCantidad: number
    pagosTotal: number
    diasDeuda: number | null
  }>
  resumen: {
    totalClientes: number
    clientesDeudores: number
    deudaTotal: number
    deudaVencida: number // deuda > 30 días
    pagosDelMes: number
    pagosTotalMes: number
  }
  movimientosRecientes: Array<{
    tipo: "compra" | "pago"
    clienteId: string
    clienteNombre: string
    fecha: string
    monto: number
    saldoPosterior: number
  }>
  topDeudores: Array<{
    id: string
    name: string
    balance: number
    diasDeuda: number
  }>
}
```

#### Componentes Visuales

| Componente | Datos | Orden |
|------------|-------|-------|
| Buscador | Input por nombre | Arriba |
| Filtros | Estado (deudores/todos) | Arriba |
| KPIs resumen | 5 cards (ver abajo) | Fila 1 |
| Top deudores | Lista top 5 | Línea 2 |
| Movimientos recientes | Lista últimas 20 operaciones | Línea 3 |
| Tabla de clientes | Lista completa | Línea 4 |

#### KPIs de Resumen

| KPI | Cálculo | Alerta |
|-----|---------|--------|
| Total clientes | `COUNT(CreditCustomer)` | — |
| Clientes deudores | `COUNT(CreditCustomer)` donde `balance > 0` | Si > 0 |
| Deuda total | `SUM(CreditCustomer.balance)` | Si > 0 |
| Deuda vencida | `SUM(balance)` donde `ultimaCompra < 30 días` | Si > 0 |
| Pagos del mes | `COUNT(CreditPayment)` + total en mes actual | — |

#### Tabla de Clientes

| Columna | Datos | Ordenable |
|---------|-------|-----------|
| Nombre | `CreditCustomer.name` | ✅ |
| Teléfono | `phone` | ✅ |
| Saldo | `balance` (rojo si > 0) | ✅ |
| Días de deuda | Días desde `ultimaCompra` | ✅ |
| Compras | Cantidad + total | ✅ |
| Pagos | Cantidad + total | ✅ |
| Último movimiento | Fecha de compra o pago | ✅ |
| Acciones | Ver historial, Registrar pago | — |

#### Modal: Historial por Cliente

| Sección | Datos |
|---------|-------|
| Datos cliente | Nombre, teléfono, saldo actual |
| Compras | Lista de `Sale` con `creditCustomerId` |
| Pagos | Lista de `CreditPayment` |
| Resumen | Total comprado, total pagado, saldo |

#### Responsive

| Elemento | Móvil (< 640px) | Desktop (≥ 640px) |
|----------|-----------------|-------------------|
| Buscador + filtros | Stack vertical | Grid 2 columnas |
| KPIs grid | 1 columna | 2 columnas |
| Top deudores | Cards apiladas | Grid 2-3 columnas |
| Movimientos | Lista vertical | Grid 2 columnas |
| Tabla | Scroll horizontal | Todas columnas |
| Modal historial | Full-width | Panel lateral 400px |

---

## 🎨 Componentes Compartidos

### Componentes a crear en `src/components/stats/`

| Componente | Props | Uso |
|------------|-------|-----|
| `StatsCard.tsx` | `label`, `value`, `sub`, `highlight`, `warning`, `trend` | Todos los KPIs |
| `StatsTable.tsx` | `columns`, `data`, `sortable`, `pagination` | Todas las tablas |
| `StatsChart.tsx` | `data`, `type`, `colors` | Gráficos de barras |
| `StatsFilterBar.tsx` | `filters`, `onFilterChange` | Barras de filtros |
| `AlertBadge.tsx` | `type`, `message` | Alertas de stock |
| `EmptyState.tsx` | `emoji`, `title`, `description` | Estados vacíos |

### Componentes existentes a reutilizar

| Componente | Ubicación | Uso |
|------------|-----------|-----|
| `InventoryValuationPanel` | `src/components/stats/` | Tab 1 y Tab 5 |
| `TurnosHistorial` | `src/components/turnos/` | Tab 1 y Tab 3 |
| `BackButton` | `src/components/ui/` | Header |
| `PrintablePage` | `src/components/print/` | Solo Tab 1 |

---

## ⌨️ Atajos de Teclado

Los atajos actuales se mantienen solo para tabs con selector de período:

| Tecla | Acción | Tabs activos |
|-------|--------|--------------|
| `[` | Período anterior | Resumen, Ventas, Turnos, Empleados |
| `]` | Período siguiente | Resumen, Ventas, Turnos, Empleados |
| `D` | Ver día | Resumen, Ventas, Turnos, Empleados |
| `S` | Ver semana | Resumen, Ventas, Turnos, Empleados |
| `M` | Ver mes | Resumen, Ventas, Turnos, Empleados |
| `1-6` | Cambiar de tab | Todos |

---

## 🖨️ Impresión

Solo el Tab 1 (Resumen) tiene versión impresa (`PrintablePage`).

**Contenido impreso:**
1. Indicadores clave (4 KPIs principales)
2. Ventas por período (tabla)
3. Métodos y productos (2 columnas)
4. Gastos por categoría (si hay)

**No se imprime:**
- InventoryValuationPanel (muy extenso)
- TurnosHistorial (ya tiene su propia impresión)

---

## 🔐 Permisos y Seguridad

| Rol | Tabs accesibles |
|-----|-----------------|
| `OWNER` | Todos (1-6) |
| `EMPLOYEE` (MANAGER) | Todos (1-6) |
| `EMPLOYEE` (CASHIER) | Solo Tab 1 (Resumen) y Tab 3 (Turnos - solo propios) |

**Reglas:**
- Tab 5 (Stock) con scope "kiosco" solo para OWNER
- Tab 3 (Turnos) para CASHIER solo muestra sus propios turnos
- Tab 4 (Empleados) para CASHIER no se muestra

---

## ✅ Checklist de Implementación

### Fase 0: Preparación ✅

- [x] Crear carpeta `src/app/(app)/[branchId]/estadisticas/tabs/`
- [x] Crear `tabs/index.ts` con exports
- [x] Mover `TabResumen` a archivo separado
- [x] Crear 5 tabs placeholder
- [x] Refactorizar `page.tsx` para usar tabs dinámicos
- [x] Testear navegación entre tabs

**Archivos creados:**

```
src/components/stats/
├── index.ts                 # exports
├── KpiCard.tsx              # Componente KPI
├── BarChart.tsx             # Gráfico de barras
├── MetodoBar.tsx            # Barra de método de pago
├── EmptyState.tsx           # Estado vacío
└── ComingSoonTab.tsx        # Placeholder tabs

src/lib/
├── stats-helpers.ts         # Funciones utilitarias (fechas, gráficos, atajos)
└── stats-types.ts           # Types compartidos (PeriodoData)

src/app/(app)/[branchId]/estadisticas/tabs/
├── index.ts                 # exports de tabs
├── TabResumen.tsx           # 📊 (completo)
├── TabVentas.tsx            # 💰 (placeholder)
├── TabTurnos.tsx            # 🕐 (placeholder)
├── TabEmpleados.tsx         # 👷 (placeholder)
├── TabStock.tsx             # 📦 (placeholder)
└── TabFiados.tsx            # 💳 (placeholder)
```

**Cambios en `page.tsx`:**
- Ahora solo maneja estado global y navegación
- Carga datos solo para tabs con período (resumen, ventas, turnos, empleados)
- Mantiene impresión solo para Tab 1
- Agrega atajos numéricos (1-6) para cambiar de tab

### Fase 1: Tab 1 - Resumen (Refactor) ✅

- [x] Mover componente a `tabs/TabResumen.tsx`
- [x] Actualizar imports en `page.tsx`
- [x] Verificar que todos los KPIs funcionan
- [x] Verificar gráficos
- [x] Verificar impresión
- [x] Verificar atajos de teclado
- [x] Testear responsive móvil

### Fase 2: API Endpoints Nuevos ✅

- [x] Crear `/api/stats/ventas/route.ts`
- [x] Crear `/api/stats/fiados/route.ts`
- [x] Crear `/api/stats/turnos/route.ts`
- [x] Crear `/api/stats/empleados/route.ts`
- [x] Crear `/api/stats/stock/route.ts`
- [x] Testear cada endpoint con Prisma Studio

**APIs creadas:**

| Endpoint | Tab | Datos principales |
|----------|-----|-------------------|
| `GET /api/stats/ventas` | 💰 Ventas | Lista de ventas, totales por método, ventas por hora (0-23), productos más/menos vendidos, facturas AFIP, ventas fiado |
| `GET /api/stats/fiados` | 💳 Fiados | Clientes con saldo, deuda total/vencida, pagos del mes, movimientos recientes, top deudores |
| `GET /api/stats/turnos` | 🕐 Turnos | Turnos con ventas/gastos/retiros, diferencias de caja, duración, alertas de diferencia negativa |
| `GET /api/stats/empleados` | 👷 Empleados | Ventas/gastos/retiros por empleado, turnos trabajados, reposiciones, anulaciones, ranking |
| `GET /api/stats/stock` | 📦 Stock | Valorización total, alertas (stock bajo, sin stock, vencidos, reservas), reposiciones recientes, productos top |

**Query params comunes:**
- `periodo`: "dia" | "semana" | "mes"
- `isoDate`: YYYY-MM-DD
- Filtros específicos por endpoint

**Permisos:**
- `OWNER` y `MANAGER`: acceso total
- `CASHIER`: solo ve sus propios turnos (en `/api/stats/turnos`)

### Fase 3: Tab 2 - Ventas ✅

- [x] Implementar UI del tab Ventas
- [x] Conectar con API `/api/stats/ventas`
- [x] Implementar filtros (método, búsqueda)
- [x] Implementar tabla de ventas (paginación, estado anulada/AFIP)
- [x] Implementar gráfico de ventas por hora
- [x] Implementar listas de productos más/menos vendidos
- [x] Implementar sección de facturas AFIP
- [x] Testear responsive

**Componentes creados:**
- `VentasFilterBar` - Filtros de método y búsqueda
- `VentasTable` - Tabla paginada con estado (anulada, AFIP)
- `VentasPorHoraChart` - Gráfico de barras por hora (0-23)
- `ProductosList` - Lista numerada para top productos
- `FacturasAfipKpis` - 3 KPIs de estado de facturas

**Características:**
- Filtro por método de pago (6 opciones)
- Búsqueda por ticket (número) o producto (nombre)
- Tabla paginada (20 items por página)
- Ventas anuladas marcadas en rojo y semi-transparentes
- Estado de factura AFIP con iconos (✅ Emitida, ⏳ Pendiente, ❌ Fallida)
- KPIs: total ventas, cantidad, ticket promedio, fiado total, método top

### Fase 4: Tab 3 - Turnos ✅

- [x] Implementar UI del tab Turnos
- [x] Conectar con API `/api/stats/turnos`
- [x] Implementar filtros (estado: abiertos/cerrados)
- [x] Implementar KPIs de resumen
- [x] Implementar alertas de diferencia negativa
- [x] Implementar tabla de turnos
- [x] Implementar gráfico de diferencias
- [x] Testear responsive

**Componentes creados:**
- `TurnosFilterBar` - Filtro de estado (abiertos/cerrados)
- `AlertasDiferenciaNegativa` - Panel de alertas con faltantes de caja
- `TurnosTable` - Tabla paginada con detalles de turno
- `DiferenciasChart` - Gráfico de barras de diferencias

**Características:**
- Filtro por estado (abiertos, cerrados, todos)
- Panel de alertas para turnos con diferencia negativa (rojo)
- KPIs: total turnos, abiertos/cerrados, diferencia promedio, diferencia total, turnos con faltante
- Duración promedio de turnos cerrados
- Tabla con: empleado, apertura/cierre, monto apertura, ventas, gastos/retiros, diferencia, duración
- Turnos abiertos marcados con badge "ABIERTO"
- Diferencias en verde (positiva) o rojo (negativa)

### Fase 5: Tab 4 - Empleados ✅ (Completado con vistas)

- [x] Implementar UI del tab Empleados
- [x] Conectar con API `/api/stats/empleados`
- [x] Implementar filtros (rol)
- [x] Implementar selector de vista (Diaria/Semanal/Mensual)
- [x] Implementar vista diaria (turnos del día con horarios)
- [x] Implementar vista semanal (asistencia, horas, ventas)
- [x] Implementar vista mensual (liquidación, ausencias, rendimiento)
- [x] Agregar gráfico de ventas por franja horaria (contexto)
- [x] Agregar gráfico de ventas por día de la semana (contexto)
- [x] Calcular venta por hora trabajada (métrica justa)
- [x] Calcular días programados/trabajados/ausencias
- [x] Testear responsive

**Mejoras implementadas:**
- ✅ **3 vistas por período**: Diaria (turnos), Semanal (asistencia), Mensual (liquidación)
- ✅ **Control de ausencias**: Días programados vs trabajados para liquidar sueldo
- ✅ **Horas trabajadas**: Por turno (diaria) y acumulado (semanal/mensual)
- ✅ **Venta por hora**: Métrica justa que compara eficiencia, no volumen
- ✅ **Calendario visual**: Días trabajados marcados con ✅
- ✅ **Datos para liquidación**: Horas totales, ausencias, rendimiento mensual

**Vista Diaria:**
- Lista de turnos por empleado
- Hora de apertura y cierre de cada turno
- Duración del turno
- Caja inicial y diferencia
- Ventas del turno

**Vista Semanal:**
- Resumen: días trabajados/programados, horas totales, venta/hora, ventas totales
- Calendario visual Lun-Dom con ✅ en días trabajados
- Ausencias marcadas en rojo
- Gráficos de contexto (franjas horarias, días de la semana)

**Vista Mensual:**
- Horas para liquidar (total del mes)
- Asistencia: días trabajados/programados con porcentaje
- Ausencias con porcentaje de falta
- Rendimiento: venta/hora, ticket promedio, total vendido
- Gastos/retiros totales
- Anulaciones, reposiciones, eficiencia

**API actualizada:**
- `diasProgramados`: Días únicos con al menos 1 turno
- `diasTrabajados`: Días con turno cerrado (trabajado)
- `ausencias`: diferencia entre programados y trabajados
- `turnos`: array con detalle de cada turno (openedAt, closedAt, diferencia, duración)

### Fase 6: Tab 6 - Fiados ✅

- [x] Implementar UI del tab Fiados
- [x] Conectar con API `/api/stats/fiados`
- [x] Implementar buscador de clientes
- [x] Implementar filtros (estado: deudores/todos/sin deuda)
- [x] Implementar KPIs de resumen
- [x] Implementar lista de top deudores
- [x] Implementar lista de movimientos recientes
- [x] Implementar tabla de clientes
- [x] Testear responsive

**Componentes creados:**
- `FiadosSearchBar` - Buscador por nombre + filtro de estado
- `TopDeudores` - Lista de principales deudores con alertas
- `MovimientosRecientes` - Historial de compras y pagos recientes
- `ClientesTable` - Tabla paginada de clientes

**Características:**
- Búsqueda por nombre de cliente
- Filtro por estado (deudores, todos, sin deuda)
- KPIs: total clientes, clientes con deuda, deuda total, deuda vencida (>30 días), pagos del mes
- Top deudores con highlight rojo para el #1
- Movimientos recientes con iconos (− rojo para compra, + verde para pago)
- Tabla con: cliente, teléfono, saldo, días de deuda, compras, pagos, último movimiento
### Fase 7: Tab 5 - Stock ✅

- [x] Implementar UI del tab Stock
- [x] Conectar con API `/api/stats/stock`
- [x] Implementar selector de scope (branch/kiosco)
- [x] Implementar KPIs de resumen
- [x] Implementar lista de alertas
- [x] Implementar tabla de reposiciones recientes
- [x] Implementar grid de productos top
- [x] Integrar InventoryValuationPanel
- [x] Testear responsive

**Componentes creados:**
- `StockScopeSelector` - Selector de alcance (sucursal/kiosco)
- `AlertasList` - Lista de alertas de stock con iconos
- `ReposicionesTable` - Tabla de reposiciones recientes
- `ProductosTopGrid` - Grid de productos con mayor valorización

**Características:**
- Selector de scope (branch/kiosco) solo para OWNER
- Reutiliza `InventoryValuationPanel` existente
- KPIs: productos con stock, sin stock, stock bajo, capas abiertas
- Alertas con iconos y colores por tipo (stock bajo, sin stock, vencido, por vencer, reserva pendiente)
- Reposiciones recientes con tipo (recepción, corrección, transferencia)
- Productos top con imagen y valorización
- Alertas limitadas a 20 para performance

---

## ✅ TODOS LOS TABS IMPLEMENTADOS

| Tab | API | UI | Estado |
|-----|-----|-----|--------|
| 📊 Resumen | ✅ | ✅ | Completo |
| 💰 Ventas | ✅ | ✅ | Completo |
| 🕐 Turnos | ✅ | ✅ | Completo |
| 👷 Empleados | ✅ | ✅ | Completo |
| 📦 Stock | ✅ | ✅ | Completo |
| 💳 Fiados | ✅ | ✅ | Completo |
- [ ] Crear `StatsFilterBar.tsx`
- [ ] Crear `AlertBadge.tsx`
- [ ] Crear `EmptyState.tsx`
- [ ] Refactorizar tabs para usar componentes compartidos

### Fase 9: Pulido Final

- [ ] Verificar permisos por rol en todos los tabs
- [ ] Verificar atajos de teclado (1-6 para cambiar tab)
- [ ] Verificar impresión (solo Tab 1)
- [ ] Testear responsive en todos los tabs
- [ ] Testear con datos reales de producción
- [ ] Corregir bugs visuales
- [ ] Optimizar performance (lazy loading de tabs)
- [ ] Documentar en README

---

## 📦 Dependencias

**No se requieren dependencias nuevas.** Se usa:
- React (hooks: `useState`, `useEffect`, `useCallback`, `useMemo`)
- Next.js 16 (App Router, Server Components, Route Handlers)
- Prisma 7 (consultas a PostgreSQL)
- CSS nativo (variables CSS del proyecto)

---

## 🧪 Testing

### Manual (por tab)

1. **Resumen:**
   - [ ] Cambiar entre día/semana/mes
   - [ ] Navegar períodos (anterior/siguiente)
   - [ ] Verificar trends (% de cambio)
   - [ ] Imprimir (Ctrl+P)
   - [ ] Testear atajos ([, ], D, S, M)

2. **Ventas:**
   - [ ] Filtrar por método de pago
   - [ ] Buscar por ticket/producto
   - [ ] Ordenar tabla por columnas
   - [ ] Paginación de tabla
   - [ ] Ver detalle de venta

3. **Turnos:**
   - [ ] Filtrar por estado (abiertos/cerrados)
   - [ ] Ver alertas de diferencia negativa
   - [ ] Ordenar tabla
   - [ ] Ver detalle de turno

4. **Empleados:**
   - [ ] Filtrar por rol
   - [ ] Ver ranking
   - [ ] Ver detalle de empleado
   - [ ] Verificar permisos (CASHIER no ve)

5. **Stock:**
   - [ ] Cambiar scope (branch/kiosco)
   - [ ] Filtrar por tipo de alerta
   - [ ] Ver alertas de vencimiento
   - [ ] Verificar permisos (OWNER ve kiosco)

6. **Fiados:**
   - [ ] Buscar cliente por nombre
   - [ ] Filtrar por estado (deudores/todos)
   - [ ] Ver historial de cliente
   - [ ] Registrar pago (si se implementa)

### Automatizado (futuro)

- [ ] Tests unitarios de APIs
- [ ] Tests de integración de componentes
- [ ] E2E con Playwright

---

## 📈 Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Tiempo de carga por tab | < 2 segundos |
| Lighthouse Performance | > 90 |
| Errores en producción | 0 críticos |
| Feedback de usuarios | Positivo en usabilidad |

---

## 🚨 Consideraciones de Producción

1. **No romper lo que funciona:** El Tab 1 ya está en uso. Cualquier cambio debe ser backward-compatible.

2. **Datos sensibles:** 
   - No exponer costos a empleados CASHIER
   - No exponer fiados de otros kioscos
   - Validar `x-branch-id` en todas las APIs

3. **Performance:**
   - Paginar tablas grandes (> 100 filas)
   - Lazy load de tabs (no cargar datos hasta que se active)
   - Cachear consultas pesadas (InventoryValuation)

4. **Backup de datos:**
   - Todas las consultas son solo lectura (GET)
   - No hay riesgo de modificar datos

5. **Rollback:**
   - Mantener ruta vieja `/estadisticas` como fallback
   - Feature flag para activar nuevos tabs

---

## 📝 Notas

- **Fecha límite estimada:** 2-3 semanas para implementación completa
- **Prioridad:** Tab 1 (Refactor) > Tab 2 (Ventas) > Tab 6 (Fiados) > Tab 3 (Turnos) > Tab 4 (Empleados) > Tab 5 (Stock)
- **Recursos:** 1 desarrollador full-time

---

**Próximo paso:** Comenzar con la Fase 0 (Preparación) - Crear estructura de archivos y mover TabResumen.
