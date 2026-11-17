/**
 * The organisers' API, as the dashboard calls it. Every call carries the session's
 * bearer token; a 401 means the session is over, so the token is forgotten and the
 * dashboard goes back to signing in.
 */
import * as z from "@/core/zod";
import type { RefundReason } from "@/core/statuses";
import type { OrderPageDto } from "@/contract/dto";
import {
  accountDtoSchema,
  doorListDtoSchema,
  orderPageDtoSchema,
  organiserEventDtoSchema,
  organiserOrderDtoSchema,
  refundResultDtoSchema,
  salesMetricsDtoSchema,
  sessionDtoSchema,
} from "@/contract/dto";
import { writeOrderSearchParams, type OrderFilters } from "@/contract/queries";
import { API_ROUTES, AUTHORIZATION_HEADER, buildApiPath, IDEMPOTENCY_KEY_HEADER } from "@/contract/routes";
import { post, problemOf, request, requestFile } from "./api-client";
import { readOrganiserToken, saveOrganiserToken } from "./organiser-session";

/** The session's token, as headers; none if signed out (and the server will say 401). */
export function authorization(): Record<string, string> {
  const token = readOrganiserToken();
  return token ? { [AUTHORIZATION_HEADER]: `Bearer ${token}` } : {};
}

async function asOrganiser<T>(call: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  try {
    return await call(authorization());
  } catch (error) {
    if (problemOf(error)?.code === "unauthenticated") saveOrganiserToken(null);
    throw error;
  }
}

const withQuery = (path: string, params: URLSearchParams) => (params.size ? `${path}?${params.toString()}` : path);

/** The most pages a refund batch's reading takes: 2,000 orders, at 100 a page. */
export const MAX_PAGES_READ = 20;

export const organiserApi = {
  signIn: (accountId: string) => post(buildApiPath(API_ROUTES.session, {}), sessionDtoSchema, { accountId }),
  signOut: () =>
    fetch(buildApiPath(API_ROUTES.session, {}), { method: "DELETE", headers: authorization() }).catch(() => undefined),
  getAccount: () =>
    asOrganiser((headers) => request(buildApiPath(API_ROUTES.organiserAccount, {}), accountDtoSchema, { headers })),
  listEvents: () =>
    asOrganiser((headers) =>
      request(buildApiPath(API_ROUTES.organiserEvents, {}), z.array(organiserEventDtoSchema), { headers }),
    ),
  /** The codes of an event's refunded tickets, for its door scanner. */
  getDoorList: (eventSlug: string) =>
    asOrganiser((headers) =>
      request(buildApiPath(API_ROUTES.organiserDoor, { slug: eventSlug }), doorListDtoSchema, { headers }),
    ),
  getMetrics: (eventSlug?: string) =>
    asOrganiser((headers) =>
      request(
        withQuery(
          buildApiPath(API_ROUTES.organiserMetrics, {}),
          new URLSearchParams(eventSlug ? { event: eventSlug } : {}),
        ),
        salesMetricsDtoSchema,
        { headers },
      ),
    ),
  listOrders: (filters: OrderFilters, pageToken?: string) =>
    asOrganiser((headers) =>
      request(
        withQuery(
          buildApiPath(API_ROUTES.organiserOrders, {}),
          writeOrderSearchParams(filters, pageToken === undefined ? { pageSize: 100 } : { pageSize: 100, pageToken }),
        ),
        orderPageDtoSchema,
        { headers },
      ),
    ),
  /** How many orders match, for a sentence that says so: one row asked for, and the total read. */
  countOrders: (filters: OrderFilters) =>
    asOrganiser((headers) =>
      request(
        withQuery(buildApiPath(API_ROUTES.organiserOrders, {}), writeOrderSearchParams(filters, { pageSize: 1 })),
        orderPageDtoSchema,
        { headers },
      ),
    ).then((page) => page.totalSize),
  /**
   * Every order a refund batch could cover, page by page, stopping once more than a batch
   * may hold (`maxRows`) would count: orders the batch leaves out (already refunding, or
   * of an event this account can't refund) don't use up the allowance (DC-11). Never more
   * than `MAX_PAGES_READ` pages, however few count. `hasMore` says there were more than
   * were read.
   */
  listOrdersUpTo: async (
    filters: OrderFilters,
    maxRows: number,
    counts: (row: OrderPageDto["orders"][number]) => boolean = () => true,
  ) => {
    const rows: OrderPageDto["orders"] = [];
    let counted = 0;
    let pages = 0;
    let pageToken: string | undefined;
    do {
      const page = await organiserApi.listOrders(filters, pageToken);
      rows.push(...page.orders);
      counted += page.orders.filter(counts).length;
      pages += 1;
      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken !== undefined && counted <= maxRows && pages < MAX_PAGES_READ);
    return { rows, hasMore: pageToken !== undefined };
  },
  getOrder: (orderId: string) =>
    asOrganiser((headers) =>
      request(buildApiPath(API_ROUTES.organiserOrder, { orderId }), organiserOrderDtoSchema, { headers }),
    ),
  requestRefund: (orderId: string, reason: RefundReason, idempotencyKey: string) =>
    asOrganiser((headers) =>
      post(
        buildApiPath(API_ROUTES.organiserRefunds, { orderId }),
        refundResultDtoSchema,
        { reason },
        {
          ...headers,
          [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
        },
      ),
    ),
  exportOrders: (filters: OrderFilters) =>
    asOrganiser((headers) =>
      requestFile(withQuery(buildApiPath(API_ROUTES.organiserOrdersExport, {}), writeOrderSearchParams(filters)), {
        headers,
      }),
    ),
};
