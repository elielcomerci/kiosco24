import NextAuth, { type DefaultSession } from "next-auth";
import { type JWT } from "next-auth/jwt";
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
      role?: UserRole;
      employeeId?: string;
      branchId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    employeeId?: string;
    branchId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    employeeId?: string;
    branchId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as any),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || "8f9e2b1c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u",
  trustHost: true,
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
  ],
  callbacks: {
    jwt({ token, user }) {
      if (!user && typeof token.id === "string" && token.id.startsWith("emp_")) {
        delete token.id;
        delete token.role;
        delete token.employeeId;
        delete token.branchId;
        return token;
      }

      if (user) {
        token.id = user.id;
        token.role = user.role ?? UserRole.OWNER;
        delete token.employeeId;
        delete token.branchId;
      } else if (!token.role) {
        token.role = UserRole.OWNER;
      }

      return token;
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as UserRole) ?? UserRole.OWNER;
        session.user.employeeId = token.employeeId as string | undefined;
        session.user.branchId = token.branchId as string | undefined;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
