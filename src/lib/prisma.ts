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
  let connectionString = (process.env.DATABASE_URL || '').trim();
  
  // Si por alguna razón está vacía pero tenemos NEXTAUTH_URL, 
  // sospechamos de un problema de carga de .env y varemos de dónde sacar la URL.
  if (!connectionString) {
    console.error('❌ [Prisma Init] DATABASE_URL IS EMPTY! Environment might be reloading.');
    return new PrismaClient({ log: ['error'] });
  }

  console.log(`✅ [Prisma Init] Preparing Neon Pool. URL length: ${connectionString.length}`);
  
  try {
    const url = new URL(connectionString);
    console.log(`✅ [Prisma Init] DB Host: ${url.host}`);
    
    const pool = new Pool({ connectionString });
    const adapter = new PrismaNeon(pool as any);

    return new PrismaClient({
      adapter,
      datasourceUrl: connectionString,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  } catch (err: any) {
    console.error('❌ [Prisma Init] CRITICAL FAILURE during initialization:', err.message);
    return new PrismaClient({ log: ['error'] });
  }
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
