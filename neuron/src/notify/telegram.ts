export interface TelegramTarget {
  token: string;
  chatId: string;
}

export async function sendTelegram(target: TelegramTarget, text: string, opts: { markdown?: boolean } = {}): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${target.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: target.chatId,
      text,
      disable_web_page_preview: true,
      ...(opts.markdown ? { parse_mode: "Markdown" } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage HTTP ${res.status}: ${await res.text().catch(() => "")}`);
}
