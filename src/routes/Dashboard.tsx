import { useMemo, useState } from "react";
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
  Filter,
  Layers,
  RefreshCw,
  ShieldAlert,
  Trophy,
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
  price: number | null;
  request_id: string | null;
  provider_id: string | null;
  created_at: string;
};

type ProfileRow = { id: string; created_at: string };
type ProviderRow = {
  profile_id: string;
  verification_status: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  profiles: { full_name: string | null } | null;
};
type RequestRow = { id: string; status: string; created_at: string; proposals: { id: string }[] | null };
type ProposalRow = {
  provider_id: string;
  status: string;
  created_at: string;
  service_requests: { created_at: string } | null;
};
type WalletRow = { status: string; amount: number | null };
type FeeTier = { min_amount: number; max_amount: number | null; fee_pct: number };

type TrendPoint = { key: string; label: string; revenue: number; orders: number };
type Alert = { title: string; description: string; tone: "danger" | "warning" | "info"; href: string };
type TierBucket = { label: string; orders: number; gmv: number; revenue: number };
type ProviderRank = {
  providerId: string;
  name: string;
  ratingAvg: number;
  ratingCount: number;
  completedOrders: number;
  revenue: number;
  avgResponseMinutes: number | null;
  acceptanceRate: number | null;
};
type Funnel = { totalRequests: number; withProposal: number; hired: number; completed: number };

type DashboardData = {
  totalUsers: number;
  totalProviders: number;
  pendingProviders: number;
  totalOrders: number;
  openRequests: number;
  openDisputes: number;
  revenue: number;
  gmv: number;
  completedCount: number;
  conversionRate: number;
  availableToWithdraw: number;
  inGuarantee: number;
  trend: TrendPoint[];
  alerts: Alert[];
  projection: { next90Revenue: number; next90Gmv: number; next90Orders: number; dailyRevenue: number };
  tierBuckets: TierBucket[];
  ticketMedio: number;
  taxaEfetivaMedia: number;
  providerRanking: ProviderRank[];
  funnel: Funnel;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

type Period = "today" | "7d" | "30d" | "90d" | "custom";
type Granularity = "hour" | "day" | "week" | "month";

function periodRange(period: Period, customFrom: string, customTo: string): { since: Date; until: Date; label: string } {
  const now = new Date();
  if (period === "today") {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    return { since, until: now, label: "Hoje" };
  }
  if (period === "7d") return { since: new Date(now.getTime() - 7 * 86400000), until: now, label: "Últimos 7 dias" };
  if (period === "30d") return { since: new Date(now.getTime() - 30 * 86400000), until: now, label: "Últimos 30 dias" };
  if (period === "90d") return { since: new Date(now.getTime() - 90 * 86400000), until: now, label: "Últimos 90 dias" };
  const since = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(now.getTime() - 30 * 86400000);
  const untilRaw = customTo ? new Date(`${customTo}T23:59:59`) : now;
  const until = untilRaw > now ? now : untilRaw;
  return { since, until, label: "Período personalizado" };
}

function pickGranularity(since: Date, until: Date): Granularity {
  const days = (until.getTime() - since.getTime()) / 86400000;
  if (days <= 1.5) return "hour";
  if (days <= 31) return "day";
  if (days <= 210) return "week";
  return "month";
}

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === "hour") return date.toISOString().slice(0, 13);
  if (granularity === "day") return date.toISOString().slice(0, 10);
  if (granularity === "week") {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "hour") return `${Number(key.slice(11, 13))}h`;
  if (granularity === "day" || granularity === "week") {
    return new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function buildBuckets(since: Date, until: Date, granularity: Granularity): TrendPoint[] {
  const points: TrendPoint[] = [];
  const cursor = new Date(since);
  let guard = 0;
  while (cursor <= until && guard < 400) {
    const key = bucketKey(cursor, granularity);
    if (!points.some((p) => p.key === key)) points.push({ key, label: bucketLabel(key, granularity), revenue: 0, orders: 0 });
    if (granularity === "hour") cursor.setHours(cursor.getHours() + 1);
    else if (granularity === "day") cursor.setDate(cursor.getDate() + 1);
    else if (granularity === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
    guard++;
  }
  return points;
}

function tierBucketFor(price: number, tiers: FeeTier[]): string {
  for (const tier of tiers) {
    if (price >= tier.min_amount && (tier.max_amount == null || price < tier.max_amount)) {
      return tier.max_amount == null
        ? `Acima de ${currency.format(tier.min_amount)}`
        : `${currency.format(tier.min_amount)} – ${currency.format(tier.max_amount)}`;
    }
  }
  const last = tiers[tiers.length - 1];
  return last ? `Acima de ${currency.format(last.min_amount)}` : "Sem faixa";
}

function useDashboard(range: { since: Date; until: Date }) {
  return useQuery({
    queryKey: ["admin-dashboard-v3", range.since.toISOString(), range.until.toISOString()],
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardData> => {
      const [profilesResult, providersResult, ordersResult, requestsResult, proposalsResult, walletResult, tiersResult] =
        await Promise.all([
          supabase.from("profiles").select("id, created_at").returns<ProfileRow[]>(),
          supabase
            .from("provider_profiles")
            .select("profile_id, verification_status, rating_avg, rating_count, profiles(full_name)")
            .returns<ProviderRow[]>(),
          supabase
            .from("orders")
            .select("id, status, total, platform_fee, price, request_id, provider_id, created_at")
            .returns<OrderRow[]>(),
          supabase.from("service_requests").select("id, status, created_at, proposals(id)").returns<RequestRow[]>(),
          supabase
            .from("proposals")
            .select("provider_id, status, created_at, service_requests(created_at)")
            .returns<ProposalRow[]>(),
          supabase.from("wallet_transactions").select("status, amount").returns<WalletRow[]>(),
          supabase.from("fee_tiers").select("min_amount, max_amount, fee_pct").order("min_amount").returns<FeeTier[]>(),
        ]);

      const firstError = [profilesResult.error, providersResult.error, ordersResult.error, requestsResult.error, proposalsResult.error, walletResult.error].find(Boolean);
      if (firstError) throw firstError;
      if (tiersResult.error && tiersResult.error.code !== "42P01") throw tiersResult.error;

      const profiles = profilesResult.data ?? [];
      const providers = providersResult.data ?? [];
      const orders = ordersResult.data ?? [];
      const requests = requestsResult.data ?? [];
      const proposals = proposalsResult.data ?? [];
      const wallet = walletResult.data ?? [];
      const tiers = tiersResult.data ?? [];

      const since = range.since.getTime();
      const until = range.until.getTime();
      const inRange = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= since && t <= until;
      };

      const ordersInPeriod = orders.filter((o) => inRange(o.created_at));
      const completedInPeriod = ordersInPeriod.filter((o) => o.status === "concluido");
      const requestsInPeriod = requests.filter((r) => inRange(r.created_at));
      const proposalsInPeriod = proposals.filter((p) => inRange(p.created_at));

      const revenue = completedInPeriod.reduce((sum, o) => sum + Number(o.platform_fee ?? 0), 0);
      const gmv = completedInPeriod.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
      const grossServiceValue = completedInPeriod.reduce((sum, o) => sum + Number(o.price ?? 0), 0);

      // --- Tendência (gráficos) ---
      const granularity = pickGranularity(range.since, range.until);
      const trend = buildBuckets(range.since, range.until, granularity);
      const trendByKey = new Map(trend.map((p) => [p.key, p]));
      for (const order of ordersInPeriod) {
        const point = trendByKey.get(bucketKey(new Date(order.created_at), granularity));
        if (!point) continue;
        point.orders++;
        if (order.status === "concluido") point.revenue += Number(order.platform_fee ?? 0);
      }

      // --- Detalhamento financeiro por faixa de taxa ---
      const bucketMap = new Map<string, TierBucket>();
      for (const order of completedInPeriod) {
        const label = tiers.length ? tierBucketFor(Number(order.price ?? 0), tiers) : "Sem faixas cadastradas";
        const bucket = bucketMap.get(label) ?? { label, orders: 0, gmv: 0, revenue: 0 };
        bucket.orders++;
        bucket.gmv += Number(order.price ?? 0);
        bucket.revenue += Number(order.platform_fee ?? 0);
        bucketMap.set(label, bucket);
      }
      const tierBuckets = [...bucketMap.values()].sort((a, b) => b.revenue - a.revenue);
      const ticketMedio = completedInPeriod.length ? gmv / completedInPeriod.length : 0;
      const taxaEfetivaMedia = grossServiceValue ? (revenue / grossServiceValue) * 100 : 0;

      // --- Funil de conversão (coorte de solicitações no período) ---
      const periodRequestIds = new Set(requestsInPeriod.map((r) => r.id));
      const funnel: Funnel = {
        totalRequests: requestsInPeriod.length,
        withProposal: requestsInPeriod.filter((r) => (r.proposals?.length ?? 0) > 0).length,
        hired: requestsInPeriod.filter((r) => r.status === "contratado").length,
        completed: orders.filter((o) => o.request_id && periodRequestIds.has(o.request_id) && o.status === "concluido").length,
      };

      // --- Ranking de prestadores ---
      const rankMap = new Map<string, { completedOrders: number; revenue: number; totalProposals: number; accepted: number; responseMinutesSum: number; responseSamples: number }>();
      function ensure(providerId: string) {
        let entry = rankMap.get(providerId);
        if (!entry) {
          entry = { completedOrders: 0, revenue: 0, totalProposals: 0, accepted: 0, responseMinutesSum: 0, responseSamples: 0 };
          rankMap.set(providerId, entry);
        }
        return entry;
      }
      for (const order of completedInPeriod) {
        if (!order.provider_id) continue;
        const entry = ensure(order.provider_id);
        entry.completedOrders++;
        entry.revenue += Number(order.platform_fee ?? 0);
      }
      for (const proposal of proposalsInPeriod) {
        const entry = ensure(proposal.provider_id);
        entry.totalProposals++;
        if (proposal.status === "aceita") entry.accepted++;
        if (proposal.service_requests?.created_at) {
          const minutes = (new Date(proposal.created_at).getTime() - new Date(proposal.service_requests.created_at).getTime()) / 60000;
          if (minutes >= 0) {
            entry.responseMinutesSum += minutes;
            entry.responseSamples++;
          }
        }
      }
      const providerById = new Map(providers.map((p) => [p.profile_id, p]));
      const providerRanking: ProviderRank[] = [...rankMap.entries()]
        .map(([providerId, entry]) => {
          const provider = providerById.get(providerId);
          return {
            providerId,
            name: provider?.profiles?.full_name ?? "Prestador",
            ratingAvg: Number(provider?.rating_avg ?? 0),
            ratingCount: provider?.rating_count ?? 0,
            completedOrders: entry.completedOrders,
            revenue: entry.revenue,
            avgResponseMinutes: entry.responseSamples ? entry.responseMinutesSum / entry.responseSamples : null,
            acceptanceRate: entry.totalProposals ? (entry.accepted / entry.totalProposals) * 100 : null,
          };
        })
        .sort((a, b) => b.revenue - a.revenue || b.completedOrders - a.completedOrders)
        .slice(0, 8);

      // --- Métricas de estado atual (não dependem do período) ---
      const openRequests = requests.filter((request) => ["aberto", "em_negociacao"].includes(request.status));
      const noProposalRequests = openRequests.filter((request) => (request.proposals?.length ?? 0) === 0);
      const pendingConfirmation = orders.filter((order) => order.status === "aguardando_confirmacao");
      const disputes = orders.filter((order) => order.status === "em_disputa");
      const availableToWithdraw = wallet.filter((t) => t.status === "disponivel").reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
      const inGuarantee = wallet.filter((t) => ["pendente", "em_garantia", "congelado"].includes(t.status)).reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

      // --- Projeção: sempre baseada nos últimos 30 dias corridos, independente do período selecionado ---
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentCompleted = orders.filter((o) => o.status === "concluido" && new Date(o.created_at).getTime() >= cutoff);
      const dailyRevenue = recentCompleted.reduce((sum, o) => sum + Number(o.platform_fee ?? 0), 0) / 30;
      const dailyGmv = recentCompleted.reduce((sum, o) => sum + Number(o.total ?? 0), 0) / 30;
      const dailyOrders = recentCompleted.length / 30;

      const alerts: Alert[] = [];
      if (disputes.length) alerts.push({ title: `${disputes.length} disputa(s) aberta(s)`, description: "Há pedidos que exigem mediação ou reembolso.", tone: "danger", href: "/disputes" });
      if (pendingConfirmation.length) alerts.push({ title: `${pendingConfirmation.length} confirmação(ões) aguardando`, description: "Acompanhe serviços concluídos ainda sem aceite do cliente.", tone: "warning", href: "/orders" });
      if (noProposalRequests.length) alerts.push({ title: `${noProposalRequests.length} pedido(s) sem proposta`, description: "Pode indicar baixa cobertura, categoria ou raio de atendimento insuficiente.", tone: "warning", href: "/requests" });
      if (providers.filter((p) => p.verification_status === "pendente").length) alerts.push({ title: "Prestadores aguardando aprovação", description: "A verificação de documentos é um gargalo para ampliar a oferta.", tone: "info", href: "/providers" });
      if (!alerts.length) alerts.push({ title: "Operação sem alertas críticos", description: "Nenhuma disputa, fila sem proposta ou pendência prioritária agora.", tone: "info", href: "/orders" });

      return {
        totalUsers: profiles.length,
        totalProviders: providers.length,
        pendingProviders: providers.filter((p) => p.verification_status === "pendente").length,
        totalOrders: orders.length,
        openRequests: openRequests.length,
        openDisputes: disputes.length,
        revenue,
        gmv,
        completedCount: completedInPeriod.length,
        conversionRate: requestsInPeriod.length ? (ordersInPeriod.length / requestsInPeriod.length) * 100 : 0,
        availableToWithdraw,
        inGuarantee,
        trend,
        alerts,
        projection: { next90Revenue: dailyRevenue * 90, next90Gmv: dailyGmv * 90, next90Orders: dailyOrders * 90, dailyRevenue },
        tierBuckets,
        ticketMedio,
        taxaEfetivaMedia,
        providerRanking,
        funnel,
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
  return <div className="flex h-44 items-end gap-1.5 pt-3">{values.map((value, index) => <div key={index} className="flex h-full flex-1 flex-col justify-end"><div className="rounded-t-md bg-primary/85 transition-all" style={{ height: `${Math.max((value / max) * 100, value ? 8 : 2)}%` }} title={`${value} pedidos`} /></div>)}</div>;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
];

export function Dashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const { data, isLoading, isFetching, refetch, error } = useDashboard(range);

  return <div className="mx-auto max-w-7xl p-4 md:p-8">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-trust">Central de operação</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Visão executiva</h1><p className="mt-1 text-sm text-muted-foreground">Receita, crescimento, saúde operacional e próximos riscos em um só lugar.</p></div>
      <button onClick={() => refetch()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-card"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Atualizar</button>
    </div>

    <div className="mb-7 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
      <Filter className="ml-1 h-4 w-4 text-muted-foreground shrink-0" />
      {PERIOD_OPTIONS.map((opt) => (
        <button key={opt.value} onClick={() => setPeriod(opt.value)} className={`h-9 rounded-xl px-3 text-sm font-semibold transition-colors ${period === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
          {opt.label}
        </button>
      ))}
      {period === "custom" && (
        <div className="flex items-center gap-2 pl-1">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-2 text-sm" />
          <span className="text-xs text-muted-foreground">até</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-2 text-sm" />
        </div>
      )}
      <span className="ml-auto pr-1 text-xs text-muted-foreground">{range.since.toLocaleDateString("pt-BR")} — {range.until.toLocaleDateString("pt-BR")}</span>
    </div>

    {isLoading && <p className="text-sm text-muted-foreground">Carregando indicadores...</p>}
    {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar todos os indicadores. Tente atualizar o painel.</div>}
    {data && <>
      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={CircleDollarSign} label={`Receita — ${range.label}`} value={currency.format(data.revenue)} detail="Taxas de pedidos concluídos no período" tint="bg-trust-soft text-trust" />
        <Kpi icon={BadgeDollarSign} label={`GMV — ${range.label}`} value={currency.format(data.gmv)} detail="Volume transacionado concluído no período" tint="bg-sky-100 text-sky-700" />
        <Kpi icon={ClipboardList} label={`Pedidos concluídos — ${range.label}`} value={number.format(data.completedCount)} detail="Serviços finalizados no período" tint="bg-violet-100 text-violet-700" />
        <Kpi icon={ChartNoAxesCombined} label={`Conversão — ${range.label}`} value={`${data.conversionRate.toFixed(1)}%`} detail="Pedidos em relação às solicitações do período" tint="bg-amber-100 text-amber-700" />
      </div>

      <div className="mb-7 grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Evolução de receita</h2><p className="text-xs text-muted-foreground">Taxas da plataforma em pedidos concluídos, no período selecionado</p></div><TrendingUp className="h-5 w-5 text-trust" /></div><LineChart values={data.trend.map((p) => p.revenue)} /><div className="grid text-center text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${data.trend.length}, minmax(0, 1fr))` }}>{data.trend.map((p) => <span key={p.key} className="truncate">{p.label}</span>)}</div></section>
        <section className="rounded-2xl border border-border bg-primary p-5 text-primary-foreground shadow-float"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] opacity-75">Projeção 90 dias</p><h2 className="mt-2 text-3xl font-extrabold">{currency.format(data.projection.next90Revenue)}</h2></div><TrendingUp className="h-9 w-9 opacity-80" /></div><p className="mt-3 text-sm opacity-90">Estimativa baseada na média diária dos últimos 30 dias corridos (não muda com o filtro de período acima).</p><div className="mt-5 space-y-2 border-t border-white/20 pt-4 text-sm"><div className="flex justify-between"><span>GMV projetado</span><strong>{currency.format(data.projection.next90Gmv)}</strong></div><div className="flex justify-between"><span>Pedidos projetados</span><strong>{data.projection.next90Orders.toFixed(0)}</strong></div><div className="flex justify-between"><span>Ritmo diário de taxa</span><strong>{currency.format(data.projection.dailyRevenue)}</strong></div></div></section>
      </div>

      <div className="mb-7 grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Volume de pedidos</h2><p className="text-xs text-muted-foreground">Novos pedidos no período selecionado</p></div><ClipboardList className="h-5 w-5 text-trust" /></div><BarChart values={data.trend.map((p) => p.orders)} /><div className="grid text-center text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${data.trend.length}, minmax(0, 1fr))` }}>{data.trend.map((p) => <span key={p.key} className="truncate">{p.label}</span>)}</div></section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card"><h2 className="font-bold">Carteira e garantia</h2><p className="mb-5 text-xs text-muted-foreground">Estado atual — não muda com o filtro de período.</p><div className="space-y-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock3 className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-semibold">Em garantia</p><p className="text-xs text-muted-foreground">Valores ainda protegidos</p></div><strong>{currency.format(data.inGuarantee)}</strong></div><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><WalletCards className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-semibold">Disponível para saque</p><p className="text-xs text-muted-foreground">Saldo de prestadores</p></div><strong>{currency.format(data.availableToWithdraw)}</strong></div></div></section>
      </div>

      <div className="mb-7 grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Detalhamento financeiro por faixa de taxa</h2><p className="text-xs text-muted-foreground">Em qual faixa (das faixas degressivas atuais) fica o valor de cada pedido concluído no período</p></div><Layers className="h-5 w-5 text-trust" /></div>
          {data.tierBuckets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido concluído no período selecionado.</p>
          ) : (
            <div className="space-y-2">
              {data.tierBuckets.map((bucket) => {
                const maxRevenue = Math.max(...data.tierBuckets.map((b) => b.revenue), 1);
                return (
                  <div key={bucket.label} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between text-sm"><span className="font-semibold">{bucket.label}</span><span className="text-muted-foreground">{bucket.orders} pedido(s)</span></div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((bucket.revenue / maxRevenue) * 100, 3)}%` }} /></div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground"><span>Valor de serviços: {currency.format(bucket.gmv)}</span><strong className="text-foreground">Receita: {currency.format(bucket.revenue)}</strong></div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm"><div><p className="text-xs text-muted-foreground">Ticket médio (valor do serviço)</p><p className="font-bold">{currency.format(data.ticketMedio)}</p></div><div><p className="text-xs text-muted-foreground">Taxa efetiva média cobrada</p><p className="font-bold">{data.taxaEfetivaMedia.toFixed(1)}%</p></div></div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Funil de conversão</h2><ArrowUpRight className="h-5 w-5 text-trust" /></div>
          <p className="mb-4 text-xs text-muted-foreground">Solicitações abertas no período e o que aconteceu com elas.</p>
          {[
            { label: "Solicitações", value: data.funnel.totalRequests },
            { label: "Com proposta", value: data.funnel.withProposal },
            { label: "Viraram pedido", value: data.funnel.hired },
            { label: "Concluídos", value: data.funnel.completed },
          ].map((step, index, arr) => {
            const base = arr[0].value || 1;
            const pct = (step.value / base) * 100;
            return (
              <div key={step.label} className="mb-3">
                <div className="flex items-center justify-between text-xs"><span className="font-semibold text-muted-foreground">{step.label}</span><span className="font-bold">{step.value} {index > 0 && `(${pct.toFixed(0)}%)`}</span></div>
                <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-trust transition-all" style={{ width: `${Math.max(pct, step.value ? 4 : 0)}%` }} /></div>
              </div>
            );
          })}
        </section>
      </div>

      <div className="mb-7 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Desempenho de prestadores</h2><p className="text-xs text-muted-foreground">Top prestadores por receita gerada no período selecionado</p></div><Trophy className="h-5 w-5 text-trust" /></div>
        {data.providerRanking.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma proposta ou pedido concluído de prestadores no período selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-semibold">Prestador</th><th className="pb-2 font-semibold">Avaliação</th><th className="pb-2 font-semibold">Pedidos concluídos</th><th className="pb-2 font-semibold">Receita gerada</th><th className="pb-2 font-semibold">Tempo médio de resposta</th><th className="pb-2 font-semibold">Taxa de aceite</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.providerRanking.map((p, index) => (
                  <tr key={p.providerId}>
                    <td className="py-2.5 pr-3"><span className="mr-2 text-xs text-muted-foreground">#{index + 1}</span><span className="font-semibold">{p.name}</span></td>
                    <td className="py-2.5 pr-3">{p.ratingCount ? `${p.ratingAvg.toFixed(1)} ★ (${p.ratingCount})` : "—"}</td>
                    <td className="py-2.5 pr-3">{p.completedOrders}</td>
                    <td className="py-2.5 pr-3 font-semibold">{currency.format(p.revenue)}</td>
                    <td className="py-2.5 pr-3">{p.avgResponseMinutes == null ? "—" : p.avgResponseMinutes < 60 ? `${p.avgResponseMinutes.toFixed(0)} min` : `${(p.avgResponseMinutes / 60).toFixed(1)} h`}</td>
                    <td className="py-2.5 pr-3">{p.acceptanceRate == null ? "—" : `${p.acceptanceRate.toFixed(0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Radar operacional</h2><p className="text-xs text-muted-foreground">Itens que merecem ação da equipe (estado atual).</p></div><ShieldAlert className="h-5 w-5 text-warn" /></div><div className="space-y-3">{data.alerts.map((alert) => <a key={alert.title} href={alert.href} className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-secondary"><div className={`mt-0.5 rounded-lg p-1.5 ${alert.tone === "danger" ? "bg-destructive/10 text-destructive" : alert.tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{alert.tone === "danger" ? <AlertTriangle className="h-4 w-4" /> : alert.tone === "warning" ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="flex-1"><p className="text-sm font-semibold">{alert.title}</p><p className="text-xs text-muted-foreground">{alert.description}</p></div><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></a>)}</div></section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card"><h2 className="font-bold">Resumo da operação</h2><p className="mb-4 text-xs text-muted-foreground">Estado atual — não muda com o filtro de período.</p><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Usuários cadastrados</span><strong>{number.format(data.totalUsers)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Prestadores cadastrados</span><strong>{number.format(data.totalProviders)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Solicitações abertas</span><strong>{data.openRequests}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Aprovações pendentes</span><strong>{data.pendingProviders}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Disputas abertas</span><strong className={data.openDisputes ? "text-destructive" : ""}>{data.openDisputes}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Pedidos totais</span><strong>{data.totalOrders}</strong></div></div><div className="mt-5 grid grid-cols-2 gap-2"><a href="/providers" className="rounded-lg bg-secondary px-3 py-2 text-center text-xs font-semibold"><UserCheck className="mr-1 inline h-3.5 w-3.5" />Prestadores</a><a href="/requests" className="rounded-lg bg-secondary px-3 py-2 text-center text-xs font-semibold"><BriefcaseBusiness className="mr-1 inline h-3.5 w-3.5" />Solicitações</a></div></section>
      </div>
    </>}
  </div>;
}
