import "server-only";
import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import { env } from "./env";

// One client per server process (MongoDB's recommended pattern). In development Next.js
// reloads modules on every change, so the client is parked on globalThis to avoid leaking
// a new connection pool on each reload.
const globalForMongo = globalThis as unknown as { _ksMongo?: Promise<MongoClient> };

function connect(): Promise<MongoClient> {
  const isAtlas = env.mongoUri.startsWith("mongodb+srv://");
  const client = new MongoClient(env.mongoUri, {
    ...(isAtlas ? { serverApi: { version: ServerApiVersion.v1 } } : {}),
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 15_000,
    retryWrites: true,
    retryReads: true,
  });
  return client.connect();
}

export async function getDb(): Promise<Db> {
  if (!globalForMongo._ksMongo) {
    globalForMongo._ksMongo = connect().catch((error) => {
      globalForMongo._ksMongo = undefined; // let the next request retry
      throw error;
    });
  }
  const client = await globalForMongo._ksMongo;
  return client.db(env.dbName);
}

// Same collection names the desktop app uses.
export const C = {
  users: "users",
  claims: "claims",
  projects: "projects",
  generalExpenses: "generalExpenses",
  employees: "employees",
  subcontractors: "subcontractors",
  // Web-only. Kept in its own collection so the desktop app's documents never gain fields
  // it doesn't know about (several of its C# models reject unknown fields).
  loginCodes: "webLoginCodes",
} as const;
