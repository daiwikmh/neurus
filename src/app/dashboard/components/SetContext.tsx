"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
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
  const user = account?.address ?? null;

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

  useEffect(() => {
    setNeurusUser(user);
    setActive("default");
    setSets([]);
    refresh();
  }, [user]);

  return <SetCtx.Provider value={{ sets, active, setActive, online, user, refresh }}>{children}</SetCtx.Provider>;
}

export function useSets(): Ctx {
  const ctx = useContext(SetCtx);
  if (!ctx) throw new Error("useSets outside SetProvider");
  return ctx;
}
