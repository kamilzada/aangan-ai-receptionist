import { LoginForm } from "./login-form";
import s from "../dashboard.module.css";

export const metadata = { title: "Sign in · Aangan dashboard" };

export default function LoginPage() {
  return (
    <main className={s.loginWrap}>
      <div className={s.loginCard}>
        <p className={s.eyebrow}>Aangan Studio</p>
        <h1 className={s.loginTitle}>Receptionist dashboard</h1>
        <p className={s.muted}>Enter the studio passcode to see how the AI receptionist is doing.</p>
        <LoginForm />
      </div>
    </main>
  );
}
