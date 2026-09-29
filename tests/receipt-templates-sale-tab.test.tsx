/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ReceiptSettingsForm } from "@/app/dashboard/settings/receipt-templates/components/ReceiptSettingsForm";
import { SaleReceiptPreview } from "@/app/dashboard/settings/receipt-templates/components/receipt-previews/SaleReceiptPreview";
import { DEFAULT_TEMPLATE_VALUES } from "@/app/dashboard/settings/receipt-templates/constants";
import type {
  ReceiptTemplateFormData,
  TemplateType,
} from "@/app/dashboard/settings/receipt-templates/types";
import { DEFAULT_SIGNATURE_DISCLAIMER } from "@/lib/receipts/signature-block";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const noop = () => {};

function renderForm(
  templateType: TemplateType,
  overrides: Partial<ReceiptTemplateFormData> = {},
) {
  act(() => {
    root.render(
      <ReceiptSettingsForm
        templateType={templateType}
        formState={{ ...DEFAULT_TEMPLATE_VALUES[templateType], ...overrides }}
        onChange={noop}
      />,
    );
  });
  return container.textContent ?? "";
}

function renderPreview(overrides: Partial<ReceiptTemplateFormData> = {}) {
  act(() => {
    root.render(
      <SaleReceiptPreview
        formState={{ ...DEFAULT_TEMPLATE_VALUES.sale, ...overrides }}
      />,
    );
  });
}

function press(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  );
  if (!button) throw new Error(`No button labelled "${label}"`);
  act(() => button.click());
}

const text = () => container.textContent ?? "";

describe("Sale Receipt settings form", () => {
  it("offers the Card payments group", () => {
    const form = renderForm("sale");
    expect(form).toContain("Card payments");
    expect(form).toContain("Print cardholder signature line");
    expect(form).toContain("Signature disclaimer (optional)");
    expect(form).toContain("card sales always print a merchant copy");
  });

  it("keeps header and footer text, with the don't-repeat hint", () => {
    const form = renderForm("sale");
    expect(form).toContain("Header Text");
    expect(form).toContain("Footer Text");
    expect(form).toContain("Those print automatically");
  });

  it("drops the toggles the POS ignores on a sale receipt", () => {
    const form = renderForm("sale");
    expect(form).not.toContain("Show Logo");
    expect(form).not.toContain("Show Tax Breakdown");
    expect(form).not.toContain("Show Barcode");
    expect(form).not.toContain("Show QR Code");
    expect(form).not.toContain("Extras");
  });

  it("still offers the toggles the POS honours", () => {
    const form = renderForm("sale");
    expect(form).toContain("Show Item Modifiers");
    expect(form).toContain("Show Tip Line");
    expect(form).toContain("Show Server Name");
    expect(form).toContain("Show Order Type");
  });

  it("locks the disclaimer until the signature line is on", () => {
    renderForm("sale", { print_signature_line: false });
    const off = container.querySelector<HTMLTextAreaElement>(
      "#signature-line-disclaimer",
    );
    expect(off?.disabled).toBe(true);
    expect(off?.placeholder).toBe(DEFAULT_SIGNATURE_DISCLAIMER);

    renderForm("sale", { print_signature_line: true });
    const on = container.querySelector<HTMLTextAreaElement>(
      "#signature-line-disclaimer",
    );
    expect(on?.disabled).toBe(false);
  });
});

describe("other template tabs are unchanged", () => {
  it("void / refund keeps logo, header and footer, and has no Card payments", () => {
    const form = renderForm("void_refund");
    expect(form).toContain("Show Logo");
    expect(form).toContain("Header Text");
    expect(form).toContain("Footer Text");
    expect(form).toContain("Show Tax Breakdown");
    expect(form).not.toContain("Card payments");
    expect(form).not.toContain("Those print automatically");
  });

  it("online order keeps barcode and QR code", () => {
    const form = renderForm("online_order");
    expect(form).toContain("Show Barcode");
    expect(form).toContain("Show QR Code");
    expect(form).not.toContain("Card payments");
  });

  it("kitchen has no branding and no Card payments", () => {
    const form = renderForm("kitchen");
    expect(form).not.toContain("Branding");
    expect(form).not.toContain("Header Text");
    expect(form).not.toContain("Card payments");
    expect(form).toContain("Group by Station");
  });
});

describe("Sale Receipt preview", () => {
  it("prints the block on the merchant copy of a card sale", () => {
    renderPreview({ print_signature_line: true });
    expect(text()).toContain("Cardholder Signature");
    expect(text()).toContain(DEFAULT_SIGNATURE_DISCLAIMER);
    expect(text()).toContain("Merchant Copy");
  });

  it("leaves it off the customer copy", () => {
    renderPreview({ print_signature_line: true });
    press("Customer copy");
    expect(text()).not.toContain("Cardholder Signature");
    expect(text()).toContain("Customer Copy");
  });

  it("leaves it off cash sales", () => {
    renderPreview({ print_signature_line: true });
    press("Cash");
    expect(text()).not.toContain("Cardholder Signature");
    expect(text()).toContain("Paid: Cash");
  });

  it("never prints it while the signature line is off", () => {
    renderPreview({ print_signature_line: false });
    expect(text()).not.toContain("Cardholder Signature");
    press("Customer copy");
    press("Cash");
    expect(text()).not.toContain("Cardholder Signature");
  });

  it("prints the merchant's own disclaimer when one is set", () => {
    renderPreview({
      print_signature_line: true,
      signature_line_disclaimer: "All sales final.",
    });
    expect(text()).toContain("All sales final.");
    expect(text()).not.toContain(DEFAULT_SIGNATURE_DISCLAIMER);
  });

  it("follows the printed order", () => {
    renderPreview({
      print_signature_line: true,
      footer_text: "Thank you for dining with us!",
    });
    const order = [
      "Subtotal",
      "Paid: Card",
      "Cardholder Signature",
      "Order Date",
      "Thank you for dining with us!",
      "Merchant Copy",
    ].map((marker) => text().indexOf(marker));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("hides server and order type when those are off", () => {
    renderPreview({ show_server_name: false, show_order_type: false });
    expect(text()).not.toContain("Assignee");
    expect(text()).not.toContain("Dine In");
  });

  it("no longer draws a logo, barcode or QR code", () => {
    renderPreview({ show_logo: true, show_barcode: true, show_qr_code: true });
    expect(container.querySelector("svg.lucide-barcode")).toBeNull();
    expect(container.querySelector("svg.lucide-qr-code")).toBeNull();
  });
});
