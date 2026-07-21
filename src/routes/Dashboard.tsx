import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  status: string;
  total: number | null;
  platform_fee: number | null;
  created_at: string;
};

type ProfileRow = { id: string; created_at: string };
type ProviderRow = { profile_id: string; verification_status: string | null };
type RequestRow = { id: string; status: string; created_at: string; proposals: { id: string }[] | null };
type WalletRow = { status: string; amount: number | null };

type MonthPoint = { key: string; label: string; revenue: number; gmv: number; orders: number; users: number };
type Alert = { title: string; description: string; tone: "danger" | "warning" | "info"; href: string };

type DashboardData = {
  totalUsers: number;
  totalProviders: number;
  pendingProviders: number;
  totalOrders: number;
  openRequests: number;
  openDisputes: number;
  revenue: number;
  gmv: number;
  conversionRate: number;
  availableToWithdraw: number;
  inGuarantee: number;
  monthly: MonthPoint[];
  recentUsers: ProfileRow[];
  alerts: Alert[];
  projection: { next90Revenue: number; next90Gmv: number; next90Orders: number; dailyRevenue: number };
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonths() {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: monthKey(date),
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      revenue: 0,
      gmv: 0,
      orders: 0,
      users: 0,
    };
  });
}

function useDashboard() {
  return useQuery({
    queryKey: ["admin-dashboard-v2"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardData> => {
      const [profilesResult, providersResult, ordersResult, requestsResult, walletResult] = await Promise.all([
        supabase.from("profiles").select("id, created_at").returns<ProfileRow[]>(),
        supabase.from("provider_profiles").select("profile_id, verification_status").returns<ProviderRow[]>(),
        supabase.from("orders").select("id, status, total, platform_fee, created_at").returns<OrderRow[]>(),
        supabase
          .from("service_requests")
          .select("id, status, created_at, proposals(id)")
          .returns<RequestRow[]>(),
        supabase.from("wallet_transactions").select("status, amount").returns<WalletRow[]>(),
      ]);

      const firstError = [profilesResult.error, providersResult.error, ordersResult.error, requestsResult.error, walletResult.error].find(Boolean);
      if (firstError) throw firstError;

      const profiles = profilesResult.data ?? [];
      const providers = providersResult.data ?? [];
      const orders = ordersResult.data ?? [];
      const requests = requestsResult.data ?? [];
      const wallet = walletResult.data ?? [];
      const monthly = buildMonths();
      const monthlyByKey = new Map(monthly.map((point) => [point.key, point]));

      for (const profile of profiles) {
        const point = monthlyByKey.get(monthKey(new Date(profile.created_at)));
        if (point) point.users++;
      }
      for (const order of orders) {
        const point = monthlyByKey.get(monthKey(new Date(order.created_at)));
        if (!point) continue;
        point.orders++;
        point.gmv += Number(order.total ?? 0);
        if (order.status === "concluido") point.revenue += Number(order.platform_fee ?? 0);
      }

      const completedOrders = orders.filter((order) => order.status === "concluido");
      const openRequests = requests.filter((request) => ["aberto", "em_negociacao"].includes(request.status));
      const noProposalRequests = openRequests.filter((request) => (request.proposals?.length ?? 0) === 0);
      const pendingConfirmation = orders.filter((order) => order.status === "aguardando_confirmacao");
      const disputes = orders.filter((order) => order.status === "em_disputa");
      const revenue = completedOrders.reduce((sum, order) => sum + Number(order.platform_fee ?? 0), 0);
      const gmv = completedOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
      const availableToWithdraw = wallet
        .filter((transaction) => transaction.status === "disponivel")
        .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
      const inGuarantee = wallet
        .filter((transaction) => ["pendente", "em_garantia", "congelado"].includes(transaction.status))
        .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentCompleted = completedOrders.filter((order) => new Date(order.created_at).getTime() >= cutoff);
      const dailyRevenue = recentCompleted.reduce((sum, order) => sum + Number(order.platform_fee ?? 0), 0) / 30;
      const dailyGmv = recentCompleted.reduce((sum, order) => sum + Number(order.total ?? 0), 0) / 30;
      const dailyOrders = recentCompleted.length / 30;

      const alerts: Alert[] = [];
      if (disputes.length) alerts.push({ title: `${disputes.length} disputa(s) aberta(s)`, description: "Há pedidos que exigem mediação ou reembolso.", tone: "danger", href: "/disputes" });
      if (pendingConfirmation.length) alerts.push({ title: `${pendingConfirmation.length} confirmação(ões) aguardando`, description: "Acompanhe serviços concluídos ainda sem aceite do cliente.", tone: "warning", href: "/orders" });
      if (noProposalRequests.length) alerts.push({ title: `${noProposalRequests.length} pedido(s) sem proposta`, description: "Pode indicar baixa cobertura, categoria ou raio de atendimento insuficiente.", tone: "warning", href: "/requests" });
      if (providers.filter((provider) => provider.verification_status === "pendente").length) alerts.push({ title: "Prestadores aguardando aprovação", description: "A verificação de documentos é um gargalo para ampliar a oferta.", tone: "info", href: "/providers" });
      if (!alerts.length) alerts.push({ title: "Operação sem alertas críticos", description: "Nenhuma disputa, fila sem proposta ou pendência prioritária agora.", tone: "info", href: "/orders" });

      return {
        totalUsers: profiles.length,
        totalProviders: providers.length,
        pendingProviders: providers.filter((provider) => provider.verification_status === "pendente").length,
        totalOrders: orders.length,
        openRequests: openRequests.length,
        openDisputes: disputes.length,
        revenue,
        gmv,
        conversionRate: requests.length ? (orders.length / requests.length) * 100 : 0,
        availableToWithdraw,
        inGuarantee,
        monthly,
        recentUsers: [...profiles].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
        alerts,
        projection: {
          next90Revenue: dailyRevenue * 90,
          next90Gmv: dailyGmv * 90,
          next90Orders: dailyOrders * 90,
          dailyRevenue,
        },
      };
    },
  });
}

function Kpi({ icon: Icon, label, value, detail, tint }: { icon: typeof Users; label: string; value: string; detail: string; tint: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}><Icon className="h-5 w-5" /></div></div></div>;
}

function LineChart({ values, color = "#146148" }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${88 - (value / max) * 70}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-44 w-full overflow-visible" aria-label="Gráfico de evolução"><path d="M0 90 H100" stroke="#e7e4dc" strokeWidth="1" vectorEffect="non-scaling-stroke" /><polyline fill="none" points={points} stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />{values.map((value, index) => <circle key={index} cx={(index / Math.max(values.length - 1, 1)) * 100} cy={88 - (value / max) * 70} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />)}</svg>;
}

function BarChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-44 items-end gap-3 pt-3">{values.map((value, index) => <div key={index} className="flex h-full flex-1 flex-col justify-end"><div className="rounded-t-md bg-primary/85 transition-all" style={{ height: `${Math.max((value / max) * 100, value ? 8 : 2)}%` }} title={`${value} pedidos`} /></div>)}</div>;
}

export function Dashboard() {
  const { data, isLoading, isFetching, refetch, error } = useDashboard();

  return <div className="mx-auto max-w-7xl p-4 md:p-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-trust">Central de operação</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Visão executiva</h1><p className="mt-1 text-sm text-muted-foreground">Receita, crescimento, saúde operacional e próximos riscos em um só lugar.</p></div><button onClick={() => refetch()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-card"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Atualizar</button></div>
    {isLoading && <p className="text-sm text-muted-foreground">Carregando indicadores...</p>}
    {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar todos os indicadores. Tente atualizar o painel.</div>}
    {data && <>
      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Kpi icon={CircleDollarSign} label="Receita realizada" value={currency.format(data.revenue)} detail="Taxas de pedidos concluídos" tint="bg-trust-soft text-trust" /><Kpi icon={BadgeDollarSign} label="GMV realizado" value={currency.format(data.gmv)} detail="Volume transacionado concluído" tint="bg-sky-100 text-sky-700" /><Kpi icon={Users} label="Base de usuários" value={number.format(data.totalUsers)} detail={`${number.format(data.totalProviders)} prestadores cadastrados`} tint="bg-violet-100 text-violet-700" /><Kpi icon={ChartNoAxesCombined} label="Conversão estimada" value={`${data.conversionRate.toFixed(1)}%`} detail="Pedidos em relação às solicitações" tint="bg-amber-100 text-amber-700" /></div>

      <div className="mb-7 grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Receita mensal</h2><p className="text-xs text-muted-foreground">Taxas da plataforma em pedidos concluídos</p></div><TrendingUp className="h-5 w-5 text-trust" /></div><LineChart values={data.monthly.map((point) => point.revenue)} /><div className="grid grid-cols-6 text-center text-xs text-muted-foreground">{data.monthly.map((point) => <span key={point.key}>{point.label}</span>)}</div></section>
        <section className="rounded-2xl border border-border bg-primary p-5 text-primary-foreground shadow-float"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] opacity-75">Projeção 90 dias</p><h2 className="mt-2 text-3xl font-extrabold">{currency.format(data.projection.next90Revenue)}</h2></div><TrendingUp className="h-9 w-9 opacity-80" /></div><p className="mt-3 text-sm opacity-90">Estimativa baseada na média diária dos últimos 30 dias.</p><div className="mt-5 space-y-2 border-t border-white/20 pt-4 text-sm"><div className="flex justify-between"><span>GMV projetado</span><strong>{currency.format(data.projection.next90Gmv)}</strong></div><div className="flex justify-between"><span>Pedidos projetados</span><strong>{data.projection.next90Orders.toFixed(0)}</strong></div><div className="flex justify-between"><span>Ritmo diário de taxa</span><strong>{currency.format(data.projection.dailyRevenue)}</strong></div></div></section></div>

      <div className="mb-7 grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Volume de pedidos</h2><p className="text-xs text-muted-foreground">Novos pedidos por mês</p></div><ClipboardList className="h-5 w-5 text-trust" /></div><BarChart values={data.monthly.map((point) => point.orders)} /><div className="grid grid-cols-6 text-center text-xs text-muted-foreground">{data.monthly.map((point) => <span key={point.key}>{point.label}</span>)}</div></section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card"><h2 className="font-bold">Carteira e garantia</h2><p className="mb-5 text-xs text-muted-foreground">Acompanhe obrigações financeiras da operação.</p><div className="space-y-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock3 className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-semibold">Em garantia</p><p className="text-xs text-muted-foreground">Valores ainda protegidos</p></div><strong>{currency.format(data.inGuarantee)}</strong></div><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><WalletCards className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-semibold">Disponível para saque</p><p className="text-xs text-muted-foreground">Saldo de prestadores</p></div><strong>{currency.format(data.availableToWithdraw)}</strong></div></div></section></div>

      <div className="grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Radar operacional</h2><p className="text-xs text-muted-foreground">Itens que merecem ação da equipe.</p></div><ShieldAlert className="h-5 w-5 text-warn" /></div><div className="space-y-3">{data.alerts.map((alert) => <a key={alert.title} href={alert.href} className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-secondary"><div className={`mt-0.5 rounded-lg p-1.5 ${alert.tone === "danger" ? "bg-destructive/10 text-destructive" : alert.tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{alert.tone === "danger" ? <AlertTriangle className="h-4 w-4" /> : alert.tone === "warning" ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="flex-1"><p className="text-sm font-semibold">{alert.title}</p><p className="text-xs text-muted-foreground">{alert.description}</p></div><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></a>)}</div></section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card"><h2 className="font-bold">Resumo da operação</h2><p className="mb-4 text-xs text-muted-foreground">Filas atuais que impactam a experiência.</p><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Solicitações abertas</span><strong>{data.openRequests}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Aprovações pendentes</span><strong>{data.pendingProviders}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Disputas abertas</span><strong className={data.openDisputes ? "text-destructive" : ""}>{data.openDisputes}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Pedidos totais</span><strong>{data.totalOrders}</strong></div></div><div className="mt-5 grid grid-cols-2 gap-2"><a href="/providers" className="rounded-lg bg-secondary px-3 py-2 text-center text-xs font-semibold"><UserCheck className="mr-1 inline h-3.5 w-3.5" />Prestadores</a><a href="/requests" className="rounded-lg bg-secondary px-3 py-2 text-center text-xs font-semibold"><BriefcaseBusiness className="mr-1 inline h-3.5 w-3.5" />Solicitações</a></div></section></div>
    </>}
  </div>;
}
