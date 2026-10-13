"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgOption } from "@/lib/auth/organization";

function orgInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function OrgSwitcher({
  options,
  activeId,
}: {
  options: OrgOption[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const active = options.find((option) => option.organization_id === activeId) ?? options[0];
  if (!active) return null;

  async function switchOrg(organizationId: string) {
    if (organizationId === active.organization_id || pendingId) return;
    setPendingId(organizationId);
    try {
      const response = await fetch("/api/organizations/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (!response.ok) return;
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (options.length <= 1) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-[11px] font-semibold text-indigo-700">
          {orgInitials(active.name)}
        </div>
        <div className="text-xs font-semibold text-slate-900">{active.name}</div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-[11px] font-semibold text-indigo-700">
          {orgInitials(active.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-900">{active.name}</div>
          <div className="text-[10px] text-slate-500">Chuyển tổ chức</div>
        </div>
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {options.map((option) => {
          const isActive = option.organization_id === active.organization_id;
          const switching = pendingId === option.organization_id;
          return (
            <DropdownMenuItem
              key={option.organization_id}
              onSelect={(event) => {
                event.preventDefault();
                void switchOrg(option.organization_id);
              }}
              disabled={switching}
              className="flex items-center gap-2.5"
            >
              <Building2 size={15} className="shrink-0 text-slate-400" />
              <span className="flex-1 truncate text-sm font-medium">{option.name}</span>
              {switching ? (
                <Loader2 size={15} className="animate-spin text-slate-400" />
              ) : (
                isActive && <Check size={15} className="text-indigo-600" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
