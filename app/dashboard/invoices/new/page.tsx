"use client";

import { PageShell, PageHeader } from "@/components/dashboard/shell";
import { InvoiceForm } from "../components/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <PageShell width="narrow">
      <PageHeader
        backHref="/dashboard/invoices"
        backLabel="Invoices"
        title="Create New Invoice"
        subtitle="Fill in the details below to create a new invoice."
      />
      <InvoiceForm />
    </PageShell>
  );
}
