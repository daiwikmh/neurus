"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCurrentAccount, useAutoConnectWallet } from "@mysten/dapp-kit";
import { neurus, setNeurusUser, type SetInfo } from "@/services/neurus";

interface Ctx {
  sets: SetInfo[];
  active: string;
  setActive: (name: string) => void;
  online: boolean;
  user: string | null;
  refresh: () => void;
}

const SetCtx = createContext<Ctx | null>(null);

export function SetProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [active, setActive] = useState("default");
  const [online, setOnline] = useState(true);

  const account = useCurrentAccount();
  const autoConnect = useAutoConnectWallet();
  const { data: session, status } = useSession();
  const router = useRouter();

  // Wallet ownership takes precedence; otherwise the Google session identity.
  const user = account?.address ?? session?.userId ?? null;

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

  // Redirect to /login only once both identity sources have settled.
  useEffect(() => {
    const settled = status !== "loading" && autoConnect !== "idle";
    if (settled && !user) router.replace("/login");
  }, [status, autoConnect, user, router]);

  useEffect(() => {
    setNeurusUser(user);
    setActive("default");
    setSets([]);
    if (!user) return;
    refresh();
    // Best-effort: provision the user's own MemWal account on first login.
    // If the hosted provisioner is unavailable, namespace isolation still keeps data per-user.
    neurus
      .accountStatus()
      .then((s) => {
        if (!s.linked && !s.local) return neurus.provisionAccount().then(() => refresh());
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <SetCtx.Provider value={{ sets, active, setActive, online, user, refresh }}>{children}</SetCtx.Provider>;
}

export function useSets(): Ctx {
  const ctx = useContext(SetCtx);
  if (!ctx) throw new Error("useSets outside SetProvider");
  return ctx;
}
