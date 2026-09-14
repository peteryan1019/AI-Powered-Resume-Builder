import "dotenv/config";
import { validateProductionEnvironment } from "./lib/environment.js";

validateProductionEnvironment("api");
await import("./index.js");
