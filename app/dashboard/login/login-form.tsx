"use client";

import { useActionState } from "react";
import { login } from "../actions";
import s from "../dashboard.module.css";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className={s.loginForm}>
      <label htmlFor="passcode" className={s.label}>
        Passcode
      </label>
      <input id="passcode" name="passcode" type="password" autoComplete="current-password" required autoFocus className={s.input} />
      {state?.error && (
        <p role="alert" className={s.error}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={s.button}>
        {pending ? "Checking…" : "Open dashboard"}
      </button>
    </form>
  );
}
