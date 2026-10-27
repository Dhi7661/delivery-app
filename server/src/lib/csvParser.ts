import { parseRupeesToPaise } from './money.js';

export interface CsvProductRow {
  rowNumber: number;
  shopName: string;
  categoryName: string;
  productName: string;
  brand: string;
  unitSize: string;
  mrpPaise: number;
  shopPricePaise: number;
  sellingPricePaise: number;
}

export interface CsvParseError {
  row: number;
  error: string;
}

export interface CsvParseResult {
  success: boolean;
  rows: CsvProductRow[];
  errors: CsvParseError[];
}

/**
 * Standard CSV line parser handling quotes, escaped quotes, and commas.
 */
export function parseRawCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

const REQUIRED_HEADERS = [
  'shop_name',
  'category',
  'product_name',
  'brand',
  'unit_size',
  'mrp_rupees',
  'shop_price_rupees',
];

/**
 * Parses and validates CSV rows according to F07 rules.
 */
export function validateAndParseProductCsv(
  csvText: string,
  knownShops: Set<string>,
  knownCategories: Set<string>
): CsvParseResult {
  const rawRows = parseRawCsv(csvText);
  const errors: CsvParseError[] = [];
  const validRows: CsvProductRow[] = [];

  if (rawRows.length === 0) {
    return {
      success: false,
      rows: [],
      errors: [{ row: 1, error: 'CSV file is empty' }],
    };
  }

  const header = rawRows[0].map((h) => h.toLowerCase().trim());
  const headerIndices: Record<string, number> = {};

  for (const col of REQUIRED_HEADERS) {
    const idx = header.indexOf(col);
    if (idx === -1) {
      errors.push({
        row: 1,
        error: `Missing required header column '${col}'`,
      });
    } else {
      headerIndices[col] = idx;
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      rows: [],
      errors,
    };
  }

  for (let i = 1; i < rawRows.length; i++) {
    const rowNum = i + 1; // 1-based index (header is row 1)
    const rawCols = rawRows[i];

    const shopName = rawCols[headerIndices['shop_name']] || '';
    const categoryName = rawCols[headerIndices['category']] || '';
    const productName = rawCols[headerIndices['product_name']] || '';
    const brand = rawCols[headerIndices['brand']] || '';
    const unitSize = rawCols[headerIndices['unit_size']] || '';
    const mrpStr = rawCols[headerIndices['mrp_rupees']] || '';
    const shopPriceStr = rawCols[headerIndices['shop_price_rupees']] || '';

    // Check missing fields
    if (!shopName) errors.push({ row: rowNum, error: "Missing required field 'shop_name'" });
    if (!categoryName) errors.push({ row: rowNum, error: "Missing required field 'category'" });
    if (!productName) errors.push({ row: rowNum, error: "Missing required field 'product_name'" });
    if (!unitSize) errors.push({ row: rowNum, error: "Missing required field 'unit_size'" });
    if (!mrpStr) errors.push({ row: rowNum, error: "Missing required field 'mrp_rupees'" });
    if (!shopPriceStr) errors.push({ row: rowNum, error: "Missing required field 'shop_price_rupees'" });

    // Unknown shop
    if (shopName && !knownShops.has(shopName)) {
      errors.push({ row: rowNum, error: `Unknown shop '${shopName}'` });
    }

    // Unknown category
    if (categoryName && !knownCategories.has(categoryName)) {
      errors.push({ row: rowNum, error: `Unknown category '${categoryName}'` });
    }

    let mrpPaise = 0;
    let shopPricePaise = 0;

    // Parse MRP
    if (mrpStr) {
      try {
        mrpPaise = parseRupeesToPaise(mrpStr);
        if (mrpPaise <= 0) {
          errors.push({ row: rowNum, error: 'MRP must be greater than zero' });
        }
      } catch (err: any) {
        errors.push({ row: rowNum, error: `Invalid mrp_rupees: ${err.message}` });
      }
    }

    // Parse Shop Price
    if (shopPriceStr) {
      try {
        shopPricePaise = parseRupeesToPaise(shopPriceStr);
        if (shopPricePaise <= 0) {
          errors.push({ row: rowNum, error: 'Shop price must be greater than zero' });
        }
      } catch (err: any) {
        errors.push({ row: rowNum, error: `Invalid shop_price_rupees: ${err.message}` });
      }
    }

    // Shop price above MRP rule
    if (mrpPaise > 0 && shopPricePaise > 0 && shopPricePaise > mrpPaise) {
      errors.push({
        row: rowNum,
        error: `Shop price (${shopPriceStr}) exceeds printed MRP (${mrpStr})`,
      });
    }

    if (errors.length === 0) {
      validRows.push({
        rowNumber: rowNum,
        shopName,
        categoryName,
        productName,
        brand,
        unitSize,
        mrpPaise,
        shopPricePaise,
        sellingPricePaise: mrpPaise, // standard customer selling price is MRP
      });
    }
  }

  return {
    success: errors.length === 0,
    rows: errors.length === 0 ? validRows : [],
    errors,
  };
}
