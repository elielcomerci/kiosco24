export interface PeriodoData {
  periodo: string;
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  ventasPorMetodo: Record<string, number>;
  totalGastos: number;
  totalRetiros: number;
  gananciasBrutas: number | null;
  gananciasNetas: number | null;
  hasCosts: boolean;
  margenPorcentaje: number | null;
  promedioVentasDia: number;
  gastosPorCategoria: Record<string, number>;
  topProductos: { name: string; cantidad: number; total: number }[];
  ventasPorDia: { fecha: string; ventas: number; ganancia: number | null }[];
  ventasPorSemana: { semana: number; ventas: number; ganancia: number | null }[] | null;
  ventasAnuladas?: { cantidad: number; total: number };
  prev?: {
    totalVentas: number;
    totalGastos: number;
    gananciasNetas: number | null;
    hasCosts: boolean;
  };
}
