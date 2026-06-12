"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectModal, useCurrentAccount, useSuiClient, useSignPersonalMessage } from "@mysten/dapp-kit";
import { neurus, type Feed } from "@/services/neurus";
import { decryptSealed } from "@/lib/seal-browser";
import { Card, Labeled, fieldCls as field, btnPrimarySm, btnGhostSm, btnDangerSm } from "./ui";

function shortId(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function FeedRow({ feed, onChange }: { feed: Feed; onChange: () => void }) {
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const grant = async () => {
    setErr("");
    setBusy("grant");
    try {
      await neurus.grantFeed(feed.id, addr.trim());
      setAddr("");
      onChange();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  };

  const revoke = async (a: string) => {
    setBusy(a);
    try {
      await neurus.revokeFeed(feed.id, a);
      onChange();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-white/85">{feed.name}</span>
        <span className="text-[11px] text-white/35">{feed.neurons} neurons</span>
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-white/40">
        <button onClick={() => navigator.clipboard?.writeText(feed.shareId)} className="text-left font-mono hover:text-white/70" title="copy Share id">
          share {shortId(feed.shareId)}
        </button>
        <button onClick={() => navigator.clipboard?.writeText(feed.blobId)} className="text-left font-mono hover:text-white/70" title="copy blob id">
          blob {shortId(feed.blobId)}
        </button>
      </div>

      {feed.grants.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {feed.grants.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/[0.06] px-2 py-0.5 text-[11px] text-emerald-200/90">
              <span className="font-mono">{a.slice(0, 6)}…{a.slice(-4)}</span>
              <button onClick={() => revoke(a)} disabled={!!busy} className="text-emerald-200/60 hover:text-red-300">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x… follower address to grant" className={`${field} flex-1 font-mono`} />
        <button onClick={grant} disabled={busy === "grant" || !/^0x[0-9a-fA-F]{64}$/.test(addr.trim())} className={btnPrimarySm}>
          {busy === "grant" ? "Granting…" : "Grant"}
        </button>
      </div>
      {err && <p className="mt-1.5 text-[11px] text-red-300">{err}</p>}

      <div className="mt-2">
        <button onClick={() => neurus.deleteFeed(feed.id).then(onChange)} className={btnDangerSm}>Delete feed</button>
      </div>
    </div>
  );
}

export function MemoryFeed({ set, collapsible = false, defaultOpen = true }: { set: string; collapsible?: boolean; defaultOpen?: boolean }) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [name, setName] = useState("");
  const [pubBusy, setPubBusy] = useState(false);
  const [pubErr, setPubErr] = useState("");

  const [fShare, setFShare] = useState("");
  const [fBlob, setFBlob] = useState("");
  const [fSet, setFSet] = useState("");
  const [following, setFollowing] = useState(false);
  const [followMsg, setFollowMsg] = useState("");
  const [followErr, setFollowErr] = useState("");
  const [connect, setConnect] = useState(false);

  const load = useCallback(() => {
    neurus.feeds(set).then(setFeeds).catch(() => setFeeds([]));
  }, [set]);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async () => {
    setPubErr("");
    setPubBusy(true);
    try {
      await neurus.createFeed(set, name.trim() || set);
      setName("");
      load();
    } catch (e) {
      setPubErr(String(e instanceof Error ? e.message : e));
    } finally {
      setPubBusy(false);
    }
  };

  const follow = async () => {
    if (!account) {
      setConnect(true);
      return;
    }
    setFollowErr("");
    setFollowMsg("");
    setFollowing(true);
    try {
      const { sealedB64 } = await neurus.fetchSealed(fBlob.trim());
      const plaintext = await decryptSealed({
        sealedB64,
        shareId: fShare.trim(),
        address: account.address,
        suiClient,
        signPersonalMessage: (message) => signPersonalMessage({ message }).then((r) => ({ signature: r.signature })),
      });
      const neuronsArr = JSON.parse(plaintext) as unknown[];
      const { imported } = await neurus.importNeurons(fSet.trim() || set, neuronsArr);
      setFollowMsg(`Imported ${imported} neurons into "${fSet.trim() || set}". Your agent now reads this memory.`);
      setFShare("");
      setFBlob("");
    } catch (e) {
      setFollowErr(String(e instanceof Error ? e.message : e));
    } finally {
      setFollowing(false);
    }
  };

  return (
    <Card collapsible={collapsible} defaultOpen={defaultOpen} title="Memory Feed" sub="Publish this set as a Seal-gated feed on Walrus. Grant addresses on-chain; revoke any time. Followers decrypt with their own wallet — keys never touch the server.">
      <div className="mt-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`feed name (default: ${set})`} className={`${field} flex-1`} />
        <button onClick={publish} disabled={pubBusy} className={btnPrimarySm}>
          {pubBusy ? "Publishing…" : "Publish feed"}
        </button>
      </div>
      {pubErr && <p className="mt-1.5 text-[11px] text-red-300">{pubErr}</p>}

      {feeds.length > 0 && (
        <div className="mt-3 grid gap-2">
          {feeds.map((f) => (
            <FeedRow key={f.id} feed={f} onChange={load} />
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-[12px] font-medium text-white/70">Follow a feed</p>
        <p className="mt-0.5 text-[11.5px] text-white/40">Paste a feed you were granted access to. Your wallet signs to decrypt; nothing is custodied.</p>
        <div className="mt-2 grid gap-2">
          <Labeled label="Share id">
            <input value={fShare} onChange={(e) => setFShare(e.target.value)} placeholder="0x… Share object id" className={`${field} mt-1 w-full font-mono`} />
          </Labeled>
          <Labeled label="Blob id">
            <input value={fBlob} onChange={(e) => setFBlob(e.target.value)} placeholder="Walrus blob id" className={`${field} mt-1 w-full font-mono`} />
          </Labeled>
          <Labeled label="Import into set">
            <input value={fSet} onChange={(e) => setFSet(e.target.value)} placeholder={`default: ${set}`} className={`${field} mt-1 w-full`} />
          </Labeled>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={follow} disabled={following || !fShare.trim() || !fBlob.trim()} className={btnPrimarySm}>
            {following ? "Decrypting…" : account ? "Follow" : "Connect wallet to follow"}
          </button>
          {account && <span className="text-[11px] font-mono text-white/35">{account.address.slice(0, 6)}…{account.address.slice(-4)}</span>}
        </div>
        {followMsg && <p className="mt-2 text-[11.5px] text-emerald-300/90">{followMsg}</p>}
        {followErr && <p className="mt-2 text-[11.5px] text-red-300">{followErr}</p>}
      </div>

      <ConnectModal open={connect} onOpenChange={setConnect} trigger={<span />} />
    </Card>
  );
}
