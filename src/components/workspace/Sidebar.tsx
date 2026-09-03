"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TradeReadyLogo } from "../brand/TradeReadyLogo";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/Avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "../ui/DropdownMenu";
import { useI18n } from "../providers/I18nProvider";
import { LOCALES, Locale } from "@/lib/i18n";

const navigationKeys = [
  { key: "dashboard", href: "/dashboard", icon: HomeIcon },
  { key: "cases", href: "/cases", icon: FolderIcon },
  { key: "documents", href: "/documents", icon: DocumentTextIcon },
] as const;

const managementKeys = [
  { key: "activity", href: "/dashboard/activity", icon: ClockIcon },
  { key: "queue", href: "/dashboard/queue", icon: QueueListIcon },
  { key: "trash", href: "/dashboard/trash", icon: TrashIcon },
] as const;

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { dictionary, locale, setLocale } = useI18n();

  return (
    <div className={cn("flex h-full flex-col bg-surface border-r border-border", className)}>
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-border">
        <Link href="/">
          <TradeReadyLogo variant="workspace" tone="default" />
        </Link>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
        {/* Workspace Switcher / User Profile */}
        <div className="mb-8 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue">
              <Avatar className="h-10 w-10 border border-border shrink-0">
                <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || session?.user?.email || "User")}&background=random`} alt={session?.user?.name || "User"} />
                <AvatarFallback>{session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm font-semibold text-ink">{session?.user?.name || "Personal Workspace"}</span>
                <span className="truncate text-xs text-muted">Free Plan</span>
              </div>
              <ChevronUpDownIcon className="h-4 w-4 text-muted shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-ink truncate">{session?.user?.name || "User"}</p>
                <p className="text-xs text-muted truncate">{session?.user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account" className="cursor-pointer">Account Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/sessions" className="cursor-pointer">Active Sessions</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-3 py-2">
                <p className="text-xs font-semibold text-muted mb-2 uppercase tracking-wider">Language</p>
                <div className="flex gap-2">
                  {LOCALES.map((l) => (
                    <button
                      key={l}
                      onClick={(e) => { e.preventDefault(); setLocale(l); }}
                      className={cn(
                        "text-xs px-2 py-1 rounded border transition-colors",
                        locale === l ? "bg-blue text-white border-blue" : "bg-white text-ink-soft border-border hover:border-slate-300"
                      )}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-error-600 cursor-pointer focus:bg-error-50 focus:text-error-600"
              >
                {dictionary.nav.sign_out || "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex-1 space-y-8">
          <div>
            <ul role="list" className="-mx-2 space-y-1">
              {navigationKeys.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                const name = dictionary.nav[item.key as keyof typeof dictionary.nav];
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium transition-colors relative",
                        isActive
                          ? "bg-blue-soft text-blue"
                          : "text-ink-soft hover:text-ink hover:bg-slate-50"
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -mt-3 h-6 w-1 rounded-r-md bg-blue" />
                      )}
                      <item.icon
                        className={cn(
                          "h-6 w-6 shrink-0",
                          isActive ? "text-blue" : "text-muted group-hover:text-ink-soft"
                        )}
                        aria-hidden="true"
                      />
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold leading-6 text-muted uppercase tracking-wider px-2 mb-2">
              Management
            </div>
            <ul role="list" className="-mx-2 space-y-1">
              {managementKeys.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                const name = dictionary.nav[item.key as keyof typeof dictionary.nav] || item.key;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium transition-colors relative",
                        isActive
                          ? "bg-blue-soft text-blue"
                          : "text-ink-soft hover:text-ink hover:bg-slate-50"
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -mt-3 h-6 w-1 rounded-r-md bg-blue" />
                      )}
                      <item.icon
                        className={cn(
                          "h-6 w-6 shrink-0",
                          isActive ? "text-blue" : "text-muted group-hover:text-ink-soft"
                        )}
                        aria-hidden="true"
                      />
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  );
}

// Icons

function HomeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function FolderIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function DocumentTextIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ClockIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function QueueListIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function TrashIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ChevronUpDownIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
    </svg>
  );
}
