import { afterEach, describe, expect, it, vi } from "vitest";
import { validateProductionEnvironment } from "./environment.js";

afterEach(() => vi.unstubAllEnvs());

describe("production environment validation", () => {
  it("does not require production integrations during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => validateProductionEnvironment("api")).not.toThrow();
  });

  it("reports all missing API configuration together", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const name of [
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
    ]) {
      vi.stubEnv(name, "");
    }

    expect(() => validateProductionEnvironment("api")).toThrowError(
      /DATABASE_URL is required[\s\S]*RESEND_API_KEY is required[\s\S]*GOOGLE_APPLICATION_CREDENTIALS is required/,
    );
  });

  it("rejects insecure public URLs, short secrets, and example values", () => {
    vi.stubEnv("NODE_ENV", "production");
    const validValues: Record<string, string> = {
      DATABASE_URL: "postgresql://app:password@db.internal/resume",
      REDIS_URL: "rediss://cache.internal:6379",
      SECRETKEY: "a-secure-session-secret-that-is-long-enough",
      FRONTEND_URL: "https://resume.example.com",
      BACKEND_URL: "https://resume.example.com",
      RESEND_API_KEY: "re_live_secure",
      MAIL_FROM: "Tailr <login@resume.example.com>",
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      STRIPE_SECRET_KEY: "sk_live_secure",
      STRIPE_WEBHOOK_SECRET: "whsec_secure",
      STRIPE_PRICE_ID: "price_secure",
      GOOGLE_CLOUD_PROJECT: "resume-builder-production",
      GOOGLE_CLOUD_LOCATION: "global",
      GOOGLE_APPLICATION_CREDENTIALS: "/var/run/secrets/google/service-account.json",
    };
    for (const [name, value] of Object.entries(validValues)) vi.stubEnv(name, value);

    vi.stubEnv("FRONTEND_URL", "http://resume.example.com");
    vi.stubEnv("SECRETKEY", "too-short");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "your-google-cloud-project-id");

    expect(() => validateProductionEnvironment("api")).toThrowError(
      /GOOGLE_CLOUD_PROJECT still contains a placeholder[\s\S]*SECRETKEY must be at least 32 characters[\s\S]*FRONTEND_URL must use https/,
    );
  });
});
