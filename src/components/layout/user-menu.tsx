"use client";

import { LogOut } from "lucide-react";

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
import { signOut } from "@/lib/auth/actions";
import { ka } from "@/lib/i18n/ka";

export function UserMenu({
  displayName,
  email,
  avatarUrl,
}: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={ka.nav.userMenu}
        >
          <Avatar className="size-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">
              {displayName.trim().slice(0, 1).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate font-medium">{displayName}</span>
          {email ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <form action={signOut}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut />
              {ka.auth.signOut}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
