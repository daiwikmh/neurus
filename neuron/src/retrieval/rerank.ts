import { AutoTokenizer, AutoModelForSequenceClassification } from "@huggingface/transformers";

const MODEL_ID = "Xenova/ms-marco-MiniLM-L-6-v2";

let tokenizer: any = null;
let model: any = null;

async function load() {
  if (model) return;
  tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
  model = await AutoModelForSequenceClassification.from_pretrained(MODEL_ID, { dtype: "fp32" });
}

export interface Ranked {
  index: number;
  score: number;
  text: string;
}

export async function rerank(query: string, docs: string[]): Promise<Ranked[]> {
  if (docs.length === 0) return [];
  await load();
  const inputs = tokenizer(new Array(docs.length).fill(query), { text_pair: docs, padding: true, truncation: true });
  const { logits } = await model(inputs);
  const scores: number[] = logits.tolist().map((row: number[]) => row[0]);
  return docs
    .map((text, index) => ({ index, score: scores[index], text }))
    .sort((a, b) => b.score - a.score);
}
