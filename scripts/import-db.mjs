/**
 * Importa db.json para o Supabase usando a service_role (apenas local/CI).
 *
 * Uso:
 *   cd scripts && npm install
 *   set SUPABASE_URL=https://xxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...  (Settings → API → service_role)
 *   set SUPABASE_TARGET_USER_ID=<uuid do usuario em Authentication → Users>
 *   node import-db.mjs
 *
 * PowerShell: $env:SUPABASE_URL="..."
 *
 * IDs legados (não-UUID) em produtos/comandas são substituídos por UUID;
 * productId nos itens das comandas é atualizado para bater com os novos ids.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const targetUserId = process.env.SUPABASE_TARGET_USER_ID || "";

if (!url || !serviceKey || !targetUserId) {
  console.error("Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_TARGET_USER_ID.");
  process.exit(1);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return typeof s === "string" && UUID_RE.test(s);
}

function ensureUuid(value) {
  const str = value != null && value !== "" ? String(value) : "";
  return isUuid(str) ? str : randomUUID();
}

/** Produtos com id UUID; mapa id legado -> novo UUID para itens de comandas. */
function prepareProducts(products) {
  const legacyToNew = new Map();
  const list = [];
  for (const p of products || []) {
    const sid = p.id != null && p.id !== "" ? String(p.id) : null;
    let id;
    if (sid && isUuid(sid)) {
      id = sid;
    } else if (sid) {
      id = randomUUID();
      legacyToNew.set(sid, id);
    } else {
      id = randomUUID();
    }
    list.push({ ...p, id });
  }
  return { products: list, legacyToNew };
}

function remapProductIdsInPayload(payload, legacyToNew) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) {
    if (item.productId == null || item.productId === "") continue;
    const key = String(item.productId);
    if (legacyToNew.has(key)) item.productId = legacyToNew.get(key);
  }
}

function commandaUpsertRow(o, legacyToNew) {
  const payload = JSON.parse(JSON.stringify(o));
  delete payload.id;
  remapProductIdsInPayload(payload, legacyToNew);
  const status = payload.status || "Aberta";
  const closed_at =
    payload.closedAt != null && payload.closedAt !== ""
      ? new Date(payload.closedAt).toISOString()
      : null;
  const created_at =
    payload.createdAt != null && payload.createdAt !== ""
      ? new Date(payload.createdAt).toISOString()
      : new Date().toISOString();
  return {
    id: ensureUuid(o.id),
    payload,
    status,
    closed_at,
    created_at
  };
}

function dailyCloseUpsertRow(row) {
  const payload = JSON.parse(JSON.stringify(row));
  const id = ensureUuid(row.id);
  const closed_at =
    payload.closedAt != null && payload.closedAt !== ""
      ? new Date(payload.closedAt).toISOString()
      : new Date().toISOString();
  const rawYmd = payload.dateYmd != null ? String(payload.dateYmd).slice(0, 10) : "";
  if (!rawYmd) throw new Error(`Fechamento sem dateYmd (id=${row.id})`);
  return {
    id,
    payload,
    closed_at,
    date_ymd: rawYmd
  };
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const db = JSON.parse(readFileSync(join(root, "db.json"), "utf8"));

const configPayload = Array.isArray(db.config) ? db.config[0] : db.config;
const defaultConfig = {
  id: 1,
  useTables: false,
  useServiceFee: true,
  activeTheme: "apple",
  categories: ["Bebidas", "Lanches", "Porcoes", "Pratos", "Sobremesas", "Outros"],
  prepCategories: [],
  paymentMethods: [
    { id: "card", name: "Cartao", active: true },
    { id: "cash", name: "Dinheiro", active: true },
    { id: "pix", name: "PIX", active: true },
    { id: "voucher", name: "Vale Ref.", active: true }
  ],
  ...configPayload
};

async function main() {
  const { products, legacyToNew } = prepareProducts(db.products);

  console.log("Importando produtos...");
  for (const p of products) {
    const { error } = await supabase.from("products").upsert({
      id: p.id,
      user_id: targetUserId,
      name: p.name,
      category: p.category,
      price: p.price,
      requires_prep: p.requiresPrep === true
    });
    if (error) throw error;
  }

  console.log("Importando comandas...");
  for (const o of db.commandas || []) {
    if (o.id == null || o.id === "") continue;
    const row = commandaUpsertRow(o, legacyToNew);
    const { error } = await supabase.from("commandas").upsert({
      id: row.id,
      user_id: targetUserId,
      payload: row.payload,
      status: row.status,
      closed_at: row.closed_at,
      created_at: row.created_at
    });
    if (error) throw error;
  }

  console.log("Importando fechamentos...");
  for (const row of db.dailyCloses || []) {
    if (row.id == null || row.id === "") continue;
    const r = dailyCloseUpsertRow(row);
    const { error } = await supabase.from("daily_closes").upsert({
      id: r.id,
      user_id: targetUserId,
      payload: r.payload,
      closed_at: r.closed_at,
      date_ymd: r.date_ymd
    });
    if (error) throw error;
  }

  console.log("Importando app_config...");
  const { error: cfgErr } = await supabase.from("app_config").upsert(
    { user_id: targetUserId, payload: defaultConfig },
    { onConflict: "user_id" }
  );
  if (cfgErr) throw cfgErr;

  console.log("Concluido.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
