import NextAuth, { type DefaultSession } from "next-auth";
import "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { resolveAccessAwareAppStartPath } from "@/lib/app-entry";
import { normalizeBranchAccessKey } from "@/lib/branch-access-key";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  getKioscoAccessContextByAccessKey,
  getKioscoAccessContextForSession,
} from "@/lib/access-control";
import { InvalidEmployeePinError, verifyEmployeePinValue } from "@/lib/employee-pin";
import { UserRole, EmployeeRole } from "@prisma/client";
import { isPlatformAdmin } from "@/lib/platform-admin";

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
      mainBusinessActivity?: string;
      appStartPath?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
    mainBusinessActivity?: string;
    appStartPath?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
    mainBusinessActivity?: string;
    appStartPath?: string;
    appContextVersion?: number;
  }
}

const APP_CONTEXT_VERSION = 1;

type OwnerTokenUser = {
  id: string;
  role?: UserRole;
  email?: string | null;
};

async function resolveOwnerAppContext(user: OwnerTokenUser) {
  if (isPlatformAdmin(user)) {
    return {
      branchId: undefined,
      mainBusinessActivity: undefined,
      appStartPath: "/admin",
    };
  }

  // PARTNER — no tiene kiosco, no necesita consultar access context
  if (user.role === UserRole.PARTNER) {
    return {
      branchId: undefined,
      mainBusinessActivity: undefined,
      appStartPath: "/partner",
    };
  }

  const [access, kiosco] = await Promise.all([
    getKioscoAccessContextForSession({
      id: user.id,
      role: user.role ?? UserRole.OWNER,
      email: user.email ?? null,
    }),
    prisma.kiosco.findUnique({
      where: { ownerId: user.id },
      select: { mainBusinessActivity: true },
    }),
  ]);

  return {
    branchId: access.firstBranchId ?? undefined,
    mainBusinessActivity: kiosco?.mainBusinessActivity ?? undefined,
    appStartPath: resolveAccessAwareAppStartPath(user, access),
  };
}

function applyEmployeeAppContext(
  token: {
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
    mainBusinessActivity?: string;
    appStartPath?: string;
    appContextVersion?: number;
  },
  user: {
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
  },
) {
  token.employeeId = user.employeeId;
  token.employeeRole = user.employeeRole;
  token.branchId = user.branchId;
  delete token.mainBusinessActivity;
  token.appStartPath = user.branchId ? `/${user.branchId}/caja` : "/onboarding";
  token.appContextVersion = APP_CONTEXT_VERSION;
}

function applyPartnerAppContext(token: {
  employeeId?: string;
  employeeRole?: EmployeeRole;
  branchId?: string;
  mainBusinessActivity?: string;
  appStartPath?: string;
  appContextVersion?: number;
}) {
  delete token.employeeId;
  delete token.employeeRole;
  delete token.branchId;
  delete token.mainBusinessActivity;
  token.appStartPath = "/partner";
  token.appContextVersion = APP_CONTEXT_VERSION;
}

async function applyOwnerAppContext(
  token: {
    employeeId?: string;
    employeeRole?: EmployeeRole;
    branchId?: string;
    mainBusinessActivity?: string;
    appStartPath?: string;
    appContextVersion?: number;
  },
  user: OwnerTokenUser,
) {
  delete token.employeeId;
  delete token.employeeRole;

  const appContext = await resolveOwnerAppContext(user);
  token.branchId = appContext.branchId;
  token.mainBusinessActivity = appContext.mainBusinessActivity;
  token.appStartPath = appContext.appStartPath;
  token.appContextVersion = APP_CONTEXT_VERSION;
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

        const normalizedAccessKey = normalizeBranchAccessKey(credentials.accessKey as string);
        if (!normalizedAccessKey) {
          return null;
        }

        const branch = await prisma.branch.findUnique({
          where: { accessKey: normalizedAccessKey },
          select: { id: true },
        });

        if (!branch) {
          return null;
        }

        const access = await getKioscoAccessContextByAccessKey(normalizedAccessKey);
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
              select: { id: true },
            },
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
    async jwt({ token, user }) {
      // Primer login: user viene populado
      if (user) {
        const userId = typeof user.id === "string" ? user.id : undefined;
        if (!userId) {
          return token;
        }

        token.id = userId;
        token.role = user.role ?? UserRole.OWNER;

        if ((user.role ?? UserRole.OWNER) === UserRole.EMPLOYEE) {
          applyEmployeeAppContext(token, user);
        } else if (user.role === UserRole.PARTNER) {
          // PARTNER — contexto simple, sin queries a kiosco
          applyPartnerAppContext(token);
        } else {
          await applyOwnerAppContext(token, {
            id: userId,
            role: user.role ?? UserRole.OWNER,
            email: user.email ?? null,
          });
        }

        return token;
      }

      // Requests subsiguientes: validar token de empleado
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
          delete token.appStartPath;
          delete token.appContextVersion;
        } else if (token.appContextVersion !== APP_CONTEXT_VERSION) {
          applyEmployeeAppContext(token, {
            employeeId: token.employeeId,
            employeeRole: token.employeeRole as EmployeeRole | undefined,
            branchId: token.branchId,
          });
        }
        return token;
      }

      // Requests subsiguientes: partner
      if (token.role === UserRole.PARTNER) {
        if (token.appContextVersion !== APP_CONTEXT_VERSION) {
          applyPartnerAppContext(token);
        }
        return token;
      }

      if (!token.role) {
        token.role = UserRole.OWNER;
      }

      if (token.appContextVersion !== APP_CONTEXT_VERSION) {
        if (typeof token.id === "string") {
          await applyOwnerAppContext(token, {
            id: token.id,
            role: token.role as UserRole | undefined,
            email: token.email ?? null,
          });
        } else {
          token.appStartPath = isPlatformAdmin({
            role: token.role as UserRole | undefined,
            email: token.email ?? null,
          })
            ? "/admin"
            : "/onboarding";
          token.appContextVersion = APP_CONTEXT_VERSION;
        }
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
        session.user.mainBusinessActivity = token.mainBusinessActivity as string | undefined;
        session.user.appStartPath = token.appStartPath as string | undefined;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});