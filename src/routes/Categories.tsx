import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Zap,
  Wrench,
  PaintRoller,
  Paintbrush,
  Hammer,
  HardHat,
  Building,
  Sprout,
  Trees,
  Sparkles,
  Brush,
  SprayCan,
  Bug,
  Key,
  KeyRound,
  Lock,
  ShieldCheck,
  Camera,
  Home,
  Truck,
  Fan,
  Wind,
  Thermometer,
  Refrigerator,
  WashingMachine,
  Sofa,
  Drill,
  Ruler,
  Droplets,
  Flame,
  Wifi,
  Tv,
  Plug,
  DoorClosed,
  Fence,
  Warehouse,
  Car,
  Dog,
  Scissors,
  Package,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// Mesmo conjunto de ícones disponível pro cliente ver em categories.ts do
// bicoja-home -- precisa ficar sincronizado manualmente entre os dois
// repositórios, já que são projetos separados.
const ICON_OPTIONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: "Zap", icon: Zap, label: "Elétrica" },
  { name: "Plug", icon: Plug, label: "Instalação elétrica" },
  { name: "Wrench", icon: Wrench, label: "Encanamento/Geral" },
  { name: "Droplets", icon: Droplets, label: "Hidráulica" },
  { name: "PaintRoller", icon: PaintRoller, label: "Pintura (rolo)" },
  { name: "Paintbrush", icon: Paintbrush, label: "Pintura (pincel)" },
  { name: "Hammer", icon: Hammer, label: "Construção" },
  { name: "HardHat", icon: HardHat, label: "Obra" },
  { name: "Building", icon: Building, label: "Alvenaria" },
  { name: "Drill", icon: Drill, label: "Montagem/Marcenaria" },
  { name: "Ruler", icon: Ruler, label: "Marcenaria" },
  { name: "Sprout", icon: Sprout, label: "Jardinagem" },
  { name: "Trees", icon: Trees, label: "Paisagismo" },
  { name: "Sparkles", icon: Sparkles, label: "Limpeza" },
  { name: "Brush", icon: Brush, label: "Faxina" },
  { name: "SprayCan", icon: SprayCan, label: "Dedetização/Limpeza" },
  { name: "Bug", icon: Bug, label: "Dedetização" },
  { name: "Key", icon: Key, label: "Chaveiro" },
  { name: "KeyRound", icon: KeyRound, label: "Chaveiro (chave)" },
  { name: "Lock", icon: Lock, label: "Segurança/Fechadura" },
  { name: "ShieldCheck", icon: ShieldCheck, label: "Segurança residencial" },
  { name: "Camera", icon: Camera, label: "Câmeras/CFTV" },
  { name: "Fence", icon: Fence, label: "Cercas/Portões" },
  { name: "DoorClosed", icon: DoorClosed, label: "Portas/Portões" },
  { name: "Fan", icon: Fan, label: "Ventilação" },
  { name: "Wind", icon: Wind, label: "Ar-condicionado" },
  { name: "Thermometer", icon: Thermometer, label: "Climatização" },
  { name: "Refrigerator", icon: Refrigerator, label: "Refrigeração" },
  { name: "WashingMachine", icon: WashingMachine, label: "Eletrodomésticos" },
  { name: "Sofa", icon: Sofa, label: "Estofados/Móveis" },
  { name: "Flame", icon: Flame, label: "Gás" },
  { name: "Wifi", icon: Wifi, label: "Internet/Redes" },
  { name: "Tv", icon: Tv, label: "Eletrônicos/TV" },
  { name: "Truck", icon: Truck, label: "Mudança/Frete" },
  { name: "Package", icon: Package, label: "Entregas" },
  { name: "Warehouse", icon: Warehouse, label: "Depósito" },
  { name: "Car", icon: Car, label: "Automotivo" },
  { name: "Dog", icon: Dog, label: "Pet" },
  { name: "Scissors", icon: Scissors, label: "Estética/Corte" },
  { name: "Home", icon: Home, label: "Serviços gerais" },
];

function iconFor(name: string): LucideIcon {
  return ICON_OPTIONS.find((option) => option.name === name)?.icon ?? Wrench;
}

type Category = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  sort_order: number;
};

function useCategories() {
  return useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("id, slug, label, icon, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });
}

const EMPTY: Omit<Category, "id"> = { slug: "", label: "", icon: "Wrench", sort_order: 0 };

export function Categories() {
  const { data: categories = [], isLoading } = useCategories();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Category, "id">>(EMPTY);

  function openCreate() {
    setForm({ ...EMPTY, sort_order: categories.length + 1 });
    setCreating(true);
  }

  function openEdit(c: Category) {
    setForm(c);
    setEditing(c);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.slug.trim() || !form.label.trim()) {
      toast.error("Preencha slug e nome.");
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from("service_categories")
        .update(form)
        .eq("id", editing.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Categoria atualizada.");
    } else {
      const { error } = await supabase.from("service_categories").insert(form);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Categoria criada.");
    }
    closeModal();
    queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
  }

  async function remove(c: Category) {
    const { error } = await supabase.from("service_categories").delete().eq("id", c.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Categoria removida.");
    queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Categorias</h1>
        <button
          onClick={openCreate}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Nova categoria
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Categorias de serviço disponíveis no app.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
        {categories.map((c) => {
          const Icon = iconFor(c.icon);
          return (
            <div key={c.id} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary text-primary flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  slug: {c.slug} • ordem: {c.sort_order}
                </p>
              </div>
              <button onClick={() => openEdit(c)} className="p-2 text-muted-foreground">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(c)} className="p-2 text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={save}
            className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-float"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editing ? "Editar categoria" : "Nova categoria"}</h2>
              <button type="button" onClick={closeModal}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Nome (ex.: Eletricista)"
                className="w-full h-11 px-3 rounded-lg bg-background border border-border text-sm outline-none"
              />
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="Slug (ex.: eletricista)"
                className="w-full h-11 px-3 rounded-lg bg-background border border-border text-sm outline-none"
              />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Ícone</p>
                <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto p-1 rounded-lg border border-border bg-background">
                  {ICON_OPTIONS.map((option) => {
                    const OptionIcon = option.icon;
                    const selected = form.icon === option.name;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        title={option.label}
                        onClick={() => setForm({ ...form, icon: option.name })}
                        className={`h-9 w-9 rounded-lg flex items-center justify-center ${selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                      >
                        <OptionIcon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {ICON_OPTIONS.find((option) => option.name === form.icon)?.label ?? form.icon}
                </p>
              </div>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                placeholder="Ordem"
                className="w-full h-11 px-3 rounded-lg bg-background border border-border text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full h-11 mt-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
            >
              Salvar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
