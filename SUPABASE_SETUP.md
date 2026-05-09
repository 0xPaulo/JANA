# Supabase — setup e GitHub Pages

## 1) Projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o arquivo [supabase/migrations/001_initial_schema.sql](supabase/migrations/001_initial_schema.sql).

### Schema Fase A (PK `uuid`)

As tabelas `products`, `commandas` e `daily_closes` usam **`uuid`** como chave primária (`gen_random_uuid()` no Postgres). `commandas` e `daily_closes` têm colunas extras para consulta (`status`, `created_at`, `closed_at`, `date_ymd`, etc.) além do JSON em `payload`.

**Primeira instalação:** cole o SQL inteiro em um projeto novo.

**Se você já tinha rodado uma versão antiga deste migration** (PK `text`), precisa **apagar ou recriar** as tabelas de dados antes — o script atual faz `DROP TABLE IF EXISTS` de `daily_closes`, `commandas` e `products` (os dados nessas tabelas são removidos). `profiles` e `app_config` são preservados quando já existem.

3. Se o trigger der erro de sintaxe (`execute function` / `procedure`), ajuste a última linha do trigger conforme a versão do Postgres do projeto (no editor de SQL do Supabase costuma funcionar com `execute function public.handle_new_user();`).

## 2) Usuário (Auth)

1. **Authentication → Users → Add user** — crie um usuário com **email** e **senha** (uso pessoal: pode desabilitar confirmação de email em *Authentication → Providers → Email* se quiser fluxo simples).
2. Copie o **User UID** (uuid) — será usado no script de importação opcional.

## 3) Chaves no app (front)

1. Copie [supabase-config.example.js](supabase-config.example.js) para `supabase-config.js` na raiz do projeto (este arquivo está no `.gitignore`).
2. Preencha `window.__SUPABASE_URL__` e `window.__SUPABASE_ANON_KEY__` (Settings → API — **anon public**, nunca `service_role` no navegador).

## 4) URLs para login (GitHub Pages e local)

Em **Authentication → URL configuration**:

- **Site URL**: `https://<usuario>.github.io/<repo>/` (ou a URL exata do seu site).
- **Redirect URLs**: inclua a mesma URL e `http://localhost:*` se testar com servidor local.

## 5) Importar dados de `db.json` (opcional)

Use **apenas** a `service_role` em máquina confiável (nunca no front).

```bash
cd scripts
npm install
set SUPABASE_URL=https://xxxx.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=eyJ...
set SUPABASE_TARGET_USER_ID=<uuid do passo 2>
node import-db.mjs
```

No PowerShell use `$env:SUPABASE_URL="..."` etc.

O `db.json` pode ter **IDs legados** (números, strings curtas). O script gera **UUID** onde for preciso e **ajusta `productId`** nos itens das comandas para corresponder aos novos IDs de produto — não é necessário editar o JSON à mão.

## 6) JWT

O Supabase Auth guarda a sessão no navegador e envia o **JWT** automaticamente nas chamadas ao PostgREST. Não é necessário (nem seguro) tratar o JWT manualmente no app; o isolamento dos dados vem do **RLS** com `auth.uid()`.

## 7) Modo json-server (fallback)

Se `supabase-config.js` não existir ou URL/chave estiverem vazias, o app continua usando `json-server` na porta **3001**, como antes.
