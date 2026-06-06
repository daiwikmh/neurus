"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCurrentAccount, useAutoConnectWallet } from "@mysten/dapp-kit";
import { neurus, setNeurusUser, type SetInfo } from "@/services/neurus";
import { getLoginMethod } from "@/lib/session-identity";

interface Ctx {
  sets: SetInfo[];
  active: string;
  setActive: (name: string) => void;
  online: boolean;
  user: string | null;
  method: "google" | "wallet" | null;
  refresh: () => void;
}

const SetCtx = createContext<Ctx | null>(null);

export function SetProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [active, setActive] = useState("default");
  const [online, setOnline] = useState(true);
  const [method, setMethod] = useState<"google" | "wallet" | null>(null);
  const [loaded, setLoaded] = useState(false);

  const account = useCurrentAccount();
  const autoConnect = useAutoConnectWallet();
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    setMethod(getLoginMethod());
    setLoaded(true);
  }, []);

  // Identity is the account the user actually logged in WITH this session.
  // A wallet that merely auto-connected in the background does NOT override a Google login.
  const user = method === "wallet" ? account?.address ?? null : method === "google" ? session?.userId ?? null : null;

  // Send the per-user header synchronously so child fetches never race an empty identity.
  setNeurusUser(user);

  const refresh = () => {
    neurus
      .sets()
      .then((s) => {
        setSets(s);
        setOnline(true);
        if (s.length && !s.some((x) => x.name === active)) setActive(s[0].name);
      })
      .catch(() => setOnline(false));
  };

  // Redirect to /login only once the chosen identity source has settled.
  useEffect(() => {
    if (!loaded) return;
    if (method === null) {
      router.replace("/login");
      return;
    }
    const settled = method === "google" ? status !== "loading" : autoConnect !== "idle";
    if (settled && !user) router.replace("/login");
  }, [loaded, method, status, autoConnect, user, router]);

  useEffect(() => {
    setActive("default");
    setSets([]);
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Render children only once the identity is resolved, so every child fetch carries the right header.
  const ready = loaded && !!user;

  return (
    <SetCtx.Provider value={{ sets, active, setActive, online, user, method, refresh }}>
      {ready ? (
        children
      ) : (
        <div className="grid h-screen place-items-center bg-[#0b0c0f] text-sm text-white/40">Loading your memory…</div>
      )}
    </SetCtx.Provider>
  );
}

export function useSets(): Ctx {
  const ctx = useContext(SetCtx);
  if (!ctx) throw new Error("useSets outside SetProvider");
  return ctx;
}
