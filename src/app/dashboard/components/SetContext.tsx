"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { neurus, type SetInfo } from "@/services/neurus";

interface Ctx {
  sets: SetInfo[];
  active: string;
  setActive: (name: string) => void;
  online: boolean;
  refresh: () => void;
}

const SetCtx = createContext<Ctx | null>(null);

export function SetProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [active, setActive] = useState("default");
  const [online, setOnline] = useState(true);

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

  useEffect(refresh, []);

  return <SetCtx.Provider value={{ sets, active, setActive, online, refresh }}>{children}</SetCtx.Provider>;
}

export function useSets(): Ctx {
  const ctx = useContext(SetCtx);
  if (!ctx) throw new Error("useSets outside SetProvider");
  return ctx;
}
