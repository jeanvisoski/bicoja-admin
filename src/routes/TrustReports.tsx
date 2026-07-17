import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Report = { id: string; order_id: string; reporter_id: string | null; reported_user_id: string | null; category: string; description: string | null; evidence_excerpt: string | null; source: string; status: string; admin_note: string | null; created_at: string };
type Profile = { id: string; full_name: string | null; email: string | null };

function useTrustReports() {
  return useQuery({
    queryKey: ["admin-trust-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trust_reports").select("id, order_id, reporter_id, reported_user_id, category, description, evidence_excerpt, source, status, admin_note, created_at").in("status", ["aberto", "em_analise"]).order("created_at", { ascending: false }).returns<Report[]>();
      if (error) throw error;
      const ids = [...new Set((data ?? []).flatMap((report) => [report.reporter_id, report.reported_user_id]).filter(Boolean))] as string[];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids).returns<Profile[]>() : { data: [] as Profile[] };
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return (data ?? []).map((report) => ({ ...report, reporter: report.reporter_id ? profileById.get(report.reporter_id) ?? null : null, reported: report.reported_user_id ? profileById.get(report.reported_user_id) ?? null : null }));
    },
  });
}

export function TrustReports() {
  const { data: reports = [], isLoading } = useTrustReports();
  const queryClient = useQueryClient();

  async function resolve(report: Report, suspend: boolean) {
    if (suspend && report.reported_user_id) {
      const { error } = await supabase.from("provider_profiles").update({ is_suspended: true }).eq("profile_id", report.reported_user_id);
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase.from("trust_reports").update({ status: "resolvido", resolved_at: new Date().toISOString(), admin_note: suspend ? "Prestador suspenso por violação das regras de pagamento." : "Caso analisado e encerrado pela equipe." }).eq("id", report.id);
    if (error) return toast.error(error.message);
    toast.success(suspend ? "Denúncia resolvida e prestador suspenso." : "Denúncia resolvida.");
    queryClient.invalidateQueries({ queryKey: ["admin-trust-reports"] });
  }

  return <div className="p-8 max-w-5xl mx-auto"><h1 className="text-2xl font-extrabold tracking-tight mb-1">Proteção e denúncias</h1><p className="text-sm text-muted-foreground mb-6">Analise tentativas de pagamento externo e aplique medidas à conta do prestador.</p>
    {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
    {!isLoading && reports.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma denúncia aberta.</p>}
    <div className="space-y-3">{reports.map((report) => <article key={report.id} className="bg-card border border-border rounded-2xl p-5 shadow-card"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" /><div className="flex-1"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{report.category === "pagamento_externo" ? "Tentativa de pagamento externo" : report.category}</p><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{report.status.replace("_", " ")}</span></div><p className="text-xs text-muted-foreground mt-1">Denunciante: {report.reporter?.full_name ?? report.reporter?.email ?? "Sistema"} · Reportado: {report.reported?.full_name ?? report.reported?.email ?? "Não identificado"}</p>{report.description && <p className="mt-3 text-sm rounded-xl bg-secondary p-3">{report.description}</p>}<p className="mt-2 text-xs text-muted-foreground">Pedido #{report.order_id.slice(0, 8)} · {new Date(report.created_at).toLocaleString("pt-BR")}</p></div></div><div className="flex gap-2 mt-4"><button onClick={() => resolve(report, false)} className="h-9 px-4 rounded-lg border border-border text-xs font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Encerrar</button>{report.reported_user_id && <button onClick={() => resolve(report, true)} className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold flex items-center gap-2"><Ban className="h-4 w-4" /> Suspender prestador</button>}</div></article>)}</div>
  </div>;
}
