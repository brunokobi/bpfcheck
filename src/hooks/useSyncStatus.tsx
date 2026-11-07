import { useEffect, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/localdb";
import { getSyncState, subscribeSync } from "@/lib/sync";

export const useOnline = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
};

/** Estado da fila offline para a interface (contadores reativos via Dexie). */
export const useSyncStatus = () => {
  const online = useOnline();
  const sync = useSyncExternalStore(subscribeSync, getSyncState);
  const pending = useLiveQuery(() => db.outbox.where("failed").equals(0).count(), [], 0);
  const failed = useLiveQuery(() => db.outbox.where("failed").equals(1).count(), [], 0);
  return { online, pending, failed, ...sync };
};
