function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseSupportAssigneeEmails(raw: string): string[] {
  const seen = new Set<string>();

  return raw
    .split(/[,\n;]/)
    .map((email) => email.trim())
    .filter((email) => {
      const normalized = email.toLowerCase();
      if (!isValidEmail(email) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function validateSupportAssigneeSelection(
  requestedEmails: string[],
  configuredEmailsRaw: string,
): string[] {
  const configuredEmails = parseSupportAssigneeEmails(configuredEmailsRaw);
  const configuredByNormalized = new Map(
    configuredEmails.map((email) => [email.toLowerCase(), email]),
  );
  const selected = new Set<string>();

  for (const requestedEmail of requestedEmails) {
    const normalized = requestedEmail.trim().toLowerCase();
    const configuredEmail = configuredByNormalized.get(normalized);

    if (!configuredEmail) {
      throw new Error(
        `${requestedEmail || "Empty assignee"} is not a configured support assignee`,
      );
    }

    selected.add(configuredEmail);
  }

  return [...selected];
}
