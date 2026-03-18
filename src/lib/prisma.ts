import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from ".prisma/client";
import ws from "ws";

export { PaymentMethod, ExpenseReason, Prisma } from ".prisma/client";
export type {
  User,
  Kiosco,
  Branch,
  Product,
  InventoryRecord,
  Employee,
  Shift,
  Expense,
  Withdrawal,
  Sale,
  SaleItem,
  CreditCustomer,
  CreditPayment,
} from ".prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getConnectionString() {
  const connectionString = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing.");
  }

  return connectionString;
}

function getHostLabel(connectionString: string) {
  return connectionString.match(/@([^/:]+)/)?.[1] || "unknown";
}

function buildProductionClient(connectionString: string) {
  neonConfig.webSocketConstructor = ws;

  console.log(`[Prisma Init] production neon | Host: ${getHostLabel(connectionString)}`);

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

function buildDevelopmentClient(connectionString: string) {
  const normalizedConnectionString = connectionString.includes("sslmode=require")
    ? connectionString.replace("sslmode=require", "sslmode=require&uselibpqcompat=true")
    : connectionString;

  console.log(`[Prisma Init] local pg | Host: ${getHostLabel(normalizedConnectionString)}`);

  const adapter = new PrismaPg({ connectionString: normalizedConnectionString });
  return new PrismaClient({ adapter });
}

function prismaClientSingleton() {
  const connectionString = getConnectionString();

  if (process.env.NODE_ENV === "production") {
    return buildProductionClient(connectionString);
  }

  return buildDevelopmentClient(connectionString);
}

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
