"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/services/firebase";
import { db } from "@/services/firebase";
import {
  collection, doc, getDoc, onSnapshot, orderBy, query, limit, Timestamp,
} from "firebase/firestore";

type RunRow = {
  id: string;
  createdAt?: Timestamp | null;
  kind?: "llm" | "built_in" | "error";
  toolId?: string | null;
  status?: "ok" | "error";
  latencyMs?: number | null;
  chatId?: string | null;
  note?: string | null;
};

export default function ActivityPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);

  // auth
  useEffect(() => {
    return auth.onAuthStateChanged((u) => setUid(u?.uid ?? null));
  }, []);

  // gate by featurePermissions/activity.enabled
  useEffect(() => {
    if (!uid) {
      setAllowed(null);
      setRows([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const permRef = doc(db, "users", uid, "featurePermissions", "activity");
        const snap = await getDoc(permRef);
        const ok = !!(snap.exists() && (snap.data() as any)?.enabled === true);
        setAllowed(ok);

        if (!ok) {
          setRows([]);
          setLoading(false);
          return;
        }

        // subscribe to runs
        const runsRef = collection(db, "users", uid, "runs");
        const q = query(runsRef, orderBy("createdAt", "desc"), limit(100));
        const unsub = onSnapshot(q, (ss) => {
          const list: RunRow[] = [];
          ss.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setRows(list);
          setLoading(false);
        });
        return () => unsub();
      } catch {
        setAllowed(false);
        setRows([]);
        setLoading(false);
      }
    })();
  }, [uid]);

  if (!uid) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">Activity</h1>
        <p className="text-sm text-muted-foreground">Please sign in to view your activity.</p>
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">Activity</h1>
        <p className="text-sm text-muted-foreground">
          You don’t have access to Activity. If you believe this is a mistake, contact your admin.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Activity</h1>
        <Link href="/" className="text-sm text-primary hover:underline">Back to chat</Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No activity yet.</div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Latency</th>
                <th className="px-3 py-2 font-semibold">Chat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const when =
                  r.createdAt instanceof Timestamp
                    ? r.createdAt.toDate().toLocaleString()
                    : "—";
                const event =
                  r.kind === "built_in"
                    ? (r.toolId === "create_document"
                        ? "Created document"
                        : r.toolId === "update_document"
                        ? "Updated document"
                        : `Ran ${r.toolId ?? "built-in tool"}`)
                    : r.kind === "llm"
                    ? "Assistant reply"
                    : r.kind === "error"
                    ? `Error${r.toolId ? ` in ${r.toolId}` : ""}`
                    : "Event";
                const status = r.status ?? "ok";

                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{when}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{event}</div>
                      {r.toolId && <div className="text-xs text-muted-foreground">{r.toolId}</div>}
                      {r.note && <div className="text-xs text-muted-foreground mt-0.5">{r.note}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {status === "ok" ? "✅ Success" : "⚠️ Error"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.latencyMs ?? "—"} ms</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.chatId ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
