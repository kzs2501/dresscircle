// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientIpHeaderFrom, clientKeyOf } from "./client-key";

describe("the client's key", () => {
  it("names the header Vercel sets, or the one the deployment trusts", () => {
    expect(clientIpHeaderFrom({})).toBeNull();
    expect(clientIpHeaderFrom({ VERCEL: "1" })).toBe("x-forwarded-for");
    expect(clientIpHeaderFrom({ VERCEL: "1", TRUSTED_CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("cf-connecting-ip");
    expect(clientIpHeaderFrom({ TRUSTED_CLIENT_IP_HEADER: "" })).toBeNull();
  });

  it("takes the first address, the client's own, from a proxy's list", () => {
    const request = new Request("http://dresscircle.test/", {
      headers: { "x-forwarded-for": "203.0.113.70, 10.0.0.1" },
    });
    expect(clientKeyOf(request, "x-forwarded-for")).toBe("ip:203.0.113.70");
    expect(clientKeyOf(request, null)).toBeNull();
    expect(clientKeyOf(new Request("http://dresscircle.test/"), "x-forwarded-for")).toBeNull();
  });
});
