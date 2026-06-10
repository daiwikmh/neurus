import { z } from "zod";
import { chatJSON } from "../llm/nvidia";

export const WorkflowSpec = z.object({
  strategySet: z.string().nullable().default(null),
  assets: z.array(z.string()).default([]),
  protocols: z.array(z.string()).default([]),
  wallets: z.array(z.string()).default([]),
  deepbook: z.boolean().default(false),
  intervalMs: z.number().int().positive().default(60_000),
  durationDays: z.number().positive().default(5),
  instruction: z.string().default(""),
  telegram: z.boolean().default(true),
});
export type WorkflowSpec = z.infer<typeof WorkflowSpec>;

const SYSTEM = `You translate a user's natural-language monitoring request into a JSON workflow spec.
Output ONLY JSON of this shape:
{
  "strategySet": string | null,
  "assets": string[],
  "protocols": string[],
  "wallets": string[],
  "deepbook": boolean,
  "intervalMs": number,
  "durationDays": number,
  "instruction": string,
  "telegram": boolean
}
Field meaning:
- strategySet: the name of the user's knowledge set holding their strategy/notes. Pick the best match from AVAILABLE SETS by name. If the user says "my strategy" / "the doc I uploaded", choose the closest set. null if nothing fits.
- assets: lowercase coingecko ids for token prices to track. Map common names: SUI->"sui", ETH/Ether->"ethereum", BTC/Bitcoin->"bitcoin", SOL->"solana". [] if none.
- protocols: DefiLlama protocol slugs to track TVL for (e.g. "aave","uniswap","lido"). [] if none.
- wallets: Sui addresses (0x followed by 64 hex chars) the user wants watched. Extract any such address verbatim from the request ("my wallet 0x...", "watch 0x..."). [] if none.
- deepbook: true if the user wants their actual on-chain DeepBook trades/orders read and graded ("my trades", "my deepbook orders", "my fills", "what I bought/sold"). false otherwise.
- intervalMs: how often to check. "daily"/"updates" with no explicit cadence -> 86400000. A short demo phrase like "every minute" -> 60000.
- durationDays: parse "next 5 days" -> 5. Default 5.
- instruction: one sentence describing what to report.
- telegram: true if updates should go to Telegram.`;

export async function compileWorkflow(prompt: string, opts: { sets: string[] }): Promise<WorkflowSpec> {
  const user = `AVAILABLE SETS: ${opts.sets.length ? opts.sets.join(", ") : "(none)"}\n\nREQUEST: ${prompt}`;
  return chatJSON(SYSTEM, user, WorkflowSpec);
}
