/**
 * The children registered on this physical device, kept in localStorage so
 * `/kid-login` can show faces instead of asking for an identifier.
 *
 * Nothing here is a credential: it is display data plus the child id, and the
 * PIN is still required to sign in. Every access is wrapped in try/catch —
 * private mode, disabled storage and quota errors must not break the screen.
 *
 * Exposed as a `useSyncExternalStore` source so components read it without a
 * setState-in-effect dance, and stay in sync across tabs.
 */

export type DeviceChild = {
  childId: string;
  name: string;
  avatarUrl: string | null;
  color: string | null;
};

const STORAGE_KEY = "school-hub:device-children";
const MAX_CHILDREN = 10;
const EMPTY: DeviceChild[] = [];

function isDeviceChild(value: unknown): value is DeviceChild {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.childId === "string" && typeof candidate.name === "string"
  );
}

export function readDeviceChildren(): DeviceChild[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .filter(isDeviceChild)
      .slice(0, MAX_CHILDREN)
      .map((child) => ({
        childId: child.childId,
        name: child.name,
        avatarUrl: child.avatarUrl ?? null,
        color: child.color ?? null,
      }));
  } catch {
    return EMPTY;
  }
}

/* -------------------------------------------------------------------------- */
/*  external store                                                            */
/* -------------------------------------------------------------------------- */

let cached: DeviceChild[] | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function write(children: DeviceChild[]): DeviceChild[] {
  const next = children.slice(0, MAX_CHILDREN);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — the list simply will not survive a reload.
  }
  cached = next;
  emit();
  return next;
}

export function subscribeDeviceChildren(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cached = null;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Stable reference between changes, as `useSyncExternalStore` requires. */
export function getDeviceChildrenSnapshot(): DeviceChild[] {
  if (cached === null) cached = readDeviceChildren();
  return cached;
}

/** Nothing is known about the device while rendering on the server. */
export function getDeviceChildrenServerSnapshot(): DeviceChild[] {
  return EMPTY;
}

/* -------------------------------------------------------------------------- */
/*  mutations                                                                 */
/* -------------------------------------------------------------------------- */

/** Add or refresh a child, most recently used first. */
export function rememberDeviceChild(child: DeviceChild): DeviceChild[] {
  const rest = getDeviceChildrenSnapshot().filter(
    (existing) => existing.childId !== child.childId,
  );
  return write([child, ...rest]);
}

export function forgetDeviceChild(childId: string): DeviceChild[] {
  return write(
    getDeviceChildrenSnapshot().filter((child) => child.childId !== childId),
  );
}

/** Replace the stored list with the server's view of the same children. */
export function syncDeviceChildren(children: DeviceChild[]): DeviceChild[] {
  return write(children);
}
