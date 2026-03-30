import NextAuth, { type DefaultSession } from "next-auth";
import "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getKioscoAccessContextByAccessKey } from "@/lib/access-control";
import { InvalidEmployeePinError, verifyEmployeePinValue } from "@/lib/employee-pin";
import { UserRole, EmployeeRole } from "@prisma/client";

const authSecret =
  process.env.AUTH_SECRET?.trim() ||
  (process.env.NODE_ENV === "development" ? "dev-only-auth-secret" : undefined);

if (!authSecret) {
  throw new Error("AUTH_SECRET is required outside development.");
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: UserRole;
      employeeId?: string;
      employeeRole?: EmployeeRole;
      branchId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: authSecret,
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password as string, user.password);

        if (!isValid) {
          return null;
        }

        return user;
      },
    }),
    Credentials({
      id: "employee-login",
      name: "Empleado",
      credentials: {
        accessKey: { label: "Codigo de acceso", type: "text" },
        employeeId: { label: "Employee ID", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.accessKey || !credentials?.employeeId) {
          return null;
        }

        const branch = await prisma.branch.findUnique({
          where: { accessKey: credentials.accessKey as string },
          select: { id: true },
        });

        if (!branch) {
          return null;
        }

        const access = await getKioscoAccessContextByAccessKey(credentials.accessKey as string);
        if (!access.allowed) {
          return null;
        }

        const employee = await prisma.employee.findUnique({
          where: { id: credentials.employeeId as string },
          select: {
            id: true,
            name: true,
            pin: true,
            active: true,
            suspendedUntil: true,
            role: true,
            branches: {
              where: { id: branch.id },
              select: { id: true }
            }
          },
        });

        if (!employee || !employee.active || employee.branches.length === 0) {
          return null;
        }

        if (employee.suspendedUntil && employee.suspendedUntil > new Date()) {
          return null;
        }

        if (employee.pin) {
          const pin = typeof credentials.pin === "string" ? credentials.pin : "";
          let verification;
          try {
            verification = await verifyEmployeePinValue(employee.pin, pin);
          } catch (error) {
            if (error instanceof InvalidEmployeePinError) {
              return null;
            }
            throw error;
          }
          if (!verification.ok) {
            return null;
          }

          if (verification.upgradedHash) {
            await prisma.employee.update({
              where: { id: employee.id },
              data: { pin: verification.upgradedHash },
            });
          }
        }

        return {
          id: `emp_${employee.id}`,
          name: employee.name,
          role: UserRole.EMPLOYEE,
          employeeId: employee.id,
          employeeRole: employee.role,
          branchId: branch.id,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? UserRole.OWNER;
        if ((user.role ?? UserRole.OWNER) === UserRole.EMPLOYEE) {
          token.employeeId = user.employeeId;
          token.employeeRole = user.employeeRole;
          token.branchId = user.branchId;
        } else {
          delete token.employeeId;
          delete token.employeeRole;
          delete token.branchId;
        }
        return token;
      }

      if (token.role === UserRole.EMPLOYEE) {
        const isValidEmployeeToken =
          typeof token.id === "string" &&
          token.id.startsWith("emp_") &&
          typeof token.employeeId === "string" &&
          typeof token.employeeRole === "string" &&
          typeof token.branchId === "string";

        if (!isValidEmployeeToken) {
          delete token.id;
          delete token.role;
          delete token.employeeId;
          delete token.employeeRole;
          delete token.branchId;
        }
        return token;
      }

      if (!token.role) {
        token.role = UserRole.OWNER;
      }

      return token;
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as UserRole) ?? UserRole.OWNER;
        session.user.employeeId = token.employeeId as string | undefined;
        session.user.employeeRole = token.employeeRole as EmployeeRole | undefined;
        session.user.branchId = token.branchId as string | undefined;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
