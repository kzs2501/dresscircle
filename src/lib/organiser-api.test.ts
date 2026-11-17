import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderPageDto } from "@/contract/dto";
import { DEFAULT_ORDER_BY } from "@/contract/queries";
import { organiserApi } from "./organiser-api";

type OrderRow = OrderPageDto["orders"][number];
const FILTERS = { status: ["fulfilled" as const], orderBy: DEFAULT_ORDER_BY };
const page = (count: number, nextPageToken: string | null, fields: Partial<OrderRow> = {}): OrderPageDto => ({
  orders: Array.from({ length: count }, (_, index) => ({ id: `ord_${String(index)}`, ...fields }) as OrderRow),
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

  it("counts only the orders a batch would hold, so ones it leaves out don't make it too many (DC-11)", async () => {
    const pages = [
      page(100, "p2", { refundStatus: "pending" }),
      page(100, "p3", { refundStatus: "pending" }),
      ...[3, 4, 5, 6].map((n) => page(100, `p${String(n + 1)}`)),
      page(50, null),
    ];
    const list = vi.spyOn(organiserApi, "listOrders");
    for (const next of pages) list.mockResolvedValueOnce(next);
    const result = await organiserApi.listOrdersUpTo(FILTERS, 500, (row) => row.refundStatus !== "pending");
    expect(result.rows).toHaveLength(650);
    expect(result.hasMore).toBe(false);
  });

  it("reads at most twenty pages, however few of them count", async () => {
    const list = vi
      .spyOn(organiserApi, "listOrders")
      .mockImplementation((_, token) => Promise.resolve(page(100, `after-${token ?? "start"}`)));
    const result = await organiserApi.listOrdersUpTo(FILTERS, 500, () => false);
    expect(list).toHaveBeenCalledTimes(20);
    expect(result.hasMore).toBe(true);
  });
});
