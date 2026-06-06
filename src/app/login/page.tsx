"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ConnectModal, useCurrentAccount } from "@mysten/dapp-kit";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.8 37.9 46.5 31.8 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C.9 16 0 19.9 0 24s.9 8 2.5 11.4l7.9-7.1z" />
      <path fill="#34A853" d="M24 48c6.4 0 11.9-2.1 15.8-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.5 2.3-6.3 0-11.7-3.7-13.6-9.8l-7.9 7.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function LoginCard() {
  const account = useCurrentAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (account) router.push("/dashboard");
  }, [account, router]);

  return (
    <div
      className="relative flex min-h-screen bg-[#0b0c0f] bg-cover bg-center text-white"
      style={{ backgroundImage: "linear-gradient(to right, rgba(11,12,15,0.92), rgba(11,12,15,0.65)), url('/walrus.jpeg')" }}
    >
      <div className="hidden flex-1 flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#9aa8f0] text-[#14152b]">◳</span>
          Neurus
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">
            Agents forget.
            <br />
            Neurus remembers.
          </h1>
          <p className="mt-4 max-w-sm text-sm text-white/50">
            Sign in to your owned, verifiable memory on Walrus.
          </p>
        </div>
        <div className="text-xs text-white/30">Owned · verifiable · on Walrus</div>
      </div>

      <div className="flex w-full items-center justify-center p-6 lg:w-[480px]">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101218] p-8 shadow-2xl">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-white/45">Choose how you want to access your memory.</p>

          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/15 bg-white py-2.5 text-sm font-medium text-[#14152b] transition hover:bg-white/90"
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/25">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <ConnectModal
            open={open}
            onOpenChange={setOpen}
            trigger={
              <button className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#9aa8f0] py-2.5 text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
                Connect a wallet
              </button>
            }
          />

          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/30">
            Google signs you in to a hosted memory account. A wallet lets you self-custody and own your memory on Walrus.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginCard />;
}
