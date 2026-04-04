import { openDB } from "idb";
import { LEGACY_OFFLINE_DB_NAME, OFFLINE_DB_NAME } from "@/lib/brand";

const STORE_NAME = "pending_sales";
let dbNamePromise: Promise<string> | null = null;

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

async function resolveDbName() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    return LEGACY_OFFLINE_DB_NAME;
  }

  const databases = await indexedDB.databases();
  if (databases.some((database) => database.name === OFFLINE_DB_NAME)) {
    return OFFLINE_DB_NAME;
  }
  if (databases.some((database) => database.name === LEGACY_OFFLINE_DB_NAME)) {
    return LEGACY_OFFLINE_DB_NAME;
  }

  return OFFLINE_DB_NAME;
}

function getResolvedDbName() {
  if (!dbNamePromise) {
    dbNamePromise = resolveDbName();
  }

  return dbNamePromise;
}

export async function getDb() {
  return openDB(await getResolvedDbName(), 1, {
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
