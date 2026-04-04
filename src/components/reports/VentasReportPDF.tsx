import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

interface ReportData {
  branchName: string;
  kioscoName: string;
  period: { from: string; to: string };
  summary: {
    totalVentas: number;
    ventasEfectivo: number;
    ventasMp: number;
    ventasDebito: number;
    ventasTransferencia: number;
    ventasTarjeta: number;
    ventasFiado: number;
    totalGastos: number;
    totalRetiros: number;
    ganancia: number | null;
    hasCosts: boolean;
  };
  stats: {
    totalVentas: number;
    totalGastos: number;
    totalRetiros: number;
    totalTurnos: number;
  };
  sales: Array<{
    id: string;
    date: string;
    total: number;
    paymentMethod: string;
    employeeName: string;
    itemsCount: number;
  }>;
  expenses: Array<{
    id: string;
    date: string;
    amount: number;
    reason: string;
    note: string | null;
    employeeName: string;
  }>;
  withdrawals: Array<{
    id: string;
    date: string;
    amount: number;
    note: string | null;
    employeeName: string;
  }>;
  shifts: Array<{
    id: string;
    openedAt: string;
    closedAt: string | null;
    employeeName: string;
    openingAmount: number;
    closingAmount: number | null;
    difference: number | null;
  }>;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 30,
    paddingLeft: 30,
    paddingRight: 30,
    lineHeight: 1.5,
    color: "#1f2937",
  },
  header: {
    marginBottom: 20,
    borderBottom: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#111827",
  },
  subtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 3,
  },
  period: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#374151",
    backgroundColor: "#f3f4f6",
    padding: 8,
    borderRadius: 4,
  },
  summaryGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    width: "48%",
    padding: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    border: "1 solid #e5e7eb",
  },
  summaryCardLabel: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 3,
  },
  summaryCardValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
  },
  summaryCardValuePositive: {
    color: "#059669",
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontWeight: "bold",
    fontSize: 9,
    borderBottom: "1 solid #d1d5db",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    borderBottom: "1 solid #f3f4f6",
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
  },
  col1: { width: "18%" },
  col2: { width: "15%" },
  col3: { width: "20%" },
  col4: { width: "15%" },
  col5: { width: "12%" },
  col6: { width: "20%" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 8,
    color: "#9ca3af",
    borderTop: "1 solid #e5e7eb",
    paddingTop: 10,
  },
});

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: "Efectivo",
    MERCADOPAGO: "MercadoPago",
    DEBIT: "Débito",
    TRANSFER: "Transferencia",
    CREDIT_CARD: "Tarjeta",
    CREDIT: "Fiado",
  };
  return labels[method] || method;
}

function getExpenseReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    SUPPLIES: "Insumos",
    MAINTENANCE: "Mantenimiento",
    SERVICES: "Servicios",
    OTHER: "Otro",
  };
  return labels[reason] || reason;
}

export default function VentasReportPDF({ data }: { data: ReportData }) {
  const { summary, stats, sales, expenses, withdrawals, shifts } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Ventas</Text>
          <Text style={styles.subtitle}>{data.kioscoName}</Text>
          <Text style={styles.subtitle}>{data.branchName}</Text>
          <Text style={styles.period}>
            Período: {formatDate(data.period.from)} - {formatDate(data.period.to)}
          </Text>
        </View>

        {/* Resumen */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen del Período</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Total Ventas</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.totalVentas)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Efectivo</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.ventasEfectivo)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>MercadoPago</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.ventasMp)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Débito</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.ventasDebito)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Transferencia</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.ventasTransferencia)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Tarjeta</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.ventasTarjeta)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Fiado</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.ventasFiado)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Gastos</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.totalGastos)}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Retiros</Text>
              <Text style={styles.summaryCardValue}>
                {formatCurrency(summary.totalRetiros)}
              </Text>
            </View>
            {summary.hasCosts && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Ganancia Estimada</Text>
                <Text
                  style={[
                    styles.summaryCardValue,
                    styles.summaryCardValuePositive,
                  ]}
                >
                  {summary.ganancia !== null
                    ? formatCurrency(summary.ganancia)
                    : "N/A"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Estadísticas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estadísticas</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Ventas Realizadas</Text>
              <Text style={styles.summaryCardValue}>{stats.totalVentas}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Gastos Registrados</Text>
              <Text style={styles.summaryCardValue}>{stats.totalGastos}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Retiros</Text>
              <Text style={styles.summaryCardValue}>{stats.totalRetiros}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Turnos</Text>
              <Text style={styles.summaryCardValue}>{stats.totalTurnos}</Text>
            </View>
          </View>
        </View>

        {/* Ventas */}
        {sales.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Ventas ({sales.length} registros)
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Fecha</Text>
                <Text style={styles.col2}>Método</Text>
                <Text style={styles.col3}>Empleado</Text>
                <Text style={styles.col4}>Items</Text>
                <Text style={styles.col5}>Total</Text>
              </View>
              {sales.slice(0, 50).map((sale, index) => (
                <View
                  key={sale.id}
                  style={[
                    styles.tableRow,
                    ...(index % 2 === 1 ? [styles.tableRowAlt] : []),
                  ]}
                >
                  <Text style={styles.col1}>{formatDateTime(sale.date)}</Text>
                  <Text style={styles.col2}>
                    {getPaymentMethodLabel(sale.paymentMethod)}
                  </Text>
                  <Text style={styles.col3}>{sale.employeeName}</Text>
                  <Text style={styles.col4}>{sale.itemsCount}</Text>
                  <Text style={styles.col5}>
                    {formatCurrency(sale.total)}
                  </Text>
                </View>
              ))}
              {sales.length > 50 && (
                <View style={{ padding: 8, backgroundColor: "#fef3c7" }}>
                  <Text style={{ fontSize: 9, color: "#92400e" }}>
                    * Se muestran las primeras 50 ventas de {sales.length}{" "}
                    registros
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Gastos */}
        {expenses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Gastos ({expenses.length} registros)
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Fecha</Text>
                <Text style={styles.col2}>Motivo</Text>
                <Text style={styles.col3}>Empleado</Text>
                <Text style={styles.col4}>Nota</Text>
                <Text style={styles.col5}>Monto</Text>
              </View>
              {expenses.slice(0, 30).map((expense, index) => (
                <View
                  key={expense.id}
                  style={[
                    styles.tableRow,
                    ...(index % 2 === 1 ? [styles.tableRowAlt] : []),
                  ]}
                >
                  <Text style={styles.col1}>{formatDateTime(expense.date)}</Text>
                  <Text style={styles.col2}>
                    {getExpenseReasonLabel(expense.reason)}
                  </Text>
                  <Text style={styles.col3}>{expense.employeeName}</Text>
                  <Text style={styles.col4}>
                    {expense.note?.substring(0, 15) || "-"}
                  </Text>
                  <Text style={styles.col5}>
                    {formatCurrency(expense.amount)}
                  </Text>
                </View>
              ))}
              {expenses.length > 30 && (
                <View style={{ padding: 8, backgroundColor: "#fef3c7" }}>
                  <Text style={{ fontSize: 9, color: "#92400e" }}>
                    * Se muestran los primeros 30 gastos de {expenses.length}{" "}
                    registros
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Retiros */}
        {withdrawals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Retiros ({withdrawals.length} registros)
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Fecha</Text>
                <Text style={styles.col2}>Empleado</Text>
                <Text style={styles.col3}>Nota</Text>
                <Text style={styles.col4}>Monto</Text>
              </View>
              {withdrawals.slice(0, 30).map((w, index) => (
                <View
                  key={w.id}
                  style={[
                    styles.tableRow,
                    ...(index % 2 === 1 ? [styles.tableRowAlt] : []),
                  ]}
                >
                  <Text style={styles.col1}>{formatDateTime(w.date)}</Text>
                  <Text style={styles.col2}>{w.employeeName}</Text>
                  <Text style={styles.col3}>
                    {w.note?.substring(0, 25) || "-"}
                  </Text>
                  <Text style={styles.col4}>{formatCurrency(w.amount)}</Text>
                </View>
              ))}
              {withdrawals.length > 30 && (
                <View style={{ padding: 8, backgroundColor: "#fef3c7" }}>
                  <Text style={{ fontSize: 9, color: "#92400e" }}>
                    * Se muestran los primeros 30 retiros de {withdrawals.length}{" "}
                    registros
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Turnos */}
        {shifts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Turnos ({shifts.length} registros)
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Apertura</Text>
                <Text style={styles.col2}>Cierre</Text>
                <Text style={styles.col3}>Responsable</Text>
                <Text style={styles.col4}>Apertura</Text>
                <Text style={styles.col5}>Cierre</Text>
              </View>
              {shifts.slice(0, 30).map((shift, index) => (
                <View
                  key={shift.id}
                  style={[
                    styles.tableRow,
                    ...(index % 2 === 1 ? [styles.tableRowAlt] : []),
                  ]}
                >
                  <Text style={styles.col1}>{formatDateTime(shift.openedAt)}</Text>
                  <Text style={styles.col2}>
                    {shift.closedAt ? formatDateTime(shift.closedAt) : "Abierto"}
                  </Text>
                  <Text style={styles.col3}>{shift.employeeName}</Text>
                  <Text style={styles.col4}>
                    {formatCurrency(shift.openingAmount)}
                  </Text>
                  <Text style={styles.col5}>
                    {shift.closingAmount !== null
                      ? formatCurrency(shift.closingAmount)
                      : "-"}
                  </Text>
                </View>
              ))}
              {shifts.length > 30 && (
                <View style={{ padding: 8, backgroundColor: "#fef3c7" }}>
                  <Text style={{ fontSize: 9, color: "#92400e" }}>
                    * Se muestran los primeros 30 turnos de {shifts.length}{" "}
                    registros
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Footer */}
        <Text
          style={
            styles.footer
          }
        >
          Generado el {new Date().toLocaleString("es-AR")} - Clikit
        </Text>
      </Page>
    </Document>
  );
}
