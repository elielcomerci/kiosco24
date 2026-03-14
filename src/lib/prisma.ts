import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, Prisma } from '@prisma/client';
import ws from 'ws';

// Re-exporting enums and types from the standard client path
export {
  PaymentMethod,
  ExpenseReason,
  Prisma
} from '@prisma/client';

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
} from '@prisma/client';

neonConfig.webSocketConstructor = ws;

const prismaClientSingleton = () => {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  
  if (!connectionString) {
    console.error('❌ [Prisma Init] DATABASE_URL is missing!');
    return new PrismaClient();
  }

  // Use Neon adapter only in production (Vercel/Serverless)
  if (process.env.NODE_ENV === 'production') {
    try {
      console.log('✅ [Prisma Init] Production: Initializing with Neon adapter');
      const pool = new Pool({ connectionString });
      const adapter = new PrismaNeon(pool as any);
      return new PrismaClient({ adapter });
    } catch (err: any) {
      console.error('❌ [Prisma Init] Neon adapter failed:', err.message);
      return new PrismaClient();
    }
  }

  // In local development, the standard Prisma driver is more stable on Windows
  console.log('✅ [Prisma Init] Local: Initializing with standard driver');
  return new PrismaClient();
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
