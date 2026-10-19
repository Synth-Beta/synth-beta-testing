/**
 * Brevo transactional send for The Synth Setlist.
 * Acceptance is a 201 response with messageId. That is not inbox delivery.
 * The API key is read by the caller and is never written into payloads, errors, or logs.
 */

export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
export const NEWSLETTER_SENDER = {
  name: "The Synth Setlist",
  email: "synth.no.reply@getsynth.app",
} as const;

/** Well under Brevo's 1,000 requests/second general limit for POST /v3/smtp/email. */
export const BREVO_PACE_MS = 100;

const STOP_CODES = new Set([
  "not_enough_credits",
  "unauthorized",
  "permission_denied",
  "account_under_validation",
]);

export class DeliveryRejectedError extends Error {
  readonly stopBatch: boolean;
  constructor(message: string, stopBatch = false) {
    super(message);
    this.name = "DeliveryRejectedError";
    this.stopBatch = stopBatch;
  }
}

export class DeliveryUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryUncertainError";
  }
}

export interface BrevoNewsletterMessage {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl: string;
  deliveryKey: string;
}

export const brevoPayload = (message: BrevoNewsletterMessage) => ({
  sender: { name: NEWSLETTER_SENDER.name, email: NEWSLETTER_SENDER.email },
  to: [{ email: message.to }],
  subject: message.subject,
  htmlContent: message.html,
  tags: ["synth-setlist"],
  headers: {
    "X-Mailin-custom": message.deliveryKey,
    "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});

const safeError = (value: string, secret: string) => {
  const redacted = secret ? value.split(secret).join("[redacted]") : value;
  return redacted.slice(0, 500);
};

const paceBrevoSend = async () => {
  await new Promise((resolve) => setTimeout(resolve, BREVO_PACE_MS));
};

/** Returns the Brevo message id after a 201 acceptance. Does not retry. */
export const sendBrevoNewsletter = async (apiKey: string, message: BrevoNewsletterMessage) => {
  if (!apiKey) throw new DeliveryRejectedError("BREVO_API_KEY is not configured.", true);
  await paceBrevoSend();

  let response: Response;
  try {
    response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "api-key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(brevoPayload(message)),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const detail = name === "TimeoutError" || name === "AbortError"
      ? "Brevo did not respond before the timeout. Acceptance was not confirmed."
      : "Brevo request failed before a response. Acceptance was not confirmed.";
    throw new DeliveryUncertainError(detail);
  }

  const body = await response.json().catch(() => ({})) as { message?: string; code?: string; messageId?: string };
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (response.status === 201 && messageId) return messageId;

  const detail = safeError(
    [body.code, body.message].filter(Boolean).join(": ") || `Brevo request failed (${response.status})`,
    apiKey,
  );
  const stopBatch = response.status === 429
    || response.status === 401
    || response.status === 402
    || response.status === 403
    || STOP_CODES.has(String(body.code ?? ""));
  if (stopBatch) throw new DeliveryRejectedError(detail, true);
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409) {
    throw new DeliveryRejectedError(detail, false);
  }
  throw new DeliveryUncertainError(
    response.status === 201
      ? "Brevo returned 201 without a message id. Acceptance was not confirmed."
      : safeError(`Brevo response ${response.status} did not confirm acceptance. ${detail}`, apiKey),
  );
};
