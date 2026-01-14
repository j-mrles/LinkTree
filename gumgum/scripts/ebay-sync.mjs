import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REQUIRED_ENV = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN"];

function getEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !getEnv(key));
  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(
        ", "
      )}\n\nExample:\nEBAY_CLIENT_ID=...\nEBAY_CLIENT_SECRET=...\nEBAY_REFRESH_TOKEN=...`
    );
  }
}

function getApiBase() {
  const env = (process.env.EBAY_ENV || "PROD").toUpperCase();
  return env === "SANDBOX" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}) ${url}\n${text.slice(0, 500)}`);
  }
  return await res.json();
}

async function getAccessToken() {
  const apiBase = getApiBase();
  const clientId = getEnv("EBAY_CLIENT_ID");
  const clientSecret = getEnv("EBAY_CLIENT_SECRET");
  const refreshToken = getEnv("EBAY_REFRESH_TOKEN");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  // Note: scope must include sell.inventory.readonly for Inventory API reads.
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly"
  });

  const data = await fetchJson(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!data?.access_token) {
    throw new Error(`Token response missing access_token: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return data.access_token;
}

async function listInventorySkus(accessToken) {
  const apiBase = getApiBase();
  const skus = [];

  let offset = 0;
  const limit = 200;

  while (true) {
    const url = `${apiBase}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
    const data = await fetchJson(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    const items = Array.isArray(data?.inventoryItems) ? data.inventoryItems : [];
    for (const item of items) {
      const sku = typeof item?.sku === "string" ? item.sku : "";
      if (sku) skus.push(sku);
    }

    const total = Number.isFinite(data?.total) ? data.total : skus.length;
    offset += items.length;
    if (!items.length || offset >= total) break;
  }

  return skus;
}

async function bulkGetInventoryItems(accessToken, skus) {
  const apiBase = getApiBase();
  if (!skus.length) return new Map();

  const inventoryBySku = new Map();
  const chunkSize = 25;

  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    const data = await fetchJson(`${apiBase}/sell/inventory/v1/bulk_get_inventory_item`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ requests: chunk.map((sku) => ({ sku })) })
    });

    const responses = Array.isArray(data?.responses) ? data.responses : [];
    for (const response of responses) {
      const sku = response?.sku;
      const item = response?.inventoryItem;
      if (typeof sku === "string" && item) {
        inventoryBySku.set(sku, item);
      }
    }
  }

  return inventoryBySku;
}

async function getOffersForSku(accessToken, sku) {
  const apiBase = getApiBase();
  const url = `${apiBase}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  return Array.isArray(data?.offers) ? data.offers : [];
}

function pickBestOffer(offers) {
  // Prefer published offers (active listings). Fall back to first.
  const published = offers.find((o) => (o?.status || "").toUpperCase() === "PUBLISHED");
  return published ?? offers[0] ?? null;
}

function safeNumber(value) {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractTitle(inventoryItem) {
  return (
    inventoryItem?.product?.title ||
    inventoryItem?.product?.aspects?.Title?.[0] ||
    ""
  );
}

function extractQuantity(inventoryItem) {
  const qty = inventoryItem?.availability?.shipToLocationAvailability?.quantity;
  const n = safeNumber(qty);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

function extractOfferPrice(offer) {
  const price = offer?.pricingSummary?.price;
  const value = safeNumber(price?.value);
  const currency = typeof price?.currency === "string" ? price.currency : "USD";
  return value == null ? null : { value, currency };
}

function buildPublicUrl(offer) {
  // Best-effort: some accounts return listingId that can be used to link. If unavailable, leave blank.
  const listingId = offer?.listingId;
  if (typeof listingId !== "string" || !listingId) return "";
  return `https://www.ebay.com/itm/${listingId}`;
}

async function main() {
  assertEnv();

  console.log("[eBay Sync] Starting…");
  const accessToken = await getAccessToken();

  console.log("[eBay Sync] Listing inventory SKUs…");
  const skus = await listInventorySkus(accessToken);
  console.log(`[eBay Sync] Found ${skus.length} SKUs`);

  console.log("[eBay Sync] Bulk fetching inventory item details…");
  const inventoryBySku = await bulkGetInventoryItems(accessToken, skus);

  const items = [];
  for (const sku of skus) {
    const inventoryItem = inventoryBySku.get(sku);
    const title = extractTitle(inventoryItem) || sku;
    const quantityFromInventory = extractQuantity(inventoryItem);

    let offer = null;
    try {
      const offers = await getOffersForSku(accessToken, sku);
      offer = pickBestOffer(offers);
    } catch (error) {
      console.warn(`[eBay Sync] Offer lookup failed for SKU ${sku}:`, error.message);
    }

    const offerPrice = offer ? extractOfferPrice(offer) : null;
    const offerQty = offer && Number.isFinite(offer?.availableQuantity) ? offer.availableQuantity : null;
    const quantity = offerQty ?? quantityFromInventory ?? 0;

    items.push({
      source: "ebay",
      sku,
      title,
      availableQuantity: Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0,
      price: offerPrice?.value ?? null,
      currency: offerPrice?.currency ?? "USD",
      offerId: typeof offer?.offerId === "string" ? offer.offerId : "",
      listingId: typeof offer?.listingId === "string" ? offer.listingId : "",
      url: buildPublicUrl(offer)
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    store: "gumgumcards10",
    items
  };

  const outFile = path.resolve("gumgum-inventory/main/ebay-snapshot.json");
  await fs.writeFile(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`[eBay Sync] Wrote snapshot: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

