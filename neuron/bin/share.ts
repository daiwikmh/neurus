import { banner, box, rule, kv, step, ok, warn, info, flow, c, shortId } from "../src/cli/ui";
import { publishSealedDataset, fetchSealedDataset } from "../src/net/share";
import { shareConfigured, createShare, grantReader, revokeReader, ownerAddress } from "../src/net/share-chain";

try {
  process.loadEnvFile(".env.local");
} catch {
  void 0;
}

const NETWORK = process.env.SUI_NETWORK ?? "testnet";
const PKG = process.env.NEURUS_SEAL_PACKAGE ?? "0xc5ce…demo";

function flags(args: string[]): { opts: Record<string, string>; rest: string[] } {
  const opts: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) opts[args[i].slice(2)] = args[++i] ?? "";
    else rest.push(args[i]);
  }
  return { opts, rest };
}

function usage(): void {
  banner();
  flow();
  box("commands", [
    `${c.cyan("seal")}     --set <name> --share <0xShare>   seal a set's snapshot → Walrus (no keys)`,
    `${c.cyan("inspect")}  <blobId>                          show a sealed blob's Seal metadata`,
    `${c.cyan("create")}   <name> --kind dataset|workflow    create an on-chain Share + admin Cap`,
    `${c.cyan("grant")}    <0xShare> <0xCap> <0xReader>       allow a reader (on-chain)`,
    `${c.cyan("revoke")}   <0xShare> <0xCap> <0xReader>       remove a reader (on-chain)`,
    `${c.cyan("status")}                                      config + on-chain readiness`,
  ]);
  console.log(c.dim("  on-chain cmds need a deployed neurus_share + SUI_PRIVATE_KEY; seal/inspect work without.\n"));
}

function notConfigured(reason: string): void {
  warn(reason);
  console.log("");
  box("deploy runbook", [
    `${c.dim("1.")} cd move/neurus_share && sui client publish --gas-budget 100000000`,
    `${c.dim("2.")} export NEURUS_SEAL_PACKAGE=<published package id>`,
    `${c.dim("3.")} export SUI_PRIVATE_KEY=<a funded testnet key>   ${c.dim("(sui keytool export)")}`,
    `${c.dim("4.")} re-run this command`,
  ]);
}

async function main() {
  const [cmd, ...raw] = process.argv.slice(2);
  const { opts, rest } = flags(raw);

  switch (cmd) {
    case "status": {
      banner();
      const cfg = shareConfigured();
      box("share config", [
        kv("network", NETWORK),
        kv("package", PKG.startsWith("0xc5ce") ? c.yellow(`${shortId(PKG)} (seal-demo — deploy your own)`) : c.green(shortId(PKG))),
        kv("key servers", c.green("2 independent · 2-of-2 threshold")),
        kv("on-chain", cfg.ok ? c.green(`ready · owner ${shortId(ownerAddress())}`) : c.yellow("not configured")),
      ]);
      if (!cfg.ok) info(cfg.reason!);
      break;
    }

    case "seal": {
      const set = opts.set ?? "default";
      const share = opts.share ?? "";
      if (!/^0x[0-9a-fA-F]{64}$/.test(share)) {
        warn("pass --share <0x Share object id> (run `share create` first)");
        break;
      }
      banner();
      step(1, 2, `sealing set "${c.bold(set)}" to share ${shortId(share)}`);
      const ref = await publishSealedDataset(set, share);
      step(2, 2, "publishing ciphertext to Walrus");
      console.log("");
      box("sealed & shared", [
        kv("neurons", String(ref.neurons)),
        kv("walrus blob", c.green(ref.blobId)),
        kv("identity", shortId(ref.identity)),
        kv("package", shortId(ref.packageId)),
        kv("share ref", c.cyan(`${ref.blobId}:${ref.shareId.slice(0, 10)}…`)),
      ]);
      ok("readable only by addresses you grant on-chain — we never hold the key");
      break;
    }

    case "inspect": {
      const blobId = rest[0];
      if (!blobId) {
        warn("usage: share inspect <blobId>");
        break;
      }
      banner();
      info(`fetching ${shortId(blobId)} from Walrus…`);
      const m = await fetchSealedDataset(blobId);
      console.log("");
      box("seal metadata", [
        kv("package", shortId(m.packageId)),
        kv("threshold", `${m.threshold}-of-${m.services}`),
        kv("key servers", String(m.services)),
        kv("status", c.green("real Seal ciphertext · unreadable without an allowlisted key")),
      ]);
      break;
    }

    case "create": {
      const name = rest[0];
      const kind = (opts.kind as "dataset" | "workflow") ?? "dataset";
      if (!name) {
        warn("usage: share create <name> --kind dataset|workflow");
        break;
      }
      banner();
      const cfg = shareConfigured();
      if (!cfg.ok) {
        notConfigured(cfg.reason!);
        break;
      }
      step(1, 1, `creating on-chain Share "${c.bold(name)}" (${kind})`);
      const r = await createShare(name, kind);
      console.log("");
      box("share created", [kv("share id", c.green(r.shareId)), kv("admin cap", c.green(r.capId)), kv("tx", shortId(r.digest))]);
      ok(`now: share seal --set <name> --share ${shortId(r.shareId)}`);
      break;
    }

    case "grant":
    case "revoke": {
      const [shareId, capId, reader] = rest;
      if (!shareId || !capId || !reader) {
        warn(`usage: share ${cmd} <0xShare> <0xCap> <0xReader>`);
        break;
      }
      banner();
      const cfg = shareConfigured();
      if (!cfg.ok) {
        notConfigured(cfg.reason!);
        break;
      }
      step(1, 1, `${cmd === "grant" ? "granting" : "revoking"} ${shortId(reader)} on ${shortId(shareId)}`);
      const digest = await (cmd === "grant" ? grantReader : revokeReader)(shareId, capId, reader);
      console.log("");
      ok(`${cmd === "grant" ? "granted" : "revoked"} · tx ${shortId(digest)}`);
      if (cmd === "revoke") info("revoked reader can no longer fetch new decryption keys");
      break;
    }

    default:
      usage();
  }
}

main().catch((e) => {
  console.log("");
  console.error(`${c.red("✗")} ${e?.message ?? e}`);
  process.exit(1);
});
