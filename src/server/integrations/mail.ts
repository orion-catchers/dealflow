import { ApiFailure } from "@/lib/api/respond";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.MAIL_WEBHOOK_URL);
}

/** Fail-closed in production when a send is required and no provider is set. */
export async function sendMail(message: MailMessage): Promise<{ delivered: boolean; mode: "RESEND" | "WEBHOOK" | "LOG" }> {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "DealFlow360 <noreply@nexa.example>",
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new ApiFailure("INVALID_INPUT", "Email provider rejected the message", { status: response.status });
    }
    return { delivered: true, mode: "RESEND" };
  }
  if (process.env.MAIL_WEBHOOK_URL) {
    const response = await fetch(process.env.MAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      throw new ApiFailure("INVALID_INPUT", "Mail webhook rejected the message", { status: response.status });
    }
    return { delivered: true, mode: "WEBHOOK" };
  }
  if (process.env.NODE_ENV === "production") {
    throw new ApiFailure("INVALID_INPUT", "Email delivery is not connected");
  }
  console.log(`[mail] ${message.subject} → ${message.to}\n${message.text}`);
  return { delivered: false, mode: "LOG" };
}
