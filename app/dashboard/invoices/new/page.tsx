"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "../components/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link href="/dashboard/invoices">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Invoices
        </Link>
      </Button>

      {/* Heading */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Create New Invoice</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fill in the details below to create a new invoice.
        </p>
      </div>

      <InvoiceForm />
    </div>
  );
}
