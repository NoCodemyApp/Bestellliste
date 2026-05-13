import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAIL      = Deno.env.get("ADMIN_EMAIL") ?? "admin@beispiel.de";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500, headers: corsHeaders });
    }

    const body = await req.json();
    const { group_order_id } = body ?? {};

    if (!group_order_id) {
      return new Response(JSON.stringify({ error: "Missing group_order_id" }), { status: 400, headers: corsHeaders });
    }

    // Service-Role-Client (kein Auth-Header nötig, da pg_cron kein Bearer-Token sendet)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Sammelbestellung laden ──────────────────────────────
    const { data: groupOrder, error: goError } = await supabase
      .from("group_orders")
      .select("id, deadline, status, created_at")
      .eq("id", group_order_id)
      .single();

    if (goError || !groupOrder) {
      return new Response(JSON.stringify({ error: goError?.message ?? "Group order not found" }), { status: 404, headers: corsHeaders });
    }

    // ── 2. Alle Orders dieser Sammelbestellung laden ───────────
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        user_id,
        submitted_at,
        order_items (
          product_name,
          product_sku,
          quantity,
          size_label,
          unit_price_netto,
          unit_price_mwst,
          unit_price_brutto
        )
      `)
      .eq("group_order_id", group_order_id);

    if (ordersError) {
      return new Response(JSON.stringify({ error: ordersError.message }), { status: 500, headers: corsHeaders });
    }

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ error: "No orders found for this group order" }), { status: 404, headers: corsHeaders });
    }

    // ── 3. User-E-Mails zu user_ids auflösen ──────────────────
    const userIds = [...new Set(orders.map((o) => o.user_id).filter(Boolean))];
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const userMap: Record<string, string> = {};
    (usersData?.users ?? []).forEach((u) => {
      if (userIds.includes(u.id)) userMap[u.id] = u.email ?? u.id;
    });

    // ── 4. Gesamte Positionen aggregieren (Sektion 1) ─────────
    const allItemsMap: Record<string, {
      product_name: string;
      product_sku: string | null;
      size_label: string | null;
      quantity: number;
      unit_price_netto: number;
      unit_price_mwst: number;
      unit_price_brutto: number;
    }> = {};

    for (const order of orders) {
      for (const item of order.order_items ?? []) {
        const key = `${item.product_name}__${item.product_sku ?? ""}__${item.size_label ?? ""}`;
        if (!allItemsMap[key]) {
          allItemsMap[key] = {
            product_name: item.product_name,
            product_sku: item.product_sku ?? null,
            size_label: item.size_label ?? null,
            quantity: 0,
            unit_price_netto: Number(item.unit_price_netto ?? 0),
            unit_price_mwst: Number(item.unit_price_mwst ?? 0),
            unit_price_brutto: Number(item.unit_price_brutto ?? 0),
          };
        }
        allItemsMap[key].quantity += Number(item.quantity ?? 0);
      }
    }

    const aggregatedItems = Object.values(allItemsMap);

    const grandTotalNetto  = aggregatedItems.reduce((s, i) => s + i.quantity * i.unit_price_netto, 0);
    const grandTotalMwst   = aggregatedItems.reduce((s, i) => s + i.quantity * i.unit_price_mwst, 0);
    const grandTotalBrutto = aggregatedItems.reduce((s, i) => s + i.quantity * i.unit_price_brutto, 0);

    const fmt = (n: number) => n.toFixed(2);

    // HTML-Zeilen Sektion 1
    const section1Rows = aggregatedItems.map((item) => {
      const lineNetto  = item.quantity * item.unit_price_netto;
      const lineMwst   = item.quantity * item.unit_price_mwst;
      const lineBrutto = item.quantity * item.unit_price_brutto;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.product_name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.product_sku ?? "–"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${item.size_label ?? "–"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${item.quantity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmt(item.unit_price_netto)} EUR</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmt(item.unit_price_mwst)} EUR</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmt(item.unit_price_brutto)} EUR</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmt(lineNetto)} EUR</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmt(lineMwst)} EUR</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;"><strong>${fmt(lineBrutto)} EUR</strong></td>
      </tr>`;
    }).join("");

    // ── 5. Pro-Person-Aufschlüsselung (Sektion 2) ────────────
    //    Alphabetisch nach Vorname (= erster Teil der E-Mail vor @)
    const sortedOrders = [...orders].sort((a, b) => {
      const emailA = (userMap[a.user_id] ?? "").split("@")[0].toLowerCase();
      const emailB = (userMap[b.user_id] ?? "").split("@")[0].toLowerCase();
      return emailA.localeCompare(emailB, "de");
    });

    const section2Html = sortedOrders.map((order) => {
      const email = userMap[order.user_id] ?? order.user_id;
      const items = order.order_items ?? [];
      const personBrutto = items.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_price_brutto ?? 0), 0);

      const itemRows = items.map((item) => {
        const lineBrutto = Number(item.quantity ?? 0) * Number(item.unit_price_brutto ?? 0);
        return `<tr>
          <td style="padding:4px 10px;">${item.product_name}${item.size_label ? ` (${item.size_label})` : ""}</td>
          <td style="padding:4px 10px;text-align:right;">${item.quantity}×</td>
          <td style="padding:4px 10px;text-align:right;">${fmt(Number(item.unit_price_brutto ?? 0))} EUR</td>
          <td style="padding:4px 10px;text-align:right;"><strong>${fmt(lineBrutto)} EUR</strong></td>
        </tr>`;
      }).join("");

      return `
        <tr><td colspan="4" style="padding:14px 10px 4px;font-weight:bold;font-size:15px;border-top:2px solid #ccc;">
          👤 ${email}
        </td></tr>
        ${itemRows}
        <tr>
          <td colspan="3" style="padding:4px 10px;text-align:right;font-weight:bold;">Summe Brutto:</td>
          <td style="padding:4px 10px;text-align:right;font-weight:bold;">${fmt(personBrutto)} EUR</td>
        </tr>`;
    }).join("");

    // ── 6. E-Mail zusammenbauen ───────────────────────────────
    const deadlineFormatted = new Date(groupOrder.deadline).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

    const htmlBody = `
      <h2 style="font-family:Arial,sans-serif;">Sammelbestellung abgeschlossen</h2>
      <p style="font-family:Arial,sans-serif;">
        <strong>Sammelbestellung-ID:</strong> ${groupOrder.id}<br>
        <strong>Deadline:</strong> ${deadlineFormatted}<br>
        <strong>Anzahl Bestellungen:</strong> ${orders.length}
      </p>

      <h3 style="font-family:Arial,sans-serif;margin-top:28px;">Sektion 1 – Gesamtübersicht aller Artikel</h3>
      <table style="font-family:Arial,sans-serif;border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Produkt</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">SKU</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Größe</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Menge</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Netto/Stk</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">MwSt/Stk</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Brutto/Stk</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Ges. Netto</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Ges. MwSt</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Ges. Brutto</th>
          </tr>
        </thead>
        <tbody>
          ${section1Rows}
          <tr style="background:#f0f0f0;">
            <td colspan="7" style="padding:8px 10px;font-weight:bold;">Gesamtsumme</td>
            <td style="padding:8px 10px;text-align:right;font-weight:bold;">${fmt(grandTotalNetto)} EUR</td>
            <td style="padding:8px 10px;text-align:right;font-weight:bold;">${fmt(grandTotalMwst)} EUR</td>
            <td style="padding:8px 10px;text-align:right;font-weight:bold;">${fmt(grandTotalBrutto)} EUR</td>
          </tr>
        </tbody>
      </table>

      <h3 style="font-family:Arial,sans-serif;margin-top:36px;">Sektion 2 – Aufschlüsselung nach Mitglied (alphabetisch)</h3>
      <table style="font-family:Arial,sans-serif;border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;">Produkt</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Menge</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Brutto/Stk</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">Gesamt Brutto</th>
          </tr>
        </thead>
        <tbody>
          ${section2Html}
        </tbody>
      </table>
    `;

    // ── 7. Resend aufrufen ────────────────────────────────────
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vereinsbestellung <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `Sammelbestellung abgeschlossen – ${orders.length} Bestellung(en)`,
        html: htmlBody,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: resendData }), { status: 500, headers: corsHeaders });
    }

    // Status auf 'sent' setzen
    await supabase
      .from("group_orders")
      .update({ status: "sent" })
      .eq("id", group_order_id);

    return new Response(JSON.stringify({ success: true, data: resendData }), { status: 200, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message ?? "Unknown error" }), { status: 500, headers: corsHeaders });
  }
});
