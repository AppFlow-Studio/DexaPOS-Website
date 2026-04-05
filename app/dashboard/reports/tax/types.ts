export interface TaxSummary {
  grossTaxCollected: number;
  taxRefunded: number;
  netTaxLiability: number;
  taxableSales: number;
  taxExemptSales: number;
  effectiveTaxRate: number;
  totalOrders: number;
  totalRefunds: number;
}

export interface TaxBreakdownRow {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  orderType: string;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  paymentMethod: string | null;
  pricingMode: string | null;
  taxRefunded: number;
  locationId: string;
}

export interface TaxCategoryRow {
  categoryName: string;
  taxableSales: number;
  taxCollected: number;
  taxExemptCount: number;
  effectiveRate: number;
}

export interface TaxLocationRow {
  locationId: string;
  locationName: string;
  salesTaxRate: number | null;
  grossTax: number;
  taxRefunded: number;
  netLiability: number;
  taxableSales: number;
}
