import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/valor/passage-callback/route";

describe("Valor Passage form callback", () => {
  it("returns no content so native form submission does not replace checkout", async () => {
    const [postResponse, getResponse] = await Promise.all([POST(), GET()]);

    expect(postResponse.status).toBe(204);
    expect(getResponse.status).toBe(204);
    expect(await postResponse.text()).toBe("");
  });
});
