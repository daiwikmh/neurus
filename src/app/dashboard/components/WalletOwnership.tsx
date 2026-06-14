"use client";

import { useEffect, useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction, useSignPersonalMessage, useSuiClient } from "@mysten/dapp-kit";
import { neurus, type AccountStatus } from "@/services/neurus";
import { claimOwnership, revokeOwnership, relinkOwnership, ownershipConfigured, type WalletSigner } from "@/lib/ownership";

export function WalletOwnership() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signMessage } = useSignPersonalMessage();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState<"claim" | "revoke" | "relink" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const addr = account?.address ?? null;

  useEffect(() => {
    if (!addr) { setStatus(null); return; }
    neurus.accountStatus().then(setStatus).catch(() => setStatus(null));
  }, [addr]);

  const signer: WalletSigner | null = addr
    ? {
        address: addr,
        signAndExecuteTransaction: async ({ transaction }) => signAndExecute({ transaction: transaction as any }),
        signPersonalMessage: async ({ message }) => signMessage({ message }),
      }
    : null;

  const claim = async () => {
    if (!signer) return;
    setBusy("claim");
    setMsg(null);
    try {
      const { accountId, delegateKey } = await claimOwnership(signer, suiClient);
      const s = await neurus.linkAccount(accountId, delegateKey);
      setStatus(s);
      setMsg("You now own this memory on Walrus.");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      // This wallet already owns a Walrus Memory account (the contract allows one per address).
      // Link the existing account instead of creating a second one.
      if (/create_account|abort code: ?3|already/i.test(m)) {
        try {
          setStatus(await neurus.adoptEnvAccount());
          setMsg("Linked your existing Walrus Memory account.");
          return;
        } catch (e2) {
          setMsg(e2 instanceof Error ? e2.message : "failed to link existing account");
          return;
        }
      }
      setMsg(m);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!signer || !status?.accountId) return;
    setBusy("revoke");
    setMsg(null);
    try {
      const { pubkey } = await neurus.getDelegatePubkey();
      await revokeOwnership(signer, suiClient, status.accountId, pubkey);
      const result = await neurus.unlinkAccount();
      setStatus({ linked: false, owned: true, accountId: result.accountId ?? status.accountId });
      setMsg("Delegate key revoked. Your account is still yours on Walrus.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "revoke failed");
    } finally {
      setBusy(null);
    }
  };

  const relink = async () => {
    if (!signer || !status?.accountId) return;
    setBusy("relink");
    setMsg(null);
    try {
      const { delegateKey } = await relinkOwnership(signer, suiClient, status.accountId);
      const s = await neurus.relinkAccount(delegateKey);
      setStatus(s);
      setMsg("Access restored. Neurus holds a new delegate key.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "relink failed");
    } finally {
      setBusy(null);
    }
  };

  if (!addr) {
    return (
      <ConnectModal
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button className="w-full rounded-lg bg-[#9aa8f0] py-2 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
            Connect Sui wallet
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-2">
        <span className="flex items-center gap-2 text-[11px] text-white/75">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="font-mono">{addr.slice(0, 6)}…{addr.slice(-4)}</span>
        </span>
        <button onClick={() => disconnect()} className="shrink-0 text-[11px] text-white/40 transition hover:text-white/70">disconnect</button>
      </div>

      {status?.owned ? (
        <div className="rounded-lg border border-white/10 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70">
            <span className={`h-1.5 w-1.5 rounded-full ${status.linked ? "bg-[#9aa8f0]" : "bg-amber-400"}`} />
            {status.linked ? "You own this memory" : "Ownership retained — access revoked"}
          </div>
          {status.accountId && <div className="mt-1 truncate font-mono text-[10px] text-white/35">{status.accountId.slice(0, 18)}…</div>}
          {status.linked ? (
            <button onClick={revoke} disabled={!!busy} className="mt-1.5 text-[11px] text-white/40 transition hover:text-red-400 disabled:opacity-40">
              {busy === "revoke" ? "revoking…" : "revoke access"}
            </button>
          ) : (
            <button onClick={relink} disabled={!!busy} className="mt-1.5 w-full rounded-lg bg-[#9aa8f0] py-1.5 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-50">
              {busy === "relink" ? "Signing…" : "Re-link access"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {ownershipConfigured() ? (
            <button onClick={claim} disabled={!!busy} className="w-full rounded-lg bg-[#9aa8f0] py-1.5 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-50">
              {busy === "claim" ? "Signing…" : "Own my memory on Walrus"}
            </button>
          ) : (
            <p className="text-[10.5px] leading-tight text-amber-400/70">Wallet ownership isn&apos;t configured yet.</p>
          )}
          <p className="text-[10px] leading-tight text-white/30">
            Your wallet owns the account on Walrus; Neurus holds a revocable delegate key.
          </p>
        </div>
      )}

      {msg && <p className="text-[10.5px] leading-tight text-white/45">{msg}</p>}
    </div>
  );
}
