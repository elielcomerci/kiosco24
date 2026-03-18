import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role: UserRole;
      employeeId?: string;
      branchId?: string;
    }
  }

  interface User {
    role?: UserRole;
    employeeId?: string;
    branchId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    employeeId?: string;
    branchId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as any),
  session: { strategy: "jwt" }, 
  secret: process.env.AUTH_SECRET || "8f9e2b1c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u",
  debug: process.env.NODE_ENV === "development",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        return user;
      },
    }),
    Credentials({
      id: "employee-login",
      name: "Empleado",
      credentials: {
        accessKey: { label: "Branch Access Key", type: "text" },
        employeeId: { label: "Employee ID", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.accessKey || !credentials?.employeeId || !credentials?.pin) return null;

        // 1. Validar acceso a la sucursal
        const branch = await prisma.branch.findUnique({
          where: { accessKey: credentials.accessKey as string },
        });
        if (!branch) return null;

        // 2. Buscar empleado
        const employee = await prisma.employee.findUnique({
          where: { id: credentials.employeeId as string },
        });
        if (!employee || !employee.active || employee.branchId !== branch.id) return null;

        // 3. Validar Suspensión
        if (employee.suspendedUntil && employee.suspendedUntil > new Date()) return null;

        // 4. Validar PIN
        if (employee.pin !== (credentials.pin as string)) return null;

        // 5. Retornar "usuario virtual"
        return {
          id: `emp_${employee.id}`,
          name: employee.name,
          role: UserRole.EMPLOYEE,
          employeeId: employee.id,
          branchId: branch.id,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || UserRole.OWNER;
        token.employeeId = user.employeeId;
        token.branchId = user.branchId;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.employeeId = token.employeeId;
        session.user.branchId = token.branchId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
