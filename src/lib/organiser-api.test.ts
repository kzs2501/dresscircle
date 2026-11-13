import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderPageDto } from "@/contract/dto";
import { DEFAULT_ORDER_BY } from "@/contract/queries";
import { organiserApi } from "./organiser-api";

const FILTERS = { status: ["fulfilled" as const], orderBy: DEFAULT_ORDER_BY };
const page = (count: number, nextPageToken: string | null): OrderPageDto => ({
  orders: Array.from(
    { length: count },
    (_, index) => ({ id: `ord_${String(index)}` }) as OrderPageDto["orders"][number],
  ),
  nextPageToken,
  totalSize: 0,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reading every order a batch could cover", () => {
  it("reads page after page until the last", async () => {
    const list = vi
      .spyOn(organiserApi, "listOrders")
      .mockResolvedValueOnce(page(100, "p2"))
      .mockResolvedValueOnce(page(40, null));
    const result = await organiserApi.listOrdersUpTo(FILTERS, 500);
    expect(result.rows).toHaveLength(140);
    expect(result.hasMore).toBe(false);
    expect(list).toHaveBeenNthCalledWith(2, FILTERS, "p2");
  });

  it("stops once past the most a batch may hold, and says there were more", async () => {
    const list = vi
      .spyOn(organiserApi, "listOrders")
      .mockImplementation((_, token) => Promise.resolve(page(100, `after-${token ?? "start"}`)));
    const result = await organiserApi.listOrdersUpTo(FILTERS, 250);
    expect(result.rows).toHaveLength(300);
    expect(result.hasMore).toBe(true);
    expect(list).toHaveBeenCalledTimes(3);
  });
});
