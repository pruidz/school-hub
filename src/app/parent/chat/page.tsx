import { MessagesSquare } from "lucide-react";

import { ka } from "@/lib/i18n/ka";

/**
 * The right-hand pane with nothing open yet.
 *
 * On a phone this never shows: `ChatPanes` gives the whole screen to the list
 * until a thread is opened, so this is the desktop "pick a conversation" state
 * only.
 */
export default function ParentChatIndexPage() {
  return (
    <div className="hidden h-full min-h-0 place-items-center rounded-xl border border-dashed bg-card/40 p-8 text-center lg:grid">
      <div className="grid justify-items-center gap-1">
        <MessagesSquare className="size-7 text-muted-foreground" />
        <p className="text-base font-medium">{ka.messages.pickThread}</p>
        <p className="max-w-xs text-sm text-balance text-muted-foreground">
          {ka.messages.pickThreadHint}
        </p>
      </div>
    </div>
  );
}
