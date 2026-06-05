export interface TelegramTarget {
  token: string;
  chatId: string;
}

export async function sendTelegram(target: TelegramTarget, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${target.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: target.chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage HTTP ${res.status}: ${await res.text().catch(() => "")}`);
}
