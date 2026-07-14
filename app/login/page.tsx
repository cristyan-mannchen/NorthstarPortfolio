"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, LoaderCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    const supabase = createSupabaseBrowserClient();
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/confirm` } });

    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === "signup" && !result.data.session) return setMessage("Check your email to confirm your account, then sign in.");
    router.push("/");
    router.refresh();
  }

  return <main className="auth-page">
    <section className="auth-brand-panel">
      <div className="auth-brand"><span><Compass size={25}/></span>Northstar</div>
      <div><p className="eyebrow">YOUR FINANCIAL NORTH STAR</p><h1>Every investment.<br/>One clear view.</h1><p>Track funds, ETFs, and stocks automatically with secure, private portfolio analytics.</p></div>
      <small>Secure authentication powered by Supabase</small>
    </section>
    <section className="auth-form-panel"><form className="auth-card" onSubmit={submit}>
      <div><p className="eyebrow">NORTHSTAR PORTFOLIO</p><h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2><p>{mode === "login" ? "Sign in to view your investments." : "Start tracking your portfolio in minutes."}</p></div>
      {mode === "signup" && <label>Full name<input name="fullName" autoComplete="name" minLength={2} maxLength={100} required placeholder="Your name"/></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label>
      <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="At least 8 characters"/></label>
      {message && <p className="auth-message" role="status">{message}</p>}
      <button className="auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18}/> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={18}/></>}</button>
      <button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>{mode === "login" ? "New to Northstar? Create an account" : "Already have an account? Sign in"}</button>
    </form></section>
  </main>;
}
