"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveChild } from "@/lib/auth/actions";
import { ka } from "@/lib/i18n/ka";

export type SwitchableChild = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export function ChildSwitcher({
  items,
  activeChildId,
}: {
  items: SwitchableChild[];
  activeChildId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (items.length === 0) return null;

  const active = items.find((child) => child.id === activeChildId) ?? items[0];

  function select(childId: string) {
    startTransition(async () => {
      await setActiveChild(childId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-label={ka.parent.childSwitcher}
          className="max-w-44 gap-2"
        >
          <Avatar className="size-5">
            {active.avatarUrl ? (
              <AvatarImage src={active.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="text-[10px]">
              {active.name.trim().slice(0, 1).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{ka.parent.selectChild}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((child) => (
          <DropdownMenuItem
            key={child.id}
            onSelect={() => select(child.id)}
            className="gap-2"
          >
            <Avatar className="size-5">
              {child.avatarUrl ? (
                <AvatarImage src={child.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {child.name.trim().slice(0, 1).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{child.name}</span>
            {child.id === active.id ? (
              <Check className="ms-auto size-4" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
