interface BatchRef {
  id: string
  merchant_id: string
}

export interface BatchTerminalLink extends BatchRef {
  payment_terminal_id: string | null
}

export interface TerminalRecord {
  id: string
  merchant_id: string
  terminal_name: string | null
  serial_number: string | null
}

export function attachBatchTerminalIdentity<T extends BatchRef>(
  batches: readonly T[],
  links: readonly BatchTerminalLink[],
  terminals: readonly TerminalRecord[],
): (T & { payment_terminal_id?: string; terminal_name?: string; terminal_serial?: string })[] {
  const linksById = new Map(links.map((link) => [link.id, link]))
  const terminalsById = new Map(terminals.map((terminal) => [terminal.id, terminal]))

  return batches.map((batch) => {
    const link = linksById.get(batch.id)
    if (!link || link.merchant_id !== batch.merchant_id || !link.payment_terminal_id) return batch

    const terminal = terminalsById.get(link.payment_terminal_id)
    if (!terminal || terminal.merchant_id !== batch.merchant_id) {
      return { ...batch, payment_terminal_id: link.payment_terminal_id }
    }

    return {
      ...batch,
      payment_terminal_id: terminal.id,
      terminal_name: terminal.terminal_name || undefined,
      terminal_serial: terminal.serial_number || undefined,
    }
  })
}
