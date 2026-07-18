import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock3, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";

type WalletRow = {
  id: string;
  provider_id: string;
  type: string;
  amount: number;
  status: "pendente" | "em_garantia" | "disponivel" | "reservado" | "pago" | "congelado" | "reembolsado";
  available_at: string | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
  orders: { id: string } | null;
};

type PayoutRequest = { id: string; provider_id: string; amount: number; destination_snapshot: { pix_key?: string; holder_name?: string } | null; status: string; requested_at: string; profiles?: { full_name: string | null } | null };

function useWallets() {
  return useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, provider_id, type, amount, status, available_at, created_at, orders(id)")
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<WalletRow[]>();
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((row) => row.provider_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return (data ?? []).map((row) => ({ ...row, profiles: names.get(row.provider_id) ?? null }));
    },
  });
}

function usePayoutRequests() {
  return useQuery({
    queryKey: ["admin-payout-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payout_requests").select("id, provider_id, amount, destination_snapshot, status, requested_at").in("status", ["solicitado", "aprovado"]).order("requested_at", { ascending: true }).returns<PayoutRequest[]>();
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((row) => row.provider_id))];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return (data ?? []).map((row) => ({ ...row, profiles: names.get(row.provider_id) ?? null }));
    },
  });
}

function usePayoutDestinations() {
  return useQuery({
    queryKey: ["admin-payout-destinations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_payout_destinations").select("provider_id, pix_key, pix_key_type, holder_name, status").eq("status", "pendente");
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((row) => row.provider_id))];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
      return (data ?? []).map((row) => ({ ...row, full_name: names.get(row.provider_id) ?? "Prestador" }));
    },
  });
}

export function Wallets() {
  const { data: transactions = [], isLoading } = useWallets();
  const { data: payouts = [] } = usePayoutRequests();
  const { data: destinations = [] } = usePayoutDestinations();
  const queryClient = useQueryClient();
  const totals = transactions.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + Number(row.amount);
    return acc;
  }, {} as Record<string, number>);

  async function setStatus(row: WalletRow, status: WalletRow["status"]) {
    const { error } = await supabase
      .from("wallet_transactions")
      .update({ status, available_at: status === "disponivel" ? new Date().toISOString() : row.available_at })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(status === "pago" ? "Saque marcado como pago." : "Saldo liberado.");
    queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
  }

  async function reviewPayout(payout: PayoutRequest, status: "aprovado" | "pago" | "rejeitado") {
    const reference = status === "pago" ? window.prompt("Informe o identificador/comprovante da transferencia Pix:") : null;
    if (status === "pago" && !reference) return;
    const { error } = await supabase.rpc("review_payout_request", { p_request_id: payout.id, p_status: status, p_note: null, p_reference: reference });
    if (error) return toast.error(error.message);
    toast.success(status === "pago" ? "Saque marcado como pago." : status === "rejeitado" ? "Saque rejeitado e saldo devolvido." : "Saque aprovado para transferencia.");
    queryClient.invalidateQueries({ queryKey: ["admin-payout-requests"] });
    queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
  }

  async function verifyDestination(providerId: string, status: "verificado" | "desativado") {
    const { error } = await supabase.from("provider_payout_destinations").update({ status, updated_at: new Date().toISOString() }).eq("provider_id", providerId);
    if (error) return toast.error(error.message);
    toast.success(status === "verificado" ? "Chave Pix verificada." : "Chave Pix recusada.");
    queryClient.invalidateQueries({ queryKey: ["admin-payout-destinations"] });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight">Carteira e repasses</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Libere valores pendentes e registre pagamentos aos prestadores.</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Em garantia" value={(totals.pendente ?? 0) + (totals.em_garantia ?? 0) + (totals.congelado ?? 0)} tint="bg-amber-100 text-amber-700" />
        <Stat label="Disponível" value={totals.disponivel ?? 0} tint="bg-emerald-100 text-emerald-700" />
        <Stat label="Pago" value={totals.pago ?? 0} tint="bg-slate-100 text-slate-700" />
      </div>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Chaves Pix aguardando validacao</h2>{destinations.length === 0 ? <p className="text-sm text-muted-foreground mt-3">Nenhuma chave pendente.</p> : <div className="space-y-3 mt-4">{destinations.map((destination) => <div key={destination.provider_id} className="rounded-xl border border-border p-3 flex items-center gap-3"><div className="flex-1"><p className="text-sm font-semibold">{destination.full_name}</p><p className="text-xs text-muted-foreground">{destination.pix_key_type}: {destination.pix_key} · {destination.holder_name}</p></div><button onClick={() => verifyDestination(destination.provider_id, "verificado")} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Validar</button><button onClick={() => verifyDestination(destination.provider_id, "desativado")} className="h-8 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold">Recusar</button></div>)}</div>}</section>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Solicitacoes de saque</h2><p className="text-xs text-muted-foreground mt-1 mb-4">Valide a chave Pix, transfira fora da plataforma e registre o comprovante.</p>{payouts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum saque aguardando analise.</p> : <div className="space-y-3">{payouts.map((payout) => <div key={payout.id} className="rounded-xl border border-border p-3 flex items-center gap-3"><div className="flex-1"><p className="text-sm font-semibold">{payout.profiles?.full_name ?? "Prestador"} · R$ {Number(payout.amount).toFixed(2)}</p><p className="text-xs text-muted-foreground">Pix: {payout.destination_snapshot?.pix_key ?? "—"} · {payout.destination_snapshot?.holder_name ?? "—"}</p></div><div className="flex gap-2">{payout.status === "solicitado" && <><button onClick={() => reviewPayout(payout, "aprovado")} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Aprovar</button><button onClick={() => reviewPayout(payout, "rejeitado")} className="h-8 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold">Rejeitar</button></>}{payout.status === "aprovado" && <button onClick={() => reviewPayout(payout, "pago")} className="h-8 px-3 rounded-lg bg-trust text-primary-foreground text-xs font-semibold">Marcar pago</button>}</div></div>)}</div>}</section>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando carteira...</p>}
      {!isLoading && transactions.length === 0 && <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground"><WalletCards className="h-9 w-9 mx-auto mb-3" />Nenhuma movimentação.</div>}
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {transactions.map((row) => (
          <div key={row.id} className="p-4 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${["pendente", "em_garantia", "congelado"].includes(row.status) ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{["pendente", "em_garantia", "congelado"].includes(row.status) ? <Clock3 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div>
            <div className="flex-1"><p className="font-semibold text-sm">{row.profiles?.full_name ?? "Prestador"}</p><p className="text-xs text-muted-foreground">Pedido #{row.orders?.id.slice(0, 8) ?? "—"} · {row.type}</p></div>
            <p className="font-bold">R$ {Number(row.amount).toFixed(2)}</p>
            {row.status === "pendente" && <button onClick={() => setStatus(row, "disponivel")} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Liberar</button>}
            {row.status === "disponivel" && <button onClick={() => setStatus(row, "pago")} className="h-9 px-3 rounded-lg border border-border text-xs font-semibold">Marcar pago</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return <div className={`rounded-2xl p-4 ${tint}`}><p className="text-xs font-semibold">{label}</p><p className="text-xl font-extrabold mt-1">R$ {value.toFixed(2)}</p></div>;
}
