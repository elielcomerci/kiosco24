-- Add traceability fields to StockLot
-- restockItemId: vincula al RestockItem origen (trazabilidad atómica)
-- ingressOrder: orden secuencial dentro del mismo ingreso
ALTER TABLE "StockLot"
  ADD COLUMN "restockItemId" TEXT,
  ADD COLUMN "ingressOrder"  INTEGER;

-- Índice para auditoría rápida por origen
CREATE INDEX "StockLot_restockItemId_ingressOrder_idx" ON "StockLot"("restockItemId", "ingressOrder");
