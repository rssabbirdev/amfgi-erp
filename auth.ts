import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth';
import Google      from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { connectSystemDB }  from '@/lib/db/system';
import { User }    from '@/lib/db/models/system/User';
import { Role }    from '@/lib/db/models/system/Role';
import { Company } from '@/lib/db/models/system/Company';
import bcrypt      from 'bcryptjs';
import type { Permission } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/permissions';

// ── Session / JWT type augmentation ──────────────────────────────────────────
declare module 'next-auth' {
  interface Session {
    user: {
      id:                   string;
      isSuperAdmin:         boolean;
      activeCompanyId:      string | null;
      activeCompanySlug:    string | null;
      activeCompanyDbName:  string | null;
      activeCompanyName:    string | null;
      permissions:          Permission[];
      allowedCompanyIds:    string[];
    } & DefaultSession['user'];
  }
  interface User {
    isSuperAdmin:         boolean;
    activeCompanyId:      string | null;
    activeCompanySlug:    string | null;
    activeCompanyDbName:  string | null;
    activeCompanyName:    string | null;
    permissions:          Permission[];
    allowedCompanyIds:    string[];
  }
}

// ── Resolve permissions for a user+company combination ───────────────────────
async function resolvePermissions(
  userId: string,
  companyId: string | null
): Promise<Permission[]> {
  if (!companyId) return [];
  const user = await User.findById(userId).lean();
  if (!user) return [];
  if (user.isSuperAdmin) return ALL_PERMISSIONS;

  const access = user.companyAccess.find(
    (a: { companyId: { toString(): string }; roleId: unknown }) =>
      a.companyId.toString() === companyId
  );
  if (!access) return [];

  const role = await Role.findById(access.roleId).lean();
  return (role?.permissions ?? []) as Permission[];
}

const config: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages:   { signIn: '/login', error: '/login' },
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
        await connectSystemDB();

        const user = await User.findOne({ email: credentials.email, isActive: true })
          .select('+password')
          .lean();
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;

        const userId    = (user._id as { toString(): string }).toString();
        const companyId = user.activeCompanyId?.toString() ?? null;

        // Resolve active company details
        let activeCompanySlug:   string | null = null;
        let activeCompanyDbName: string | null = null;
        let activeCompanyName:   string | null = null;
        if (companyId) {
          const co = await Company.findById(companyId).lean();
          activeCompanySlug   = co?.slug   ?? null;
          activeCompanyDbName = co?.dbName ?? null;
          activeCompanyName   = co?.name   ?? null;
        }

        const permissions    = await resolvePermissions(userId, companyId);
        const allowedCompanyIds = user.companyAccess.map((a: { companyId: { toString(): string } }) => a.companyId.toString());

        return {
          id:                  userId,
          name:                user.name,
          email:               user.email,
          image:               user.image ?? null,
          isSuperAdmin:        user.isSuperAdmin,
          activeCompanyId:     companyId,
          activeCompanySlug,
          activeCompanyDbName,
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
        await connectSystemDB();
        const dbUser = await User.findOne({ email: user.email, isActive: true }).lean();
        if (!dbUser) return '/login?error=NotRegistered';

        const userId    = (dbUser._id as { toString(): string }).toString();
        const companyId = dbUser.activeCompanyId?.toString() ?? null;

        let activeCompanySlug:   string | null = null;
        let activeCompanyDbName: string | null = null;
        let activeCompanyName:   string | null = null;
        if (companyId) {
          const co = await Company.findById(companyId).lean();
          activeCompanySlug   = co?.slug   ?? null;
          activeCompanyDbName = co?.dbName ?? null;
          activeCompanyName   = co?.name   ?? null;
        }

        const permissions       = await resolvePermissions(userId, companyId);
        const allowedCompanyIds = dbUser.companyAccess.map((a: { companyId: { toString(): string } }) => a.companyId.toString());

        user.id                  = userId;
        user.isSuperAdmin        = dbUser.isSuperAdmin;
        user.activeCompanyId     = companyId;
        user.activeCompanySlug   = activeCompanySlug;
        user.activeCompanyDbName = activeCompanyDbName;
        user.activeCompanyName   = activeCompanyName;
        user.permissions         = permissions;
        user.allowedCompanyIds   = allowedCompanyIds;
      }
      return true;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, trigger, session }: any) {
      if (user) {
        token.sub                  = user.id;
        token.isSuperAdmin         = user.isSuperAdmin;
        token.activeCompanyId      = user.activeCompanyId;
        token.activeCompanySlug    = user.activeCompanySlug;
        token.activeCompanyDbName  = user.activeCompanyDbName;
        token.activeCompanyName    = user.activeCompanyName;
        token.permissions          = user.permissions;
        token.allowedCompanyIds    = user.allowedCompanyIds;
      }
      // Company switch — client calls update({ activeCompanyId, ... })
      if (trigger === 'update' && session?.activeCompanyId !== undefined) {
        token.activeCompanyId     = session.activeCompanyId;
        token.activeCompanySlug   = session.activeCompanySlug;
        token.activeCompanyDbName = session.activeCompanyDbName;
        token.activeCompanyName   = session.activeCompanyName;
        token.permissions         = session.permissions;
      }
      return token;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      session.user.id                  = token.sub;
      session.user.isSuperAdmin        = token.isSuperAdmin        ?? false;
      session.user.activeCompanyId     = token.activeCompanyId     ?? null;
      session.user.activeCompanySlug   = token.activeCompanySlug   ?? null;
      session.user.activeCompanyDbName = token.activeCompanyDbName ?? null;
      session.user.activeCompanyName   = token.activeCompanyName   ?? null;
      session.user.permissions         = token.permissions         ?? [];
      session.user.allowedCompanyIds   = token.allowedCompanyIds   ?? [];
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
