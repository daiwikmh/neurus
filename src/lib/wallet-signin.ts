"use client";

import { useSignPersonalMessage } from "@mysten/dapp-kit";

export function useWalletSignIn() {
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  return async (address: string): Promise<void> => {
    // Idempotent: if this address already has a valid server session, don't re-prompt.
    const me = await fetch("/api/wallet/me").then((r) => r.json()).catch(() => ({}));
    if (me?.address === address) return;

    const nonceRes = await fetch("/api/wallet/nonce");
    const { nonce } = (await nonceRes.json()) as { nonce: string };
    const message = new TextEncoder().encode(`Sign in to Neurus\n\nnonce: ${nonce}`);
    const { signature } = await signPersonalMessage({ message });
    const verify = await fetch("/api/wallet/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, signature }),
    });
    if (!verify.ok) {
      const { error } = (await verify.json().catch(() => ({}))) as { error?: string };
      throw new Error(error ?? "wallet sign-in failed");
    }
  };
}
