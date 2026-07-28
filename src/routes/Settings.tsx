import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPinned, Percent, Save, Trash2, Store, Plus, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/lib/admin-session";

type Provider = { profile_id: string; profiles: { full_name: string | null; email: string | null } | null };
type Override = { provider_id: string; service_fee_pct: number; provider_profiles: Provider | null };
type FeeTier = { id: string; min_amount: number; max_amount: number | null; fee_pct: number };
type FeeTierRow = { min_amount: string; max_amount: string; fee_pct: string };
type PaymentSettings = {
  payment_mode: "homologacao" | "sandbox" | "producao";
  payment_gateway: "mercado_pago";
  pix_enabled: boolean;
  card_enabled: boolean;
  customer_protection_fee_pct: number;
  customer_protection_fee_min: number;
  provider_guarantee_days: number;
  auto_completion_hours: number;
};
type SiteDistributionSettings = { app_store_url: string | null; google_play_url: string | null };
type LaunchRegion = { city: string; state: string };
type LaunchRegionSettings = {
  launch_regions_enabled: boolean;
  active_service_regions: LaunchRegion[];
};

function useFeeSettings() {
  return useQuery({
    queryKey: ["admin-fee-settings"],
    queryFn: async () => {
      const [{ data: setting, error: settingError }, paymentResult, siteResult, launchRegionResult, { data: providers, error: providersError }, { data: overrides, error: overridesError }, feeTierResult] = await Promise.all([
        supabase.from("platform_settings").select("default_service_fee_pct, customer_protection_fee_pct, customer_protection_fee_min, provider_guarantee_days, auto_completion_hours").eq("id", true).single(),
        supabase.from("platform_settings").select("payment_mode, payment_gateway, pix_enabled, card_enabled").eq("id", true).single<PaymentSettings>(),
        supabase.from("platform_settings").select("app_store_url, google_play_url").eq("id", true).single<SiteDistributionSettings>(),
        supabase.from("platform_settings").select("launch_regions_enabled, active_service_regions").eq("id", true).single<LaunchRegionSettings>(),
        supabase.from("provider_profiles").select("profile_id, profiles(full_name, email)").order("member_since", { ascending: false }).returns<Provider[]>(),
        supabase.from("provider_fee_overrides").select("provider_id, service_fee_pct, provider_profiles(profile_id, profiles(full_name, email))").returns<Override[]>(),
        supabase.from("fee_tiers").select("id, min_amount, max_amount, fee_pct").order("min_amount").returns<FeeTier[]>(),
      ]);
      if (settingError) throw settingError;
      if (providersError) throw providersError;
      if (overridesError) throw overridesError;
      const paymentSchemaPending = paymentResult.error?.code === "42703";
      const siteSchemaPending = siteResult.error?.code === "42703";
      const launchRegionSchemaPending = launchRegionResult.error?.code === "42703";
      const feeTierSchemaPending = feeTierResult.error?.code === "42P01";
      if (paymentResult.error && !paymentSchemaPending) throw paymentResult.error;
      if (siteResult.error && !siteSchemaPending) throw siteResult.error;
      if (launchRegionResult.error && !launchRegionSchemaPending) throw launchRegionResult.error;
      if (feeTierResult.error && !feeTierSchemaPending) throw feeTierResult.error;
      return { setting, paymentSettings: paymentResult.data, paymentSchemaPending, siteSettings: siteResult.data, siteSchemaPending, launchRegionSettings: launchRegionResult.data, launchRegionSchemaPending, providers: providers ?? [], overrides: overrides ?? [], feeTiers: feeTierResult.data ?? [], feeTierSchemaPending };
    },
  });
}

export function Settings() {
  const { session } = useAdminSession();
  const { data, isLoading } = useFeeSettings();
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState("");
  const [providerFee, setProviderFee] = useState("");
  const [paymentMode, setPaymentMode] = useState<"homologacao" | "sandbox" | "producao" | "">("");
  const [pixEnabled, setPixEnabled] = useState<boolean | null>(null);
  const [cardEnabled, setCardEnabled] = useState<boolean | null>(null);
  const [protectionFee, setProtectionFee] = useState("");
  const [protectionMin, setProtectionMin] = useState("");
  const [guaranteeDays, setGuaranteeDays] = useState("");
  const [completionHours, setCompletionHours] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [googlePlayUrl, setGooglePlayUrl] = useState("");
  const [launchRegionsEnabled, setLaunchRegionsEnabled] = useState<boolean | null>(null);
  const [launchRegionsText, setLaunchRegionsText] = useState("");
  const [tiers, setTiers] = useState<FeeTierRow[] | null>(null);
  const [simulateAmount, setSimulateAmount] = useState("");

  const displayedPaymentMode = paymentMode || data?.paymentSettings?.payment_mode || "homologacao";
  const displayedPixEnabled = pixEnabled ?? data?.paymentSettings?.pix_enabled ?? true;
  const displayedCardEnabled = cardEnabled ?? data?.paymentSettings?.card_enabled ?? true;
  const displayedProtectionFee = protectionFee || (data ? String(data.setting.customer_protection_fee_pct ?? data.setting.default_service_fee_pct) : "");
  const displayedProtectionMin = protectionMin || (data ? String(data.setting.customer_protection_fee_min ?? 0) : "");
  const displayedGuaranteeDays = guaranteeDays || (data ? String(data.setting.provider_guarantee_days ?? 7) : "7");
  const displayedCompletionHours = completionHours || (data ? String(data.setting.auto_completion_hours ?? 48) : "48");
  const displayedAppStoreUrl = appStoreUrl || data?.siteSettings?.app_store_url || "";
  const displayedGooglePlayUrl = googlePlayUrl || data?.siteSettings?.google_play_url || "";
  const displayedLaunchRegionsEnabled = launchRegionsEnabled ?? data?.launchRegionSettings?.launch_regions_enabled ?? false;
  const displayedLaunchRegionsText = launchRegionsText || (data?.launchRegionSettings?.active_service_regions ?? []).map((region) => `${region.city}, ${region.state}`).join("\n");
  const tierRows: FeeTierRow[] =
    tiers ?? (data?.feeTiers ?? []).map((t) => ({ min_amount: String(t.min_amount), max_amount: t.max_amount == null ? "" : String(t.max_amount), fee_pct: String(t.fee_pct) }));

  function updateTierRow(index: number, field: keyof FeeTierRow, value: string) {
    const next = tierRows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setTiers(next);
  }

  function addTierRow() {
    const last = tierRows[tierRows.length - 1];
    setTiers([...tierRows, { min_amount: last?.max_amount || "0", max_amount: "", fee_pct: "" }]);
  }

  function removeTierRow(index: number) {
    setTiers(tierRows.filter((_, i) => i !== index));
  }

  function simulateTieredFee(amount: number): number {
    let fee = 0;
    for (const row of [...tierRows].sort((a, b) => Number(a.min_amount) - Number(b.min_amount))) {
      const min = Number(row.min_amount);
      const max = row.max_amount === "" ? Infinity : Number(row.max_amount);
      const pct = Number(row.fee_pct);
      if (amount <= min) continue;
      const portion = Math.min(amount, max) - min;
      if (portion > 0) fee += Math.round(portion * pct) / 100;
    }
    return fee;
  }

  async function saveTiers() {
    const sorted = [...tierRows].sort((a, b) => Number(a.min_amount) - Number(b.min_amount));
    if (sorted.length === 0) return toast.error("Cadastre ao menos uma faixa.");
    if (Number(sorted[0].min_amount) !== 0) return toast.error("A primeira faixa deve começar em R$ 0.");
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i];
      const min = Number(row.min_amount);
      const pct = Number(row.fee_pct);
      if (Number.isNaN(min) || Number.isNaN(pct) || pct < 0 || pct > 100) return toast.error("Revise os valores das faixas (percentual entre 0 e 100).");
      const isLast = i === sorted.length - 1;
      if (isLast) {
        if (row.max_amount !== "") return toast.error("Só a última faixa pode ficar sem limite máximo.");
      } else {
        const max = Number(row.max_amount);
        if (row.max_amount === "" || Number.isNaN(max) || max <= min) return toast.error("Cada faixa (exceto a última) precisa de um limite máximo maior que o mínimo.");
        const next = sorted[i + 1];
        if (Number(next.min_amount) !== max) return toast.error("As faixas precisam ser contínuas: o mínimo de uma faixa deve ser igual ao máximo da anterior.");
      }
    }
    const { error: deleteError } = await supabase.from("fee_tiers").delete().gte("min_amount", 0);
    if (deleteError) return toast.error(deleteError.message);
    const { error: insertError } = await supabase.from("fee_tiers").insert(
      sorted.map((row) => ({
        min_amount: Number(row.min_amount),
        max_amount: row.max_amount === "" ? null : Number(row.max_amount),
        fee_pct: Number(row.fee_pct),
        updated_by: session?.user.id,
      })),
    );
    if (insertError) return toast.error(insertError.message);
    setTiers(null);
    toast.success("Faixas de taxa atualizadas.");
    queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  async function saveLaunchRegions() {
    if (data?.launchRegionSchemaPending) return toast.error("Execute a migration 0047_launch_regions.sql no Supabase antes de ativar regiões.");
    const lines = displayedLaunchRegionsText.split("\n").map((value) => value.trim()).filter(Boolean);
    const regions: LaunchRegion[] = [];
    for (const line of lines) {
      const [city, state, ...rest] = line.split(",").map((value) => value.trim());
      if (!city || !state || rest.length || state.length !== 2) return toast.error("Use uma cidade por linha no formato: Erechim, RS.");
      regions.push({ city, state: state.toUpperCase() });
    }
    if (displayedLaunchRegionsEnabled && regions.length === 0) return toast.error("Cadastre ao menos uma cidade antes de ativar o bloqueio regional.");
    const { error } = await supabase.from("platform_settings").update({
      launch_regions_enabled: displayedLaunchRegionsEnabled,
      active_service_regions: regions,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) return toast.error(error.message);
    setLaunchRegionsEnabled(null);
    setLaunchRegionsText("");
    toast.success(displayedLaunchRegionsEnabled ? "Regiões de lançamento atualizadas." : "Atendimento liberado para todas as regiões.");
    queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  async function saveStoreLinks() {
    if (data?.siteSchemaPending) return toast.error("Execute a migration 0045_site_distribution_settings.sql no Supabase antes de salvar os links.");
    const isValidUrl = (value: string) => !value || /^https:\/\/[^\s]+$/i.test(value);
    if (!isValidUrl(displayedAppStoreUrl) || !isValidUrl(displayedGooglePlayUrl)) return toast.error("Use links completos iniciando com https://.");
    const { error } = await supabase.from("platform_settings").update({
      app_store_url: displayedAppStoreUrl.trim() || null,
      google_play_url: displayedGooglePlayUrl.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) return toast.error(error.message);
    setAppStoreUrl("");
    setGooglePlayUrl("");
    toast.success("Links das lojas atualizados no site.");
    queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  async function saveProtectionSettings() {
    const fee = Number(displayedProtectionFee); const min = Number(displayedProtectionMin); const days = Number(displayedGuaranteeDays); const hours = Number(displayedCompletionHours);
    if ([fee, min, days, hours].some(Number.isNaN) || fee < 0 || fee > 100 || min < 0 || days < 0 || days > 90 || hours < 1 || hours > 720) return toast.error("Revise taxa, minimo, garantia e prazo de confirmacao.");
    const { error } = await supabase.from("platform_settings").update({ customer_protection_fee_pct: fee, customer_protection_fee_min: min, provider_guarantee_days: days, auto_completion_hours: hours, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) return toast.error(error.message);
    setProtectionFee(""); setProtectionMin(""); setGuaranteeDays(""); setCompletionHours("");
    toast.success("Protecao ao cliente atualizada."); queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  async function saveOverride() {
    const fee = Number(providerFee);
    if (!providerId || Number.isNaN(fee) || fee < 0 || fee > 100) return toast.error("Selecione o prestador e informe uma taxa entre 0 e 100%.");
    const { error } = await supabase.from("provider_fee_overrides").upsert({
      provider_id: providerId,
      service_fee_pct: fee,
      updated_at: new Date().toISOString(),
      updated_by: session?.user.id,
    });
    if (error) return toast.error(error.message);
    setProviderId("");
    setProviderFee("");
    toast.success("Taxa personalizada salva.");
    queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  async function removeOverride(id: string) {
    const { error } = await supabase.from("provider_fee_overrides").delete().eq("provider_id", id);
    if (error) return toast.error(error.message);
    toast.success("Prestador voltou a usar a taxa padrão.");
    queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  async function savePaymentSettings() {
    if (!displayedPixEnabled && !displayedCardEnabled) return toast.error("Ative Pix ou cartao para liberar o checkout.");
    const { error } = await supabase.from("platform_settings").update({
      payment_mode: displayedPaymentMode,
      payment_gateway: "mercado_pago",
      pix_enabled: displayedPixEnabled,
      card_enabled: displayedCardEnabled,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) return toast.error(error.message);
    setPaymentMode("");
    setPixEnabled(null);
    setCardEnabled(null);
    toast.success("Configuracao de pagamento atualizada.");
    queryClient.invalidateQueries({ queryKey: ["admin-fee-settings"] });
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-1">Configurações</h1>
      <p className="text-sm text-muted-foreground mb-6">Defina a taxa BICOJÁ cobrada em cada serviço.</p>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {data && <div className="space-y-6">
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1"><MapPinned className="h-5 w-5 text-primary" /><h2 className="font-bold">Regiões de lançamento</h2></div>
          <p className="text-xs text-muted-foreground mb-4"><strong>Esta é uma lista de liberação, não de bloqueio</strong>: você lista só as cidades onde JÁ quer atender (ex.: sua cidade-piloto). Ligando o controle, o banco passa a bloquear automaticamente todo o resto do mundo — você não precisa (e não deve) listar cidades pra bloquear.</p>
          {data.launchRegionSchemaPending ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Execute a migration <code>0047_launch_regions.sql</code> no Supabase para habilitar este controle.</div> : <>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={displayedLaunchRegionsEnabled} onChange={(event) => setLaunchRegionsEnabled(event.target.checked)} /> Atender SOMENTE as cidades liberadas abaixo (bloqueia todo o resto)</label>
            <label className="mt-4 block text-xs font-semibold">Cidades liberadas<textarea value={displayedLaunchRegionsText} onChange={(event) => setLaunchRegionsText(event.target.value)} placeholder={"Erechim, RS\nPasso Fundo, RS"} rows={4} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /></label>
            <p className="mt-2 text-[11px] text-muted-foreground">Uma por linha, sempre no formato <strong>Cidade, UF</strong>. Com o controle desligado, qualquer cidade é aceita.</p>
            <button onClick={saveLaunchRegions} className="mt-4 h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Save className="h-4 w-4" />Salvar regiões</button>
          </>}
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1"><Store className="h-5 w-5 text-primary" /><h2 className="font-bold">Links para baixar o app</h2></div>
          <p className="text-xs text-muted-foreground mb-4">O site institucional libera cada botão automaticamente apenas quando o respectivo link for informado.</p>
          {data.siteSchemaPending ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Execute a migration <code>0045_site_distribution_settings.sql</code> no Supabase para habilitar esta configuração.</div> : <>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Apple App Store<input value={displayedAppStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} type="url" placeholder="https://apps.apple.com/..." className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
              <label className="text-xs font-semibold">Google Play<input value={displayedGooglePlayUrl} onChange={(e) => setGooglePlayUrl(e.target.value)} type="url" placeholder="https://play.google.com/..." className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
            </div>
            <button onClick={saveStoreLinks} className="mt-4 h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Save className="h-4 w-4" />Salvar links das lojas</button>
          </>}
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1"><Percent className="h-5 w-5 text-primary" /><h2 className="font-bold">Taxa BICOJÁ e garantia</h2></div>
          <p className="text-xs text-muted-foreground mb-4">Esta taxa só é usada como fallback: se houver faixas degressivas cadastradas abaixo, elas têm prioridade (a menos que o prestador tenha uma taxa personalizada). O valor do serviço fica indisponível para saque durante a garantia.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs font-semibold">Taxa ao cliente (%)<input value={displayedProtectionFee} onChange={(e) => setProtectionFee(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Taxa minima (R$)<input value={displayedProtectionMin} onChange={(e) => setProtectionMin(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Garantia (dias)<input value={displayedGuaranteeDays} onChange={(e) => setGuaranteeDays(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Confirmacao automatica (h)<input value={displayedCompletionHours} onChange={(e) => setCompletionHours(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
          </div>
          <button onClick={saveProtectionSettings} className="mt-4 h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Save className="h-4 w-4" />Salvar protecao</button>
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-1"><Layers className="h-5 w-5 text-primary" /><h2 className="font-bold">Faixas de taxa degressiva</h2></div>
          <p className="text-xs text-muted-foreground mb-4">Taxa progressiva por faixas, igual imposto de renda: cada faixa se aplica só à parte do valor dentro dela, nunca ao orçamento inteiro. Assim um orçamento maior nunca paga uma taxa menor que um menor. Deixe vazio para usar a taxa fixa acima.</p>
          {data.feeTierSchemaPending ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Execute a migration <code>0061_tiered_platform_fee.sql</code> no Supabase para habilitar esta configuração.</div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 text-[11px] font-semibold text-muted-foreground px-1">
                  <span>De (R$)</span><span>Até (R$)</span><span>Taxa (%)</span><span />
                </div>
                {tierRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 items-center">
                    <input value={row.min_amount} onChange={(e) => updateTierRow(i, "min_amount", e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
                    <input value={row.max_amount} onChange={(e) => updateTierRow(i, "max_amount", e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="sem limite" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
                    <input value={row.fee_pct} onChange={(e) => updateTierRow(i, "fee_pct", e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
                    <button onClick={() => removeTierRow(i)} title="Remover faixa" className="h-9 w-9 rounded-lg text-destructive hover:bg-destructive/10 flex items-center justify-center"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button onClick={addTierRow} className="h-10 px-3 rounded-xl border border-border text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" />Adicionar faixa</button>
                <button onClick={saveTiers} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Save className="h-4 w-4" />Salvar faixas</button>
              </div>
              <div className="mt-5 pt-4 border-t border-border">
                <label className="text-xs font-semibold">Simular orçamento (R$)
                  <input value={simulateAmount} onChange={(e) => setSimulateAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="2900" className="mt-1 h-11 w-full sm:w-48 rounded-xl border border-border bg-background px-3 text-sm" />
                </label>
                {simulateAmount && !Number.isNaN(Number(simulateAmount)) && (
                  <p className="mt-2 text-sm">
                    Taxa BICOJÁ: <strong className="text-primary">R$ {simulateTieredFee(Number(simulateAmount)).toFixed(2)}</strong>{" "}
                    <span className="text-muted-foreground">({((simulateTieredFee(Number(simulateAmount)) / Number(simulateAmount)) * 100 || 0).toFixed(1)}% efetivo)</span>
                  </p>
                )}
              </div>
            </>
          )}
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
          <h2 className="font-bold mb-1">Checkout e ambiente de pagamento</h2>
          <p className="text-xs text-muted-foreground mb-4">Mercado Pago e o gateway preparado para o MVP. As credenciais ficam protegidas no Supabase, nunca neste painel.</p>
          {data.paymentSchemaPending ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">A configuracao de pagamento ainda nao foi criada no banco. Execute a migration <code>0033_payment_gateway_configuration.sql</code> no Supabase para habilitar este painel.</div> : <>
          <div className="grid md:grid-cols-3 gap-3">
            {(["homologacao", "sandbox", "producao"] as const).map((mode) => <label key={mode} className={`cursor-pointer rounded-xl border p-3 ${displayedPaymentMode === mode ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="payment-mode" value={mode} checked={displayedPaymentMode === mode} onChange={() => setPaymentMode(mode)} className="mr-2" /><span className="font-semibold text-sm">{mode === "homologacao" ? "Homologacao" : mode === "sandbox" ? "Sandbox" : "Producao"}</span><p className="text-[11px] text-muted-foreground mt-1">{mode === "homologacao" ? "Aprova o pagamento simulado no app." : mode === "sandbox" ? "Usa contas e pagamentos de teste." : "Cobra pagamentos reais."}</p></label>)}
          </div>
          <div className="flex flex-wrap gap-5 mt-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={displayedPixEnabled} onChange={(e) => setPixEnabled(e.target.checked)} /> Pix habilitado</label><label className="flex items-center gap-2"><input type="checkbox" checked={displayedCardEnabled} onChange={(e) => setCardEnabled(e.target.checked)} /> Cartao habilitado</label></div>
          <button onClick={savePaymentSettings} className="mt-5 h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"><Save className="h-4 w-4" />Salvar configuracao de pagamento</button>
          </>}
        </section>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card">
          <h2 className="font-bold mb-1">Taxa por prestador</h2>
          <p className="text-xs text-muted-foreground mb-4">Substitui a taxa padrão somente para esse prestador.</p>
          <div className="grid md:grid-cols-[1fr_150px_auto] gap-2 mb-5"><select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="">Selecione um prestador</option>{data.providers.map((provider) => <option key={provider.profile_id} value={provider.profile_id}>{provider.profiles?.full_name ?? provider.profiles?.email ?? "Prestador"}</option>)}</select><input value={providerFee} onChange={(e) => setProviderFee(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Taxa (%)" inputMode="decimal" className="h-11 rounded-xl border border-border bg-background px-3" /><button onClick={saveOverride} className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Aplicar</button></div>
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">{data.overrides.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma taxa personalizada configurada.</p> : data.overrides.map((override) => <div key={override.provider_id} className="p-3 flex items-center justify-between"><div><p className="text-sm font-semibold">{override.provider_profiles?.profiles?.full_name ?? override.provider_profiles?.profiles?.email ?? "Prestador"}</p><p className="text-xs text-muted-foreground">Taxa personalizada</p></div><div className="flex items-center gap-3"><span className="font-bold text-primary">{Number(override.service_fee_pct).toFixed(2)}%</span><button onClick={() => removeOverride(override.provider_id)} title="Remover taxa personalizada" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 flex items-center justify-center"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
        </section>
      </div>}
    </div>
  );
}
