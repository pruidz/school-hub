"use client";

/**
 * One message in a thread.
 *
 * Client-side since phase 2: the list it belongs to is merged from the socket,
 * so it cannot be a Server Component any more. It renders three kinds of row
 * from the same markup — a confirmed server message, a local copy that is still
 * being sent, and a local copy that failed — so an optimistic message does not
 * jump or change shape when the real row replaces it.
 */

import { AlertCircle, Clock } from "lucide-react";

import { formatDateTime } from "@/features/assignments/dates";
import type { LiveMessage } from "@/lib/realtime";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

export function MessageBubble({
  message,
  urls,
  onRetryDismiss,
}: {
  message: LiveMessage;
  urls: Record<string, string>;
  onRetryDismiss?: () => void;
}) {
  const voiceUrl = message.voicePath ? urls[message.voicePath] : null;
  const sending = message.state === "sending";
  const failed = message.state === "failed";
  const previews = message.previewUrls ?? [];

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        message.isMine ? "items-end" : "items-start",
      )}
    >
      <span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
        {message.isMine
          ? ka.messages.you
          : (message.authorName ?? ka.messages.unknownAuthor)}
        {" · "}
        {sending ? (
          <>
            <Clock className="size-3" />
            {ka.messages.sending}
          </>
        ) : failed ? (
          <span className="flex items-center gap-1 font-medium text-destructive">
            <AlertCircle className="size-3" />
            {ka.messages.errSendFailed}
          </span>
        ) : (
          formatDateTime(message.createdAt)
        )}
      </span>

      <div
        className={cn(
          "grid max-w-[85%] gap-2 rounded-2xl px-3 py-2 text-sm",
          message.isMine
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
          message.isUnread && !message.isMine && "ring-2 ring-primary/40",
          sending && "opacity-70",
          failed && "ring-2 ring-destructive/60",
        )}
      >
        {message.body ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : null}

        {previews.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {previews.map((url) => (
              <li key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="size-28 rounded-lg object-cover opacity-80"
                />
              </li>
            ))}
          </ul>
        ) : null}

        {message.attachments.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((file) => {
              const url = urls[file.storage_path];
              if (!url) {
                return (
                  <li key={file.id} className="text-xs opacity-70">
                    {ka.attachments.unavailable}
                  </li>
                );
              }
              return (
                <li key={file.id}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      className="size-28 rounded-lg object-cover"
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}

        {message.voicePath ? (
          voiceUrl ? (
            <audio controls src={voiceUrl} className="h-9 w-56 max-w-full" />
          ) : (
            <p className="text-xs opacity-70">{ka.messages.voiceUnsupported}</p>
          )
        ) : null}
      </div>

      {failed && onRetryDismiss ? (
        <button
          type="button"
          onClick={onRetryDismiss}
          className="px-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2"
        >
          {ka.messages.dismissFailed}
        </button>
      ) : null}
    </div>
  );
}
