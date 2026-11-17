import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "@/lib/api-client";
import { failureOf } from "./assistant";

describe("why an answer's numbers couldn't be read (DC-05)", () => {
  it("gives the server's reason when it refused, and blames the connection only when that failed", () => {
    const refused = new ApiError({
      type: "https://dresscircle.test/problems/invalid-request",
      title: "Invalid request",
      status: 422,
      detail: "The period ends before it starts.",
      code: "invalid_request",
    });
    expect(failureOf(refused)).toBe("The server couldn’t answer this: The period ends before it starts.");
    expect(failureOf(new NetworkError("Couldn’t reach the server."))).toBe(
      "Couldn’t load the numbers for this. Check your connection and ask again.",
    );
  });
});
