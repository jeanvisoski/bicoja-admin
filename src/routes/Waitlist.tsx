import { useQuery } from "@tanstack/react-query";
import { Download, Mail, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Signup = { id: string; email: string; source: string | null; created_at: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function Waitlist() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin-waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase.from("waitlist_signups").select("id, email, source, created_at").order("created_at", { ascending: false }).returns<Signup[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  function downloadCsv() {
    const rows = ["email,origem,cadastrado_em", ...data.map((signup) => [signup.email, signup.source ?? "site", signup.created_at].map((value) => `\"${String(value).replaceAll("\"", "\"\"")}\"`).join(","))];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "lista-de-espera-bicoja.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="p-5 sm:p-8 max-w-5xl mx-auto">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6"><div><h1 className="text-2xl font-extrabold tracking-tight">Lista de espera</h1><p className="text-sm text-muted-foreground mt-1">Pessoas que pediram para ser avisadas quando a bicojá chegar às lojas.</p></div><button disabled={!data.length} onClick={downloadCsv} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"><Download className="h-4 w-4" />Exportar CSV</button></div>
    <div className="grid sm:grid-cols-2 gap-4 mb-6"><div className="rounded-2xl border border-border bg-card p-5 shadow-card"><Users className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-extrabold">{data.length}</p><p className="text-xs text-muted-foreground">cadastros recebidos</p></div><div className="rounded-2xl border border-border bg-card p-5 shadow-card"><Mail className="h-5 w-5 text-primary mb-2" /><p className="text-sm font-semibold">Captação ativa</p><p className="text-xs text-muted-foreground">O formulário do site grava os e-mails nesta lista.</p></div></div>
    <section className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">{isLoading ? <p className="p-6 text-sm text-muted-foreground">Carregando cadastros...</p> : error ? <p className="p-6 text-sm text-destructive">Não foi possível carregar a lista. Confirme se a migration 0044_waitlist_signups.sql foi executada.</p> : data.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Ainda não há pessoas na lista de espera.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-semibold">E-mail</th><th className="px-5 py-3 font-semibold">Origem</th><th className="px-5 py-3 font-semibold">Cadastro</th></tr></thead><tbody className="divide-y divide-border">{data.map((signup) => <tr key={signup.id}><td className="px-5 py-4 font-medium">{signup.email}</td><td className="px-5 py-4 text-muted-foreground">{signup.source ?? "site"}</td><td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{formatDate(signup.created_at)}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
