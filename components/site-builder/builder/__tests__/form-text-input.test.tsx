// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormTextInput as TextInput } from "../FormTextInput";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe("FormBuilder TextInput", () => {
  it("keeps blank and trailing-space drafts editable while committing only valid text", () => {
    const commits = vi.fn<(value: string) => void>();

    function Harness() {
      const [value, setValue] = useState("Full name");
      return (
        <TextInput
          label="Question"
          value={value}
          onChange={(next) => {
            commits(next);
            setValue(next.trim());
          }}
        />
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => root.render(<Harness />));

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    if (!input) return;

    const type = (next: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    act(() => input.focus());
    act(() => type(""));
    expect(input.value).toBe("");
    expect(commits).not.toHaveBeenCalled();

    act(() => type("New "));
    expect(input.value).toBe("New ");
    expect(commits).toHaveBeenLastCalledWith("New ");

    act(() => type("New question"));
    expect(input.value).toBe("New question");
    expect(commits).toHaveBeenLastCalledWith("New question");
  });
});
