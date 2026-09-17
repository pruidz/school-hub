"use client";

/**
 * Message composer: text plus up to four photos.
 *
 * Photos take the same route as assignment evidence — compress in the browser,
 * PUT straight to Storage, then hand the paths to `sendMessageAction`, which
 * re-verifies them before writing any row. If the send fails, the objects are
 * removed by the action, so nothing is left dangling.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { assignmentObjectPath } from "@/features/attachments/paths";
import {
  removeObjectFromBrowser,
  uploadObjectWithProgress,
} from "@/features/attachments/upload-client";
import { ka, t } from "@/lib/i18n/ka";
import { MAX_SOURCE_BYTES, compressImage, looksLikeImage } from "@/lib/images";
import { cn } from "@/lib/utils";

import { sendMessageAction } from "./actions";

const MAX_IMAGES = 4;

type Pending = {
  id: string;
  previewUrl: string;
  storagePath: string | null;
  uploading: boolean;
  failed: boolean;
};

export function ThreadComposer({
  assignmentId,
  childId,
  className,
}: {
  assignmentId: string;
  childId: string;
  className?: string;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const previewsRef = React.useRef<string[]>([]);

  React.useEffect(() => {
    const previews = previewsRef.current;
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
    };
  }, []);

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    setError(null);

    const room = MAX_IMAGES - pending.length;
    const files = Array.from(fileList).slice(0, Math.max(0, room));
    if (files.length === 0) {
      setError(t("attachments.errTooManyFiles", { count: MAX_IMAGES }));
      return;
    }

    for (const file of files) {
      if (!looksLikeImage(file) || file.size > MAX_SOURCE_BYTES) {
        setError(ka.attachments.errNotImage);
        continue;
      }

      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      previewsRef.current.push(previewUrl);

      setPending((current) => [
        ...current,
        { id, previewUrl, storagePath: null, uploading: true, failed: false },
      ]);

      try {
        const compressed = await compressImage(file);
        const storagePath = assignmentObjectPath(childId, assignmentId);
        await uploadObjectWithProgress({
          path: storagePath,
          blob: compressed.file,
          mime: compressed.mime,
        });
        setPending((current) =>
          current.map((item) =>
            item.id === id ? { ...item, storagePath, uploading: false } : item,
          ),
        );
      } catch {
        setPending((current) =>
          current.map((item) =>
            item.id === id ? { ...item, uploading: false, failed: true } : item,
          ),
        );
        setError(ka.attachments.errUploadFailed);
      }
    }
  };

  const removePending = async (item: Pending) => {
    setPending((current) => current.filter((entry) => entry.id !== item.id));
    if (item.storagePath) await removeObjectFromBrowser(item.storagePath);
  };

  const busy = sending || pending.some((item) => item.uploading);
  const ready = pending
    .filter((item) => item.storagePath && !item.failed)
    .map((item) => item.storagePath as string);
  const canSend = !busy && (body.trim().length > 0 || ready.length > 0);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);

    const result = await sendMessageAction({
      assignmentId,
      body: body.trim() || null,
      imagePaths: ready,
    });

    setSending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setBody("");
    setPending([]);
    router.refresh();
  };

  return (
    <div className={cn("grid gap-2", className)}>
      {pending.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {pending.map((item) => (
            <li
              key={item.id}
              className="relative size-16 overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt=""
                className={cn(
                  "size-full object-cover",
                  (item.uploading || item.failed) && "opacity-50",
                )}
              />
              {item.uploading ? (
                <Loader2 className="absolute inset-0 m-auto size-5 animate-spin" />
              ) : null}
              <button
                type="button"
                aria-label={ka.attachments.removePhoto}
                onClick={() => void removePending(item)}
                className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-background/90"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={ka.messages.attachPhoto}
          disabled={busy || pending.length >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus />
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={ka.messages.placeholder}
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
        />

        <Button
          type="button"
          size="icon-lg"
          aria-label={ka.messages.send}
          disabled={!canSend}
          onClick={() => void send()}
        >
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}
