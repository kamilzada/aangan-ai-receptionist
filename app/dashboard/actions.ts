"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DASH_COOKIE, dashboardToken, passcodeMatches } from "@/lib/dashboard-auth";

export async function login(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const code = String(form.get("passcode") ?? "");
  if (!process.env.DASHBOARD_PASSCODE) return { error: "DASHBOARD_PASSCODE is not set on the server." };
  if (!passcodeMatches(code)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "That passcode isn't right." };
  }
  (await cookies()).set(DASH_COOKIE, dashboardToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/dashboard",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/dashboard");
}

export async function logout() {
  (await cookies()).delete({ name: DASH_COOKIE, path: "/dashboard" });
  redirect("/dashboard/login");
}
