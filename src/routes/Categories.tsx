import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
        {categories.map((c) => (
          <div key={c.id} className="p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-semibold text-sm">{c.label}</p>
              <p className="text-xs text-muted-foreground">
                slug: {c.slug} • ícone: {c.icon} • ordem: {c.sort_order}
              </p>
            </div>
            <button onClick={() => openEdit(c)} className="p-2 text-muted-foreground">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => remove(c)} className="p-2 text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
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
              <input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="Nome do ícone (lucide-react, ex.: Zap)"
                className="w-full h-11 px-3 rounded-lg bg-background border border-border text-sm outline-none"
              />
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
