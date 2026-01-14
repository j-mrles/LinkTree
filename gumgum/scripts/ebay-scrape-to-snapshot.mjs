import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage() {
  return `Usage:
  npm run ebay:scrape

Optional env:
  EBAY_SELLER=gumgumcards10        (default)
  EBAY_PAGES=2                     (default 1)

Notes:
  - This does NOT bypass eBay verification/captcha. If eBay returns a "verify yourself" page, this script will fail.
  - Output is written to gumgum-inventory/main/ebay-snapshot.json (so the existing "Import eBay" button can ingest it).
`;
}

function getEnv(name, fallback = "") {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function mustNotBeVerification(html, url) {
  const lowered = html.toLowerCase();
  const blockedSignals = [
    "pardon our interruption",
    "please verify yourself to continue",
    "verify yourself",
    "captcha",
    "unusual activity",
    "automated access"
  ];
  if (blockedSignals.some((s) => lowered.includes(s))) {
    throw new Error(
      `eBay returned a verification/blocked page for ${url}. This scraper will not bypass it. Use the API sync or try again later from a normal browser network/session.`
    );
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      // Keep it honest; don't pretend to be a real browser.
      "User-Agent": "gumgum-inventory/1.0 (best-effort HTML fetch; no bypass)"
    },
    redirect: "follow"
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}\n${text.slice(0, 500)}`);
  }
  mustNotBeVerification(text, url);
  return text;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? "").trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function decodeHtmlEntities(input) {
  const text = (input ?? "").toString();
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    );
}

function stripTags(input) {
  return decodeHtmlEntities((input ?? "").toString().replace(/<[^>]*>/g, "").trim());
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // Some pages include multiple JSON objects; try to salvage by trimming.
    const trimmed = raw.replace(/^\s*<!--|-->\s*$/g, "").trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
}

function toNumber(value) {
  const raw = (value ?? "").toString().trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseItemsFromJsonLd(doc) {
  const items = [];

  // We look for ItemList -> itemListElement -> item -> (name/url/offers)
  const itemList =
    doc?.["@type"] === "ItemList" ? doc : null;

  const itemListElements = Array.isArray(itemList?.itemListElement)
    ? itemList.itemListElement
    : [];

  for (const el of itemListElements) {
    const item = el?.item ?? el;
    const name = (item?.name ?? "").toString().trim();
    const url = (item?.url ?? "").toString().trim();

    const offers = item?.offers;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    const price = toNumber(offer?.price);
    const currency = (offer?.priceCurrency ?? "USD").toString();

    // Try to infer listingId from /itm/{id} in URL
    let listingId = "";
    const m = url.match(/\/itm\/(\d+)/);
    if (m) listingId = m[1];

    if (!name && !url) continue;
    items.push({
      source: "ebay",
      sku: "",
      title: name || "eBay Listing",
      availableQuantity: 0,
      price,
      currency,
      offerId: "",
      listingId,
      url
    });
  }

  return items;
}

function parseItemsFromSearchHtml(html) {
  const items = [];

  // eBay search results typically render server-side <li class="s-item ..."> blocks.
  const itemRe =
    /<li[^>]*class="[^"]*\bs-item\b[^"]*"[^>]*>[\s\S]*?<\/li>/gi;

  let match;
  while ((match = itemRe.exec(html))) {
    const block = match[0];

    // Link
    const linkMatch = block.match(
      /<a[^>]*class="[^"]*\bs-item__link\b[^"]*"[^>]*href="([^"]+)"/i
    );
    const url = linkMatch ? decodeHtmlEntities(linkMatch[1]) : "";

    // Title (may be <h3> or <span>)
    const titleMatch =
      block.match(
        /<(?:h3|span)[^>]*class="[^"]*\bs-item__title\b[^"]*"[^>]*>([\s\S]*?)<\/(?:h3|span)>/i
      ) ?? null;
    const title = titleMatch ? stripTags(titleMatch[1]) : "";

    // Price
    const priceMatch = block.match(
      /<span[^>]*class="[^"]*\bs-item__price\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );
    const priceText = priceMatch ? stripTags(priceMatch[1]) : "";
    const price = toNumber(priceText);

    // Best-effort listingId from /itm/{id}
    let listingId = "";
    const idMatch = url.match(/\/itm\/(\d+)/);
    if (idMatch) listingId = idMatch[1];

    // Best-effort available quantity (sometimes shown like "3 available")
    let availableQuantity = 0;
    const availMatch = stripTags(block).match(/(\d[\d,]*)\s+available/i);
    if (availMatch) {
      const n = Number.parseInt(availMatch[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n)) availableQuantity = Math.max(0, n);
    }

    if (!title && !url) continue;
    // Filter out obvious non-results like "Shop on eBay" etc.
    if (title.toLowerCase() === "shop on ebay") continue;

    items.push({
      source: "ebay",
      sku: "",
      title: title || "eBay Listing",
      availableQuantity,
      price,
      currency: priceText.includes("$") ? "USD" : "USD",
      offerId: "",
      listingId,
      url
    });
  }

  return items;
}

async function main() {
  const seller = getEnv("EBAY_SELLER", "gumgumcards10");
  const pages = Math.max(1, Number.parseInt(getEnv("EBAY_PAGES", "1"), 10) || 1);

  if (!seller) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  console.log(`[eBay Scrape] Seller=${seller} pages=${pages}`);

  const allItems = [];
  for (let page = 1; page <= pages; page++) {
    // Public seller search page (often more parseable than the "store" short link).
    const url = `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(
      seller
    )}&rt=nc&_pgn=${page}`;

    console.log(`[eBay Scrape] Fetching page ${page}: ${url}`);
    const html = await fetchText(url);

    const jsonLdBlocks = extractJsonLdBlocks(html);
    if (jsonLdBlocks.length) {
      for (const raw of jsonLdBlocks) {
        const parsed = safeJsonParse(raw);
        if (!parsed) continue;

        // JSON-LD may be an array or single doc.
        const docs = Array.isArray(parsed) ? parsed : [parsed];
        for (const doc of docs) {
          allItems.push(...parseItemsFromJsonLd(doc));
        }
      }
    } else {
      console.warn("[eBay Scrape] No JSON-LD blocks found on page", page, "- falling back to HTML parsing.");
      allItems.push(...parseItemsFromSearchHtml(html));
    }
  }

  const items = uniqueBy(allItems, (i) => i.listingId || i.url || i.title);

  const output = {
    generatedAt: new Date().toISOString(),
    store: seller,
    items
  };

  const outFile = path.resolve("gumgum-inventory/main/ebay-snapshot.json");
  await fs.writeFile(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`[eBay Scrape] Wrote snapshot: ${outFile}`);
  console.log(`[eBay Scrape] Items: ${items.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

