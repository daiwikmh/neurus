import { execFileSync } from "node:child_process";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

const KEY = process.env.SUI_TESTNET_PRIVATE_KEY ?? process.env.SUI_PRIVATE_KEY;
if (!KEY) throw new Error("SUI_TESTNET_PRIVATE_KEY not in env");
const keypair = Ed25519Keypair.fromSecretKey(KEY.trim());
const address = keypair.getPublicKey().toSuiAddress();
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });

async function balance(): Promise<number> {
  const b = await client.getBalance({ owner: address });
  return Number(b.totalBalance) / 1e9;
}

function compile(): { modules: string[]; dependencies: string[] } {
  const out = execFileSync("sui", ["move", "build", "--dump-bytecode-as-base64", "--path", "move/neurus_share"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const pkg = JSON.parse(json);
  return { modules: pkg.modules, dependencies: pkg.dependencies };
}

async function main() {
  const publish = process.argv.includes("--publish");
  console.log("deployer address:", address);
  let bal = await balance();
  console.log("testnet gas:", bal.toFixed(3), "SUI");

  const { modules, dependencies } = compile();
  console.log(`compiled neurus_share: ${modules.length} module(s), ${dependencies.length} deps`);

  if (!publish) {
    console.log("\n(dry run — pass --publish to deploy)");
    if (bal === 0) console.log("NOTE: 0 gas — fund the address before publishing");
    return;
  }

  if (bal === 0) {
    console.log("requesting testnet gas from faucet…");
    const { requestSuiFromFaucetV2, getFaucetHost } = await import("@mysten/sui/faucet");
    await requestSuiFromFaucetV2({ host: getFaucetHost("testnet"), recipient: address });
    for (let i = 0; i < 20 && bal === 0; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      bal = await balance();
    }
    console.log("gas after faucet:", bal.toFixed(3), "SUI");
    if (bal === 0) throw new Error("faucet did not fund in time — retry");
  }

  const tx = new Transaction();
  const [upgradeCap] = tx.publish({ modules, dependencies });
  tx.transferObjects([upgradeCap], address);
  const res = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx, options: { showObjectChanges: true, showEffects: true } });

  const status = res.effects?.status?.status;
  if (status !== "success") throw new Error(`publish failed: ${JSON.stringify(res.effects?.status)}`);
  const published = (res.objectChanges ?? []).find((o) => o.type === "published") as { packageId: string } | undefined;
  const cap = (res.objectChanges ?? []).find((o) => o.type === "created" && (o as { objectType?: string }).objectType?.includes("UpgradeCap")) as { objectId: string } | undefined;
  if (!published) throw new Error("no published package in result");

  console.log("\n========================================");
  console.log("PACKAGE ID :", published.packageId);
  console.log("UpgradeCap :", cap?.objectId ?? "—");
  console.log("tx digest  :", res.digest);
  console.log("========================================");
  console.log("\nNext: add to neuron/.env.local →  NEURUS_SEAL_PACKAGE=" + published.packageId);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
