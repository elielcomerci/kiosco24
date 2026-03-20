import { openDB } from "idb";

const DB_NAME = "kiosco24-db";
const STORE_NAME = "pending_sales";

type PendingSaleRecord = {
  id?: number;
  branchId?: string;
  clientSaleId?: string;
  timestamp?: number;
  items: unknown[];
  total: number;
  paymentMethod: string;
  receivedAmount?: number | null;
  creditCustomerId?: string | null;
};

export async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

export async function savePendingSale(saleData: PendingSaleRecord) {
  const db = await getDb();
  await db.add(STORE_NAME, {
    ...saleData,
    timestamp: Date.now(),
  });
}

export async function getPendingSales() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function clearPendingSale(id: number) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function syncPendingSales() {
  if (!navigator.onLine) return;
  const sales = (await getPendingSales()) as PendingSaleRecord[];
  if (sales.length === 0) return;

  for (const sale of sales) {
    if (!sale.id) {
      continue;
    }

    if (!sale.branchId) {
      console.warn("[Offline] Venta pendiente sin branchId. No se puede sincronizar de forma segura.", sale);
      continue;
    }

    try {
      const { id, timestamp: _timestamp, ...payload } = sale;
      void _timestamp;
      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": sale.branchId,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await clearPendingSale(id);
      }
    } catch (err) {
      console.error("Error syncing sale", err);
    }
  }
}
