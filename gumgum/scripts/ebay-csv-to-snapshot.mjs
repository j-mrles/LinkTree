import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage() {
  return `Usage:
  node scripts/ebay-csv-to-snapshot.mjs /path/to/ebay-active-listings.csv

Notes:
  - Export the CSV from eBay Seller Hub (Active listings / Listings report).
  - This avoids scraping and avoids eBay API auth.
  - Output is written to gumgum-inventory/main/ebay-snapshot.json
`;
}

function parseCsv(text) {
  // Minimal RFC4180-ish parser (handles quoted fields with commas/newlines).
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (c === "\n") {
      row.push(field);
      field = "";
      // Handle CRLF: if previous char is \r, strip it from last field
      if (row.length && row[row.length - 1].endsWith("\r")) {
        row[row.length - 1] = row[row.length - 1].slice(0, -1);
      }
      rows.push(row);
      row = [];
      continue;
    }

    field += c;
  }

  // Final field/row
  row.push(field);
  rows.push(row);

  // Drop trailing empty row if file ended with newline
  if (rows.length && rows[rows.length - 1].every((v) => v === "")) {
    rows.pop();
  }

  return rows;
}

function normalizeHeader(h) {
  return (h ?? "").toString().trim().toLowerCase();
}

function findHeaderIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function toNumber(value) {
  const raw = (value ?? "").toString().trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toInt(value) {
  const n = toNumber(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const csvText = await fs.readFile(inputPath, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("CSV appears empty (needs header + at least 1 row).");
  }

  const headers = rows[0];

  // Common eBay CSV headers vary; we search a few likely names.
  const idxTitle = findHeaderIndex(headers, ["title", "item title", "listing title"]);
  const idxSku = findHeaderIndex(headers, ["custom label (sku)", "custom label", "sku"]);
  const idxItemId = findHeaderIndex(headers, ["item id", "ebay item id", "listing id"]);
  const idxQty = findHeaderIndex(headers, [
    "available quantity",
    "quantity available",
    "available",
    "quantity"
  ]);
  const idxPrice = findHeaderIndex(headers, ["price", "current price", "buy it now price"]);

  if (idxTitle === -1 && idxSku === -1 && idxItemId === -1) {
    throw new Error(
      `Could not find identifying columns. Expected one of: Title/SKU/Item ID.\nHeaders seen: ${headers
        .slice(0, 30)
        .join(", ")}`
    );
  }

  const items = [];
  for (const row of rows.slice(1)) {
    const sku = idxSku !== -1 ? (row[idxSku] ?? "").toString().trim() : "";
    const listingId = idxItemId !== -1 ? (row[idxItemId] ?? "").toString().trim() : "";
    const title = idxTitle !== -1 ? (row[idxTitle] ?? "").toString().trim() : "";
    const qty = idxQty !== -1 ? toInt(row[idxQty]) : null;
    const price = idxPrice !== -1 ? toNumber(row[idxPrice]) : null;

    if (!sku && !listingId && !title) continue;

    items.push({
      source: "ebay",
      sku,
      title: title || sku || "eBay Listing",
      availableQuantity: qty ?? 0,
      price,
      currency: "USD",
      offerId: "",
      listingId,
      url: listingId ? `https://www.ebay.com/itm/${listingId}` : ""
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    store: "gumgumcards10",
    items
  };

  const outFile = path.resolve("gumgum-inventory/main/ebay-snapshot.json");
  await fs.writeFile(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`[eBay CSV] Wrote snapshot: ${outFile}`);
  console.log(`[eBay CSV] Items: ${items.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

