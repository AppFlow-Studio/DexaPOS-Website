import { describe, expect, it } from "vitest";

import {
  buildFormNotificationMessage,
  isNotificationState,
  submissionRecordFromRow,
} from "../forms/notification";

describe("form notification email", () => {
  it("escapes merchant labels and public answers at the email boundary", () => {
    const message = buildFormNotificationMessage({
      formName: "Catering\r\nBcc: attacker@example.test <script>",
      receivedAt: "2026-08-20T12:00:00.000Z",
      record: {
        contact: { name: null, email: null, phone: null, address: null },
        answers: [
          {
            fieldId: "name",
            label: '<img src=x onerror="alert(1)">',
            kind: "name",
            value: "A & B <script>alert('x')</script>",
          },
        ],
      },
    });

    expect(message.subject).not.toContain("\n");
    expect(message.subject).not.toContain("\r");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(message.html).toContain("A &amp; B &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });

  it("reconstructs a stored response for a retry without trusting its shape", () => {
    expect(
      submissionRecordFromRow({
        contact_name: "Sam",
        contact_email: "sam@example.test",
        contact_phone: 123,
        answers: [
          { fieldId: "choice", label: "Choose", kind: "multiple-choice", value: "A, B", values: ["A", "B"] },
          null,
        ],
      }),
    ).toEqual({
      contact: { name: "Sam", email: "sam@example.test", phone: null, address: null },
      answers: [
        { fieldId: "choice", label: "Choose", kind: "multiple-choice", value: "A, B", values: ["A", "B"] },
      ],
    });
  });

  it("accepts only the closed delivery-state vocabulary", () => {
    expect(isNotificationState("failed")).toBe(true);
    expect(isNotificationState("sending")).toBe(true);
    expect(isNotificationState("retrying-again")).toBe(false);
    expect(isNotificationState(null)).toBe(false);
  });
});
