-- Add restockItemId to SaleLotConsumption
-- Preserva trazabilidad al origen incluso si el StockLot fue eliminado (lote agotado)
ALTER TABLE "SaleLotConsumption"
  ADD COLUMN "restockItemId" TEXT;

-- Índice para auditoría y restore rápido
CREATE INDEX "SaleLotConsumption_restockItemId_idx" ON "SaleLotConsumption"("restockItemId");
