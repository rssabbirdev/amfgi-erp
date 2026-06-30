'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ChevronsUpDown } from 'lucide-react';

import CompanySwitcher from '@/components/layout/CompanySwitcher';
import { SidebarNavMenu } from '@/components/layout/SidebarNavMenu';
import { SidebarNavUser } from '@/components/layout/SidebarNavUser';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/shadcn/sidebar';

export default function AppNavigationSidebar() {
  const { data: session } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const permissions = (session?.user?.permissions ?? []) as string[];
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const linkedEmployeeId = (session?.user as { linkedEmployeeId?: string | null } | undefined)?.linkedEmployeeId;
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);

  const activeCompanyName = session?.user?.activeCompanyName;
  const initial = activeCompanyName?.[0]?.toUpperCase() ?? 'A';
  const workspaceTitle = selfServiceOnly ? 'Employee Portal' : (activeCompanyName ?? 'Select company');
  const workspaceSubtitle = selfServiceOnly ? 'Self service' : 'AMFGI ERP';
  const homeHref = selfServiceOnly ? '/me' : '/dashboard';
  const teamTooltip = selfServiceOnly ? 'Employee Portal' : (activeCompanyName ?? 'Workspace');

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          {selfServiceOnly ? (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={teamTooltip}>
                <Link
                  href={homeHref}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-border/40">
                    <span aria-hidden>{initial}</span>
                  </div>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold tracking-tight">{workspaceTitle}</span>
                    <span className="truncate text-xs font-normal text-sidebar-foreground/60">{workspaceSubtitle}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden" aria-hidden />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            <CompanySwitcher />
          )}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-0">
        <SidebarGroup className="p-0 px-2 py-3 group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:py-2">
          <SidebarGroupLabel className="px-0 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarNavMenu
              visibility={{
                permissions,
                isSuperAdmin,
                linkedEmployeeId,
                selfServiceOnly,
              }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarNavUser />
        <div
          className={cn(
            'mt-1 px-0 py-1 text-center text-[11px] leading-relaxed text-sidebar-foreground/45',
            'group-data-[collapsible=icon]:hidden',
          )}
        >
          Almuraqib FGI © {new Date().getFullYear()}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
