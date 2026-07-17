# BicoJá Admin

Portal administrativo do BicoJá (aprovar prestadores, ver todos os pedidos, mediar disputas).
Mesmo projeto Supabase do app principal (`confia-secure-home`) — nenhum backend próprio.

## Rodar localmente

```
npm install
cp .env.example .env.local   # preencher com URL + anon key do Supabase
npm run dev
```

## Dar acesso de admin pela primeira vez

Não existe cadastro de admin pela UI — é uma flag manual no banco. No SQL Editor do
Supabase, depois de já ter uma conta criada pelo app principal ou por aqui:

```sql
update public.profiles set is_admin = true where email = 'seu-email@exemplo.com';
```

Depois disso, faça login normalmente em `/login` com essa conta.

## Stack

Vite + React + TypeScript + Tailwind v4 + TanStack Router (SPA, sem SSR) — mesmo tema
visual do app principal (cores, radius, sombras) mas layout desktop (sidebar), não o
mockup de celular usado lá.

## Deploy

Como é uma SPA estática (sem SSR), o candidato mais simples de free tier é Cloudflare
Pages ou Netlify — build com `npm run build`, publicar a pasta `dist/`. Ainda não configurado.
