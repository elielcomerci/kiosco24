import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from ".prisma/client";

export { PaymentMethod, ExpenseReason, MpIncomingPaymentChannel, Prisma } from ".prisma/client";
export type {
  User,
  Kiosco,
  Branch,
  Product,
  InventoryRecord,
  StockLot,
  TicketSettings,
  SaleLotConsumption,
  Employee,
  Shift,
  Expense,
  Withdrawal,
  Sale,
  SaleItem,
  CreditCustomer,
  CreditPayment,
  MpIncomingPaymentNotice,
} from ".prisma/client";

const globalWithEdgeRuntime = globalThis as typeof globalThis & {
  EdgeRuntime?: string;
};

const isEdge = typeof globalWithEdgeRuntime.EdgeRuntime === "string";
type PrismaPgClient = ConstructorParameters<typeof PrismaPg>[0];

function prismaClientSingleton() {
  let connectionString = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing.");
  }

  if (connectionString.includes("sslmode=require")) {
    connectionString = connectionString.replace("sslmode=require", "sslmode=require&uselibpqcompat=true");
  }

  const host = connectionString.match(/@([^/:]+)/)?.[1] || "unknown";
  console.log(`[Prisma Init] pg TCP | Runtime: ${isEdge ? "Edge" : "Node"} | Host: ${host}`);

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as unknown as PrismaPgClient);

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
