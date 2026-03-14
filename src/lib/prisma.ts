import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, Prisma } from '../generated/prisma';
import ws from 'ws';

// Re-exporting enums and types from the custom generated client path for stability
export {
  PaymentMethod,
  ExpenseReason,
  Prisma
} from '../generated/prisma';

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
  CreditPayment
} from '../generated/prisma';

neonConfig.webSocketConstructor = ws;

const prismaClientSingleton = () => {
  const connectionString = (process.env.DATABASE_URL || '').trim();

  if (!connectionString) {
    console.error('❌ [Prisma Init] DATABASE_URL is missing!');
    // Fallback to basic client if URL is missing (prevents crash during build if not needed)
    return new PrismaClient({ log: ['error'] });
  }

  // Use Neon adapter as recommended for serverless environments with Prisma 7
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool as any);

  console.log('✅ [Prisma Init] Initializing with Neon adapter and custom client');

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
