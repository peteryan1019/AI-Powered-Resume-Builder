import "dotenv/config";
import { validateProductionEnvironment } from "../lib/environment.js";

validateProductionEnvironment("worker");
await import("./worker.js");
