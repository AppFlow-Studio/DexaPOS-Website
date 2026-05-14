import type { SubscriptionInvoiceDocumentData } from './invoice-template'
import { formatLongDate, formatUsd } from './invoice-template'

function fileSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildSubscriptionInvoiceFilename(document: SubscriptionInvoiceDocumentData, extension: 'pdf' | 'html' = 'pdf'): string {
  const base =
    document.invoiceNumber?.trim() ||
    `${document.title}-${document.toParty.lines[0] || 'subscription-invoice'}`

  return `${fileSafe(base)}.${extension}`
}

export async function downloadSubscriptionInvoicePdf(document: SubscriptionInvoiceDocumentData): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const autoTable = autoTableModule.default
  const pdf = new jsPDF({
    unit: 'pt',
    format: 'letter',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const marginX = 42
  let cursorY = 48

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(26)
  pdf.text(document.title, marginX, cursorY)

  if (document.statusLabel) {
    pdf.setFontSize(10)
    const badgeText = document.statusLabel.toUpperCase()
    const badgeWidth = pdf.getTextWidth(badgeText) + 18
    const badgeX = pageWidth - marginX - badgeWidth
    pdf.roundedRect(badgeX, 30, badgeWidth, 22, 11, 11)
    pdf.text(badgeText, badgeX + 9, 45)
  }

  cursorY += 24
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)

  const metaRows = [
    document.invoiceNumber ? `Invoice number: ${document.invoiceNumber}` : null,
    document.issuedOn ? `Date of issue: ${formatLongDate(document.issuedOn)}` : null,
    document.dueDate ? `Date due: ${formatLongDate(document.dueDate)}` : null,
  ].filter(Boolean) as string[]

  metaRows.forEach((row) => {
    pdf.text(row, marginX, cursorY)
    cursorY += 14
  })

  cursorY += 10
  pdf.setFont('helvetica', 'bold')
  pdf.text(document.fromParty.title, marginX, cursorY)
  pdf.text(document.toParty.title, pageWidth / 2, cursorY)

  pdf.setFont('helvetica', 'normal')
  cursorY += 14

  const fromLines = document.fromParty.lines.filter(Boolean)
  const toLines = document.toParty.lines.filter(Boolean)
  const maxPartyLines = Math.max(fromLines.length, toLines.length)

  for (let index = 0; index < maxPartyLines; index += 1) {
    if (fromLines[index]) pdf.text(fromLines[index], marginX, cursorY)
    if (toLines[index]) pdf.text(toLines[index], pageWidth / 2, cursorY)
    cursorY += 13
  }

  cursorY += 18
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(document.summaryTitle, marginX, cursorY)

  cursorY += 16

  autoTable(pdf, {
    startY: cursorY,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: '#111827',
      cellPadding: { top: 8, right: 0, bottom: 8, left: 0 },
      lineColor: '#e5e7eb',
      lineWidth: 0.5,
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: '#4b5563',
      fontSize: 9,
      lineColor: '#d1d5db',
      lineWidth: 0.7,
    },
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: (document.lineItems.length ? document.lineItems : [
      {
        description: 'No billable line items',
        periodLabel: '',
        quantity: 0,
        unitPrice: 0,
        amount: 0,
      },
    ]).map((item) => [
      item.periodLabel ? `${item.description}\n${item.periodLabel}` : item.description,
      item.quantity ? String(item.quantity) : '-',
      item.quantity ? formatUsd(item.unitPrice) : '-',
      item.quantity ? formatUsd(item.amount) : '-',
    ]),
    columnStyles: {
      0: { cellWidth: 290 },
      1: { halign: 'center', cellWidth: 48 },
      2: { halign: 'right', cellWidth: 90 },
      3: { halign: 'right', cellWidth: 90 },
    },
  })

  cursorY = (pdf as any).lastAutoTable.finalY + 24
  const totalsX = pageWidth - marginX - 230

  pdf.setFontSize(10)
  const totalsRows = [
    document.subtotal !== null ? ['Subtotal', formatUsd(document.subtotal)] : null,
    document.surcharge && document.surcharge > 0 ? ['Card surcharge', formatUsd(document.surcharge)] : null,
    document.total !== null ? ['Total', formatUsd(document.total)] : null,
    document.finalAmountValue !== null && document.finalAmountValue !== undefined
      ? [document.finalAmountLabel || 'Amount due', formatUsd(document.finalAmountValue)]
      : null,
  ].filter(Boolean) as Array<[string, string]>

  totalsRows.forEach(([label, value], index) => {
    const isFinal = index === totalsRows.length - 1
    pdf.setFont('helvetica', isFinal ? 'bold' : 'normal')
    pdf.text(label, totalsX, cursorY)
    pdf.text(value, pageWidth - marginX, cursorY, { align: 'right' })
    cursorY += isFinal ? 18 : 14
  })

  if (document.footerNote) {
    cursorY += 12
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const noteLines = pdf.splitTextToSize(document.footerNote, pageWidth - marginX * 2)
    pdf.text(noteLines, marginX, cursorY)
  }

  pdf.save(buildSubscriptionInvoiceFilename(document, 'pdf'))
}

