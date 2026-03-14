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
    return new PrismaClient();
  }

  try {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaNeon(pool as any);

    console.log('✅ [Prisma Init] Initializing with Neon adapter');

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  } catch (err: any) {
    console.error('❌ [Prisma Init] Fallback to basic client:', err.message);
    return new PrismaClient({
      log: ['error']
    });
  }
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
