"use client";

/**
 * Query-string filter bar shared by the inbox and the parent assignment list.
 * Selecting a value rewrites `?child=…&subject=…` and lets the Server
 * Component re-read — no client-side data fetching.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export type FilterSpec = {
  /** Query-string key. */
  name: string;
  label: string;
  value: string | null;
  options: FilterOption[];
};

const ALL = "__all__";

export function FilterBar({
  filters,
  className,
}: {
  filters: FilterSpec[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = filters.some((filter) => filter.value);

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === ALL) next.delete(name);
    else next.set(name, value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <Select
          key={filter.name}
          value={filter.value ?? ALL}
          onValueChange={(value) => setParam(filter.name, value)}
        >
          <SelectTrigger
            aria-label={filter.label}
            className="h-9 w-[min(14rem,45vw)]"
          >
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{filter.label}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {active ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
        >
          {ka.inbox.clearFilters}
        </Button>
      ) : null}
    </div>
  );
}
