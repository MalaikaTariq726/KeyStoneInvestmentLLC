import "server-only";

// Central place for configuration. Everything comes from environment variables
// (.env.local in development, Vercel project settings in production).
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  get dbName() {
    return process.env.MONGODB_DB || "keystone-db";
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
    return secret;
  },
  // Only addresses on this domain may request a sign-in code.
  get allowedDomain() {
    return (process.env.ALLOWED_EMAIL_DOMAIN || "keystoneinvestmentllc.com").toLowerCase().replace(/^@/, "");
  },
  smtp: {
    get host() {
      return process.env.SMTP_HOST || "";
    },
    get port() {
      return Number(process.env.SMTP_PORT || 587);
    },
    get user() {
      return process.env.SMTP_USER || "";
    },
    get pass() {
      return process.env.SMTP_PASS || "";
    },
    get from() {
      return process.env.SMTP_FROM || process.env.SMTP_USER || "";
    },
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  // The 000000 test sign-in (and running without SMTP). Always on locally. In a deployed
  // build it is OFF unless ALLOW_TEST_LOGIN=1 is set, so real production stays locked to
  // emailed codes. Only enable it on a throwaway/dummy deployment with no real data: while it
  // is on, anyone who knows an account's email can sign in with 000000.
  get allowTestLogin() {
    return !this.isProduction || process.env.ALLOW_TEST_LOGIN === "1";
  },
};
