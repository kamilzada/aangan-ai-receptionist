/**
 * One-time Google sign-in for calendar access (MESA's Workspace blocks service-account keys).
 * 1. Opens Google's consent page in your browser; sign in with the account that owns the designer calendars.
 * 2. Saves GOOGLE_OAUTH_REFRESH_TOKEN to .env.local.
 * 3. If DESIGNERS_JSON still has placeholder calendars, creates "Aangan · Designer Ananya/Rohan" and saves their ids.
 * Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET (a "Desktop app" OAuth client) in .env.local.
 * Run: npm run google:auth
 */
import { config as loadEnv } from "dotenv";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { OAuth2Client } from "google-auth-library";

const ENV = ".env.local";
loadEnv({ path: ENV, quiet: true });

function setEnv(key: string, value: string) {
  const lines = readFileSync(ENV, "utf8").split("\n").filter((l) => !l.startsWith(`${key}=`) && l !== "");
  lines.push(`${key}=${value}`);
  writeFileSync(ENV, lines.join("\n") + "\n", { mode: 0o600 });
  process.env[key] = value;
}

async function signIn(id: string, secret: string): Promise<string> {
  const port = 53682;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const oauth = new OAuth2Client({ clientId: id, clientSecret: secret, redirectUri });
  const url = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", redirectUri);
      if (u.pathname !== "/callback") return void res.end();
      const err = u.searchParams.get("error");
      const c = u.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<body style="font-family:Georgia,serif;background:#F5F0E8;color:#2B2925;padding:64px;text-align:center">` +
          `<h1 style="font-weight:400">${c ? "Signed in. You can close this tab." : "Sign-in failed: " + err}</h1></body>`,
      );
      server.close();
      c ? resolve(c) : reject(new Error(`Google sign-in failed: ${err}`));
    });
    server.listen(port, "127.0.0.1", () => {
      console.log("Opening Google sign-in in your browser. If it doesn't open, visit:\n\n" + url + "\n");
      if (!process.env.NO_OPEN) execFile("open", [url]);
    });
  });

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google returned no refresh token. Remove the app's access at myaccount.google.com/permissions and retry.");
  return tokens.refresh_token;
}

async function main() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env.local first.");

  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.argv.includes("--reauth")) {
    setEnv("GOOGLE_OAUTH_REFRESH_TOKEN", await signIn(id, secret));
    console.log("Saved GOOGLE_OAUTH_REFRESH_TOKEN to .env.local");
  }

  const { createCalendar } = await import("../lib/google-calendar");
  const designers = JSON.parse(process.env.DESIGNERS_JSON || "[]") as { code: string; name: string; calendarId: string }[];
  if (!designers.length || designers.some((d) => d.calendarId.endsWith("@example.com"))) {
    const roster = [];
    for (const [code, name] of [["ananya", "Ananya"], ["rohan", "Rohan"]]) {
      const cal = await createCalendar(`Aangan · Designer ${name}`);
      roster.push({ code, name, calendarId: cal.id });
      console.log(`Created calendar "Aangan · Designer ${name}"`);
    }
    setEnv("DESIGNERS_JSON", `'${JSON.stringify(roster)}'`);
    console.log("Saved DESIGNERS_JSON to .env.local (you'll see both calendars in Google Calendar).");
  } else {
    console.log(`Designer calendars already set: ${designers.map((d) => d.name).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
