import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CalendarDays,
  CheckCircle,
  Flag,
  LogOut,
  Music,
  Newspaper,
  Search,
  Share2,
  Shield,
  Ticket,
  Users,
} from 'lucide-react';
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
  useSidebar,
} from '@/components/ui/sidebar';

type AdminNavItem = { tab: string; label: string; icon: LucideIcon; proofreadOnly?: boolean };

const ADMIN_NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: 'Growth',
    items: [
      { tab: 'users', label: 'Users & Analytics', icon: Users },
      { tab: 'social', label: 'Social Media', icon: Share2 },
      { tab: 'seo', label: 'SEO', icon: Search },
    ],
  },
  {
    label: 'Content',
    items: [
      { tab: 'ai-scene-guides', label: 'AI Scene Guides', icon: Music },
      { tab: 'content-calendar', label: 'Content Calendar', icon: CalendarDays },
      { tab: 'news', label: 'In the News', icon: Newspaper },
      { tab: 'style-guide', label: 'Style Guide', icon: BookOpen },
    ],
  },
  {
    label: 'Newsletter',
    items: [
      { tab: 'newsletter-builder', label: 'Newsletter Builder', icon: Newspaper },
      { tab: 'newsletter-proof', label: 'Proofread', icon: CheckCircle, proofreadOnly: true },
    ],
  },
  {
    label: 'Data & Safety',
    items: [
      { tab: 'events', label: 'Event Analytics', icon: Ticket },
      { tab: 'moderation', label: 'Moderation', icon: Flag },
    ],
  },
];

interface AdminSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  canProofreadNewsletters: boolean;
  onSignOut: () => void;
}

export function AdminSidebar({ activeTab, onSelectTab, canProofreadNewsletters, onSignOut }: AdminSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  const select = (tab: string) => {
    onSelectTab(tab);
    // The mobile sidebar is an overlay sheet; close it so the chosen page is visible.
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <Shield className="h-5 w-5" />
          Synth Admin
        </div>
      </SidebarHeader>
      <SidebarContent>
        {ADMIN_NAV.map((group) => {
          const items = group.items.filter((item) => !item.proofreadOnly || canProofreadNewsletters);
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map(({ tab, label, icon: Icon }) => (
                    <SidebarMenuItem key={tab}>
                      <SidebarMenuButton isActive={activeTab === tab} onClick={() => select(tab)}>
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut}>
              <LogOut />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
