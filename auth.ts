import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth';
import Google      from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import bcrypt      from 'bcryptjs';
import type { Permission } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';

async function getPrisma() {
  const mod = await import('@/lib/db/prisma');
  return mod.prisma;
}

// â”€â”€ Session / JWT type augmentation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      /** Signature image URL for print templates */
      signatureUrl:      string | null;
      /** Google Drive file ids kept for cleanup/backward compatibility */
      imageDriveId:      string | null;
      signatureDriveId:  string | null;
      /** HR employee self-service link (same company scope as active company) */
      linkedEmployeeId:  string | null;
    } & DefaultSession['user'];
  }
  interface User {
    isSuperAdmin:      boolean;
    activeCompanyId:   string | null;
    activeCompanySlug: string | null;
    activeCompanyName: string | null;
    permissions:       Permission[];
    allowedCompanyIds: string[];
    signatureUrl?:     string | null;
    imageDriveId?:     string | null;
    signatureDriveId?: string | null;
    linkedEmployeeId?: string | null;
  }
}

// â”€â”€ Resolve permissions for a user+company combination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function resolvePermissions(
  userId: string,
  companyId: string | null
): Promise<Permission[]> {
  if (!companyId) return [];
  const prisma = await getPrisma();

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
  trustHost: true,
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
        const prisma = await getPrisma();

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            image: true,
            imageDriveId: true,
            signatureUrl: true,
            signatureDriveId: true,
            isSuperAdmin: true,
            activeCompanyId: true,
            linkedEmployeeId: true,
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

        const profileImg = user.image?.trim() ? convertGoogleDriveUrl(user.image.trim()) : null;
        const sigImg = user.signatureUrl?.trim()
          ? convertGoogleDriveUrl(user.signatureUrl.trim())
          : null;

        return {
          id:                userId,
          name:              user.name,
          email:             user.email,
          image:             profileImg,
          signatureUrl:      sigImg,
          imageDriveId:      user.imageDriveId ?? null,
          signatureDriveId:  user.signatureDriveId ?? null,
          isSuperAdmin:      user.isSuperAdmin,
          activeCompanyId:   companyId,
          activeCompanySlug,
          activeCompanyName,
          permissions,
          allowedCompanyIds,
          linkedEmployeeId: user.linkedEmployeeId ?? null,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const prisma = await getPrisma();
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email ?? '' },
          include: {
            companyAccess: {
              include: { company: true },
            },
          },
          // linkedEmployeeId is on User root
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
        user.linkedEmployeeId  = dbUser.linkedEmployeeId ?? null;
      }
      return true;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, trigger, session }: any) {
      if (user) {
        token.sub                 = user.id;
        token.name                = user.name;
        token.isSuperAdmin        = user.isSuperAdmin;
        token.activeCompanyId     = user.activeCompanyId;
        token.activeCompanySlug   = user.activeCompanySlug;
        token.activeCompanyName   = user.activeCompanyName;
        token.permissions         = user.permissions;
        token.allowedCompanyIds   = user.allowedCompanyIds;
        token.picture             = user.image ?? token.picture;
        token.signatureUrl        = user.signatureUrl ?? null;
        token.imageDriveId        = user.imageDriveId ?? null;
        token.signatureDriveId    = user.signatureDriveId ?? null;
        token.linkedEmployeeId    = user.linkedEmployeeId ?? null;
      }
      if (token.sub && !token.profileLoaded) {
        const prisma = await getPrisma();
        const u = await prisma.user.findUnique({
          where: { id: token.sub as string },
          select: {
            image: true,
            imageDriveId: true,
            signatureUrl: true,
            signatureDriveId: true,
            linkedEmployeeId: true,
          },
        });
        if (u) {
          token.linkedEmployeeId   = u.linkedEmployeeId ?? null;
          token.imageDriveId     = u.imageDriveId ?? null;
          token.signatureDriveId = u.signatureDriveId ?? null;
          token.picture =
            (u.image?.trim() ? convertGoogleDriveUrl(u.image.trim()) : null) ??
            token.picture;
          token.signatureUrl =
            (u.signatureUrl?.trim() ? convertGoogleDriveUrl(u.signatureUrl.trim()) : null) ??
            null;
        }
        token.profileLoaded = true;
      }
      // Company switch â€” client calls update({ activeCompanyId, ... })
      if (trigger === 'update' && session?.activeCompanyId !== undefined) {
        token.activeCompanyId   = session.activeCompanyId;
        token.activeCompanySlug = session.activeCompanySlug;
        token.activeCompanyName = session.activeCompanyName;
        token.permissions       = session.permissions;
      }
      if (trigger === 'update' && token.sub) {
        const prisma = await getPrisma();
        const linkRow = await prisma.user.findUnique({
          where: { id: token.sub as string },
          select: { linkedEmployeeId: true },
        });
        token.linkedEmployeeId = linkRow?.linkedEmployeeId ?? token.linkedEmployeeId ?? null;
      }
      if (trigger === 'update' && session) {
        if (session.image !== undefined) token.picture = session.image;
        if (session.signatureUrl !== undefined) token.signatureUrl = session.signatureUrl;
        if (session.name !== undefined) token.name = session.name;
        if (session.imageDriveId !== undefined) token.imageDriveId = session.imageDriveId;
        if (session.signatureDriveId !== undefined) token.signatureDriveId = session.signatureDriveId;
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
      session.user.image             = token.picture ?? session.user.image;
      session.user.signatureUrl      = token.signatureUrl ?? null;
      session.user.imageDriveId      = token.imageDriveId ?? null;
      session.user.signatureDriveId  = token.signatureDriveId ?? null;
      session.user.linkedEmployeeId  = token.linkedEmployeeId ?? null;
      if (token.name) session.user.name = token.name;
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(config);
