import { openDB } from "idb";

const DB_NAME = "kiosco24-db";
const STORE_NAME = "pending_sales";

export async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

export async function savePendingSale(saleData: any) {
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
  const sales = await getPendingSales();
  if (sales.length === 0) return;

  for (const sale of sales) {
    try {
      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
      });

      if (res.ok) {
        await clearPendingSale(sale.id);
      }
    } catch (err) {
      console.error("Error syncing sale", err);
    }
  }
}
