import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock3, FlaskConical, Lock, RotateCcw, Unlock, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";

type WalletRow = {
  id: string;
  provider_id: string;
  type: string;
  amount: number;
  status: "pendente" | "em_garantia" | "disponivel" | "reservado" | "pago" | "congelado" | "reembolsado";
  available_at: string | null;
  created_at: string;
  order_id: string | null;
  profiles: { full_name: string | null } | null;
  orders: { id: string } | null;
  isReal: boolean;
};

const OPEN_STATUSES = ["pendente", "em_garantia", "disponivel", "reservado", "congelado"];

type PayoutRequest = { id: string; provider_id: string; amount: number; destination_snapshot: { pix_key?: string; holder_name?: string } | null; status: string; requested_at: string; profiles?: { full_name: string | null } | null };

function useWallets() {
  return useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, provider_id, type, amount, status, available_at, created_at, order_id, orders(id)")
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<Omit<WalletRow, "profiles" | "isReal">[]>();
      if (error) throw error;
      const providerIds = [...new Set((data ?? []).map((row) => row.provider_id))];
      const orderIds = [...new Set((data ?? []).map((row) => row.order_id).filter((id): id is string => !!id))];
      const [{ data: profiles }, { data: payments }] = await Promise.all([
        providerIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", providerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
        orderIds.length
          ? supabase.from("payment_transactions").select("order_id, mode").in("order_id", orderIds)
          : Promise.resolve({ data: [] as { order_id: string; mode: string }[] }),
      ]);
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      // Sem linha em payment_transactions = pedido de homologação (100% simulado).
      // mode = 'sandbox' também é dinheiro de teste; só 'producao' é real.
      const modeByOrder = new Map((payments ?? []).map((p) => [p.order_id, p.mode]));
      return (data ?? []).map((row) => ({
        ...row,
        profiles: names.get(row.provider_id) ?? null,
        isReal: row.order_id ? modeByOrder.get(row.order_id) === "producao" : false,
      }));
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

type ProviderBalanceRow = {
  profile_id: string;
  full_name: string | null;
  payouts_frozen: boolean;
  available: number;
  pending: number;
};

function useProviderBalances() {
  return useQuery({
    queryKey: ["admin-provider-balances"],
    queryFn: async () => {
      const [{ data: providers, error: providersError }, { data: wallet, error: walletError }] =
        await Promise.all([
          supabase
            .from("provider_profiles")
            .select("profile_id, payouts_frozen, profiles(full_name)")
            .returns<{ profile_id: string; payouts_frozen: boolean; profiles: { full_name: string | null } | null }[]>(),
          supabase.from("wallet_transactions").select("provider_id, amount, status"),
        ]);
      if (providersError) throw providersError;
      if (walletError) throw walletError;
      const byProvider = new Map<string, { available: number; pending: number }>();
      for (const w of wallet ?? []) {
        const entry = byProvider.get(w.provider_id) ?? { available: 0, pending: 0 };
        if (w.status === "disponivel") entry.available += Number(w.amount);
        else if (["pendente", "em_garantia", "congelado", "reservado"].includes(w.status))
          entry.pending += Number(w.amount);
        byProvider.set(w.provider_id, entry);
      }
      return (providers ?? [])
        .map((p) => ({
          profile_id: p.profile_id,
          full_name: p.profiles?.full_name ?? null,
          payouts_frozen: p.payouts_frozen,
          available: byProvider.get(p.profile_id)?.available ?? 0,
          pending: byProvider.get(p.profile_id)?.pending ?? 0,
        }))
        .filter((p) => p.available > 0 || p.pending > 0 || p.payouts_frozen)
        .sort((a, b) => b.available - a.available) as ProviderBalanceRow[];
    },
  });
}

export function Wallets() {
  const { data: transactions = [], isLoading } = useWallets();
  const { data: payouts = [] } = usePayoutRequests();
  const { data: destinations = [] } = usePayoutDestinations();
  const { data: providerBalances = [] } = useProviderBalances();
  const queryClient = useQueryClient();
  const totals = transactions.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + Number(row.amount);
    return acc;
  }, {} as Record<string, number>);
  const realObligations = transactions
    .filter((row) => row.isReal && OPEN_STATUSES.includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const testObligations = transactions
    .filter((row) => !row.isReal && OPEN_STATUSES.includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const realPaid = transactions.filter((row) => row.isReal && row.status === "pago").reduce((sum, row) => sum + Number(row.amount), 0);

  async function voidTransaction(row: WalletRow) {
    const note = window.prompt(
      `Motivo pra estornar esta movimentação de R$ ${Number(row.amount).toFixed(2)} (${row.profiles?.full_name ?? "prestador"})${row.isReal ? " -- ATENÇÃO: pedido com pagamento REAL confirmado" : " (pedido de teste, sem dinheiro real)"}:`,
    );
    if (note === null) return;
    if (note.trim().length < 10) {
      toast.error("Descreva o motivo com pelo menos 10 caracteres.");
      return;
    }
    const { error } = await supabase.rpc("admin_void_wallet_transaction", { p_wallet_transaction_id: row.id, p_note: note.trim() });
    if (error) return toast.error(error.message);
    toast.success("Movimentação estornada.");
    queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
    queryClient.invalidateQueries({ queryKey: ["admin-provider-balances"] });
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

  async function togglePayoutsFrozen(provider: ProviderBalanceRow) {
    const nextFrozen = !provider.payouts_frozen;
    const note = window.prompt(
      nextFrozen
        ? `Motivo pra congelar o saldo de ${provider.full_name ?? "este prestador"}:`
        : `Motivo pra liberar o saldo de ${provider.full_name ?? "este prestador"}:`,
    );
    if (note === null) return;
    if (note.trim().length < 10) {
      toast.error("Descreva o motivo com pelo menos 10 caracteres.");
      return;
    }
    const { error } = await supabase.rpc("admin_set_payouts_frozen", {
      p_provider_id: provider.profile_id,
      p_frozen: nextFrozen,
      p_note: note.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success(nextFrozen ? "Saldo congelado." : "Saldo liberado para saque.");
    queryClient.invalidateQueries({ queryKey: ["admin-provider-balances"] });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight">Carteira e repasses</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Libere valores pendentes e registre pagamentos aos prestadores.</p>

      <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-5 w-5 text-amber-700" /><h2 className="font-bold text-amber-900">Dinheiro real x pedidos de teste</h2></div>
        <p className="text-xs text-amber-900/80 mb-4">
          Pedidos feitos em modo homologação (sem gateway) ou sandbox do Mercado Pago não movimentam dinheiro real — mas
          geram as mesmas movimentações de carteira que um pedido de produção. Use os números abaixo pra saber o que é
          obrigação de verdade, e o botão "Estornar" em cada movimentação (na lista completa) pra zerar saldo de teste que
          não vai poder ser pago.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label="Obrigação real (a pagar de verdade)" value={realObligations} tint="bg-white text-amber-900 border border-amber-200" />
          <Stat label="Já pago (real)" value={realPaid} tint="bg-white text-amber-900 border border-amber-200" />
          <Stat label="Simulado/teste (não é dinheiro real)" value={testObligations} tint="bg-white text-muted-foreground border border-border" />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Em garantia" value={(totals.pendente ?? 0) + (totals.em_garantia ?? 0) + (totals.congelado ?? 0)} tint="bg-amber-100 text-amber-700" />
        <Stat label="Disponível" value={totals.disponivel ?? 0} tint="bg-emerald-100 text-emerald-700" />
        <Stat label="Pago" value={totals.pago ?? 0} tint="bg-slate-100 text-slate-700" />
      </div>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold">Prestadores</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          Congele o saldo de um prestador específico sem suspender a conta -- ele continua
          recebendo pedidos normalmente, só não consegue solicitar saque enquanto estiver
          congelado.
        </p>
        {providerBalances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum prestador com saldo no momento.</p>
        ) : (
          <div className="space-y-3">
            {providerBalances.map((provider) => (
              <div
                key={provider.profile_id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${provider.payouts_frozen ? "border-destructive/40 bg-destructive/5" : "border-border"}`}
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold">{provider.full_name ?? "Prestador"}</p>
                  <p className="text-xs text-muted-foreground">
                    Disponível: R$ {provider.available.toFixed(2)} · Pendente: R${" "}
                    {provider.pending.toFixed(2)}
                  </p>
                  {provider.payouts_frozen && (
                    <p className="text-xs font-semibold text-destructive mt-0.5">Saldo congelado</p>
                  )}
                </div>
                <button
                  onClick={() => togglePayoutsFrozen(provider)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${provider.payouts_frozen ? "bg-trust text-primary-foreground" : "border border-destructive text-destructive"}`}
                >
                  {provider.payouts_frozen ? (
                    <>
                      <Unlock className="h-3.5 w-3.5" /> Liberar
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" /> Congelar
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Chaves Pix aguardando validacao</h2>{destinations.length === 0 ? <p className="text-sm text-muted-foreground mt-3">Nenhuma chave pendente.</p> : <div className="space-y-3 mt-4">{destinations.map((destination) => <div key={destination.provider_id} className="rounded-xl border border-border p-3 flex items-center gap-3"><div className="flex-1"><p className="text-sm font-semibold">{destination.full_name}</p><p className="text-xs text-muted-foreground">{destination.pix_key_type}: {destination.pix_key} · {destination.holder_name}</p></div><button onClick={() => verifyDestination(destination.provider_id, "verificado")} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Validar</button><button onClick={() => verifyDestination(destination.provider_id, "desativado")} className="h-8 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold">Recusar</button></div>)}</div>}</section>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Solicitacoes de saque</h2><p className="text-xs text-muted-foreground mt-1 mb-4">Valide a chave Pix, transfira fora da plataforma e registre o comprovante.</p>{payouts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum saque aguardando analise.</p> : <div className="space-y-3">{payouts.map((payout) => <div key={payout.id} className="rounded-xl border border-border p-3 flex items-center gap-3"><div className="flex-1"><p className="text-sm font-semibold">{payout.profiles?.full_name ?? "Prestador"} · R$ {Number(payout.amount).toFixed(2)}</p><p className="text-xs text-muted-foreground">Pix: {payout.destination_snapshot?.pix_key ?? "—"} · {payout.destination_snapshot?.holder_name ?? "—"}</p></div><div className="flex gap-2">{payout.status === "solicitado" && <><button onClick={() => reviewPayout(payout, "aprovado")} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Aprovar</button><button onClick={() => reviewPayout(payout, "rejeitado")} className="h-8 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold">Rejeitar</button></>}{payout.status === "aprovado" && <button onClick={() => reviewPayout(payout, "pago")} className="h-8 px-3 rounded-lg bg-trust text-primary-foreground text-xs font-semibold">Marcar pago</button>}</div></div>)}</div>}</section>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando carteira...</p>}
      {!isLoading && transactions.length === 0 && <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground"><WalletCards className="h-9 w-9 mx-auto mb-3" />Nenhuma movimentação.</div>}
      <p className="text-xs text-muted-foreground mb-2">
        "Pendente"/"Em garantia" liberam sozinhos quando o cliente confirma ou o prazo de garantia
        vence (ou por mediação de disputa, em Disputas); saques só saem marcados como pagos pela
        seção "Solicitações de saque" acima, com o comprovante Pix registrado. Use "Estornar" pra
        zerar manualmente uma movimentação que não vai ser paga (ex.: pedido de teste) — pedidos com
        pagamento já confirmado no Mercado Pago normalmente devem usar o reembolso na tela de
        Pedidos em vez disso.
      </p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {transactions.map((row) => (
          <div key={row.id} className="p-4 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${["pendente", "em_garantia", "congelado"].includes(row.status) ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{["pendente", "em_garantia", "congelado"].includes(row.status) ? <Clock3 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{row.profiles?.full_name ?? "Prestador"}</p>
              <p className="text-xs text-muted-foreground">Pedido #{row.orders?.id.slice(0, 8) ?? "—"} · {row.type}</p>
            </div>
            {!row.isReal && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-200 text-slate-700 flex items-center gap-1"><FlaskConical className="h-3 w-3" />TESTE</span>
            )}
            <p className="font-bold">R$ {Number(row.amount).toFixed(2)}</p>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-secondary text-muted-foreground">{WALLET_STATUS_LABEL[row.status] ?? row.status}</span>
            {!["pago", "reembolsado"].includes(row.status) && (
              <button onClick={() => voidTransaction(row)} title="Estornar / zerar esta movimentação" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const WALLET_STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando confirmação",
  em_garantia: "Em garantia",
  congelado: "Congelado (disputa)",
  disponivel: "Disponível",
  reservado: "Saque em processamento",
  pago: "Pago",
  reembolsado: "Reembolsado",
};

function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return <div className={`rounded-2xl p-4 ${tint}`}><p className="text-xs font-semibold">{label}</p><p className="text-xl font-extrabold mt-1">R$ {value.toFixed(2)}</p></div>;
}
