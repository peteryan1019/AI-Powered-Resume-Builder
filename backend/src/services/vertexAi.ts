import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | undefined;

/**
 * Returns the shared Google Cloud Vertex AI client.
 *
 * Authentication is intentionally left to Google Application Default
 * Credentials. In local development that can come from `gcloud auth
 * application-default login`; in Docker and Kubernetes it comes from the
 * service-account credential file named by GOOGLE_APPLICATION_CREDENTIALS.
 */
export function getVertexAiClient(): GoogleGenAI {
  if (client) return client;

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI.");
  }

  client = new GoogleGenAI({
    // `enterprise` is the current SDK name for the Google Cloud/Vertex AI
    // backend. `vertexai: true` remains an alias, but is no longer preferred.
    enterprise: true,
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
  });

  return client;
}
