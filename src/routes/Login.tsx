import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShieldCheck, Mail, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSending(false);
      toast.error(error.message);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", data.user.id)
      .single();
    setSending(false);
    if (!profile?.is_admin) {
      await supabase.auth.signOut();
      toast.error("Esta conta não tem acesso de administrador.");
      return;
    }
    nav({ to: "/providers" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/40 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-card border border-border rounded-3xl shadow-float p-8"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-hero flex items-center justify-center mb-4 shadow-float">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">BicoJá Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesso restrito à equipe</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 h-12 rounded-xl bg-background border border-border px-4">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-3 h-12 rounded-xl bg-background border border-border px-4">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {sending ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
