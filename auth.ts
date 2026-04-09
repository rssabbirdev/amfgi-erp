import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth';
import Google      from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/prisma';
import bcrypt      from 'bcryptjs';
import type { Permission } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/permissions';

// ── Session / JWT type augmentation ──────────────────────────────────────────
declare module 'next-auth' {
  interface Session {
    user: {
      id:                string;
      isSuperAdmin:      boolean;
      activeCompanyId:   string | null;
      activeCompanySlug: string | null;
      activeCompanyName: string | null;
      permissions:       Permission[];
      allowedCompanyIds: string[];
    } & DefaultSession['user'];
  }
  interface User {
    isSuperAdmin:      boolean;
    activeCompanyId:   string | null;
    activeCompanySlug: string | null;
    activeCompanyName: string | null;
    permissions:       Permission[];
    allowedCompanyIds: string[];
  }
}

// ── Resolve permissions for a user+company combination ───────────────────────
async function resolvePermissions(
  userId: string,
  companyId: string | null
): Promise<Permission[]> {
  if (!companyId) return [];

  // Get user's access to this company
  const access = await prisma.userCompanyAccess.findUnique({
    where: {
      userId_companyId: { userId, companyId },
    },
    include: { role: true },
  });

  if (!access) return [];

  // Super admin has all permissions
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (user?.isSuperAdmin) return ALL_PERMISSIONS;

  // Return role's permissions
  const permissions = (access.role.permissions as Permission[]) ?? [];
  return permissions;
}

const config: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    Credentials({
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            companyAccess: {
              include: { company: true },
            },
          },
        });

        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;

        const userId    = user.id;
        const companyId = user.activeCompanyId;

        // Resolve active company details
        let activeCompanySlug: string | null = null;
        let activeCompanyName: string | null = null;
        if (companyId) {
          const co = await prisma.company.findUnique({
            where: { id: companyId },
          });
          activeCompanySlug = co?.slug ?? null;
          activeCompanyName = co?.name ?? null;
        }

        const permissions    = await resolvePermissions(userId, companyId);
        const allowedCompanyIds = user.companyAccess.map((a) => a.companyId);

        return {
          id:                userId,
          name:              user.name,
          email:             user.email,
          image:             user.image ?? null,
          isSuperAdmin:      user.isSuperAdmin,
          activeCompanyId:   companyId,
          activeCompanySlug,
          activeCompanyName,
          permissions,
          allowedCompanyIds,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email ?? '' },
          include: {
            companyAccess: {
              include: { company: true },
            },
          },
        });

        if (!dbUser || !dbUser.isActive) return '/login?error=NotRegistered';

        const userId    = dbUser.id;
        const companyId = dbUser.activeCompanyId;

        let activeCompanySlug: string | null = null;
        let activeCompanyName: string | null = null;
        if (companyId) {
          const co = await prisma.company.findUnique({
            where: { id: companyId },
          });
          activeCompanySlug = co?.slug ?? null;
          activeCompanyName = co?.name ?? null;
        }

        const permissions       = await resolvePermissions(userId, companyId);
        const allowedCompanyIds = dbUser.companyAccess.map((a) => a.companyId);

        user.id                = userId;
        user.isSuperAdmin      = dbUser.isSuperAdmin;
        user.activeCompanyId   = companyId;
        user.activeCompanySlug = activeCompanySlug;
        user.activeCompanyName = activeCompanyName;
        user.permissions       = permissions;
        user.allowedCompanyIds = allowedCompanyIds;
      }
      return true;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, trigger, session }: any) {
      if (user) {
        token.sub                 = user.id;
        token.isSuperAdmin        = user.isSuperAdmin;
        token.activeCompanyId     = user.activeCompanyId;
        token.activeCompanySlug   = user.activeCompanySlug;
        token.activeCompanyName   = user.activeCompanyName;
        token.permissions         = user.permissions;
        token.allowedCompanyIds   = user.allowedCompanyIds;
      }
      // Company switch — client calls update({ activeCompanyId, ... })
      if (trigger === 'update' && session?.activeCompanyId !== undefined) {
        token.activeCompanyId   = session.activeCompanyId;
        token.activeCompanySlug = session.activeCompanySlug;
        token.activeCompanyName = session.activeCompanyName;
        token.permissions       = session.permissions;
      }
      return token;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      session.user.id                = token.sub;
      session.user.isSuperAdmin      = token.isSuperAdmin ?? false;
      session.user.activeCompanyId   = token.activeCompanyId ?? null;
      session.user.activeCompanySlug = token.activeCompanySlug ?? null;
      session.user.activeCompanyName = token.activeCompanyName ?? null;
      session.user.permissions       = token.permissions ?? [];
      session.user.allowedCompanyIds = token.allowedCompanyIds ?? [];
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
