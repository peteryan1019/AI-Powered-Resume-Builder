type Service = "api" | "worker";

const API_REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "SECRETKEY",
  "FRONTEND_URL",
  "BACKEND_URL",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

const WORKER_REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("change-me") ||
    normalized.startsWith("replace-with") ||
    normalized.startsWith("replace_with") ||
    normalized.startsWith("your-") ||
    normalized.endsWith("_xxx") ||
    normalized === "you@example.com"
  );
}

function validateHttpsUrl(name: string, value: string, errors: string[]): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${name} must use https in production.`);
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

/**
 * Fail once, at process startup, with the complete configuration problem.
 * Without this, individual features fail much later and a container can look
 * healthy while email login, payments, or resume generation is unusable.
 */
export function validateProductionEnvironment(service: Service): void {
  if (process.env.NODE_ENV !== "production") return;

  const required = service === "api" ? API_REQUIRED : WORKER_REQUIRED;
  const errors: string[] = [];

  for (const name of required) {
    const value = process.env[name]?.trim();
    if (!value) errors.push(`${name} is required.`);
    else if (looksLikePlaceholder(value)) errors.push(`${name} still contains a placeholder.`);
  }

  if (service === "api") {
    const secret = process.env.SECRETKEY?.trim();
    if (secret && secret.length < 32) errors.push("SECRETKEY must be at least 32 characters.");

    for (const name of ["FRONTEND_URL", "BACKEND_URL"] as const) {
      const value = process.env[name]?.trim();
      if (value) validateHttpsUrl(name, value, errors);
    }

    const from = process.env.MAIL_FROM?.trim();
    if (from && !from.includes("@")) errors.push("MAIL_FROM must contain a sender email address.");
  }

  if (errors.length) {
    throw new Error(
      `Invalid production environment for ${service}:\n- ${errors.join("\n- ")}`,
    );
  }
}
