'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { ChevronsUpDown, LogOut, User2 } from 'lucide-react';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/shadcn/sidebar';

export function SidebarNavUser() {
  const { data: session } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);
  const profileHref = selfServiceOnly ? '/me' : '/profile';
  const name = session?.user?.name ?? 'Account';
  const email = session?.user?.email ?? '';
  const avatar = session?.user?.image?.trim() ?? '';
  const initial = name[0]?.toUpperCase() ?? '?';

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="relative flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground ring-1 ring-sidebar-border/40">
                {avatar ? (
                  <Image src={avatar} alt="" fill className="object-cover" sizes="32px" />
                ) : (
                  <span aria-hidden>{initial}</span>
                )}
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold tracking-tight">{name}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{email || 'Signed in'}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side="right"
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {avatar ? (
                    <Image src={avatar} alt="" fill className="object-cover" sizes="32px" />
                  ) : (
                    <span className="text-xs font-medium">{initial}</span>
                  )}
                </div>
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={profileHref} onClick={closeMobile} className="cursor-pointer gap-2">
                <User2 className="size-4 shrink-0" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => {
                closeMobile();
                void signOut({ callbackUrl: '/login' });
              }}
            >
              <LogOut className="size-4 shrink-0" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
