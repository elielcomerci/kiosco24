import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '.prisma/client';

// Re-exporting for compatibility - Prisma 7 stores generated types in .prisma/client
export { PaymentMethod, ExpenseReason, Prisma } from '.prisma/client';
export type { User, Kiosco, Branch, Product, InventoryRecord, Employee, Shift, Expense, Withdrawal, Sale, SaleItem, CreditCustomer, CreditPayment } from '.prisma/client';

const isEdge = typeof (globalThis as any).EdgeRuntime === 'string';

// Use standard pg Pool in Node.js (TCP/SSL, no WebSockets needed).
// This bypasses all @neondatabase/serverless WebSocket issues on Windows.
// For Edge Runtime (Middleware), pg won't work — but auth.ts only uses JWT there.

const prismaClientSingleton = () => {
  const connectionString = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing.');
  }

  const host = connectionString.match(/@([^/:]+)/)?.[1] || 'unknown';
  console.log(`📡 [Prisma Init] pg TCP | Runtime: ${isEdge ? 'Edge' : 'Node'} | Host: ${host}`);

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as any);

  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
