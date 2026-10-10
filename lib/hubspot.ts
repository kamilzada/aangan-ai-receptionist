/**
 * HubSpot (free CRM) over the v3 REST API, server-side only.
 * Free plan: 10 custom properties for the whole account and one deal pipeline. So:
 * - 5 custom properties on Calls (CALL_PROPS) + 1 on Contacts (aangan_locality) = 6 of 10.
 * - Deals go in the default "Sales Pipeline" at the built-in "Appointment scheduled" stage.
 * - Designers aren't HubSpot users (free plan has 2 seats), so the deal name carries the designer.
 * Create the properties once with `npm run hubspot:setup`.
 */

const API = "https://api.hubapi.com";

export function hubspotEnabled(): boolean {
  return !!process.env.HUBSPOT_PRIVATE_APP_TOKEN;
}

export async function hs<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new HubSpotError(res.status, `HubSpot ${method} ${path} failed: ${res.status} ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export class HubSpotError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** HUBSPOT_DEFINED association type ids. */
const ASSOC = { callToContact: 194, callToDeal: 206, dealToContact: 3 };
const assoc = (id: string, typeId: number) => ({
  to: { id },
  types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }],
});

export const CALL_PROPS = {
  aangan_call_type: { label: "Aangan · call type", type: "string", fieldType: "text" },
  aangan_outcome: { label: "Aangan · outcome", type: "string", fieldType: "text" },
  aangan_decline_reason: { label: "Aangan · decline reason", type: "string", fieldType: "text" },
  aangan_after_hours: { label: "Aangan · after hours", type: "enumeration", fieldType: "booleancheckbox" },
  aangan_vaani_call_id: { label: "Aangan · Vaani call id", type: "string", fieldType: "text" },
} as const;
export const CONTACT_PROPS = {
  aangan_locality: { label: "Aangan · locality", type: "string", fieldType: "text" },
} as const;

type SearchResult<P> = { total: number; results: { id: string; properties: P }[]; paging?: { next?: { after: string } } };

export async function findCallByVaaniId(vaaniCallId: string): Promise<string | null> {
  const r = await hs<SearchResult<unknown>>("POST", "/crm/v3/objects/calls/search", {
    filterGroups: [{ filters: [{ propertyName: "aangan_vaani_call_id", operator: "EQ", value: vaaniCallId }] }],
    limit: 1,
  });
  return r.results[0]?.id ?? null;
}

function splitName(name: string): { firstname?: string; lastname?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") || undefined };
}

/** Finds the contact by phone (E.164) and fills in anything new; creates it if missing. */
export async function upsertContactByPhone(c: { phone: string; name?: string; email?: string; locality?: string }): Promise<string> {
  const props: Record<string, string> = { phone: c.phone };
  Object.assign(props, splitName(c.name ?? ""));
  if (c.email) props.email = c.email;
  if (c.locality) props.aangan_locality = c.locality;
  for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k];

  const found = await hs<SearchResult<unknown>>("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [
      { filters: [{ propertyName: "phone", operator: "EQ", value: c.phone }] },
      { filters: [{ propertyName: "mobilephone", operator: "EQ", value: c.phone }] },
    ],
    limit: 1,
  });
  const id = found.results[0]?.id;
  if (id) {
    await hs("PATCH", `/crm/v3/objects/contacts/${id}`, { properties: props }).catch(async (err) => {
      // An email already used by another contact makes the whole update fail; retry without it.
      if (err instanceof HubSpotError && err.status === 409 && props.email) {
        delete props.email;
        await hs("PATCH", `/crm/v3/objects/contacts/${id}`, { properties: props });
      } else throw err;
    });
    return id;
  }
  try {
    return (await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: props })).id;
  } catch (err) {
    if (err instanceof HubSpotError && err.status === 409 && props.email) {
      delete props.email;
      return (await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: props })).id;
    }
    throw err;
  }
}

export async function createDeal(d: { name: string; contactId?: string; description: string; closeDate?: Date }): Promise<string> {
  const r = await hs<{ id: string }>("POST", "/crm/v3/objects/deals", {
    properties: {
      dealname: d.name,
      pipeline: process.env.HUBSPOT_PIPELINE_ID || "default",
      dealstage: process.env.HUBSPOT_DEALSTAGE_ID || "appointmentscheduled",
      description: d.description,
      ...(d.closeDate ? { closedate: d.closeDate.toISOString() } : {}),
    },
    associations: d.contactId ? [assoc(d.contactId, ASSOC.dealToContact)] : [],
  });
  return r.id;
}

export type CallRecord = {
  vaaniCallId: string;
  title: string;
  body: string;
  startedAt: Date;
  durationSec: number;
  fromNumber?: string;
  recordingUrl?: string;
  callType: string;
  outcome: string;
  declineReason: string;
  afterHours: boolean;
  contactId?: string;
  dealId?: string;
};

export async function createCall(c: CallRecord): Promise<string> {
  const associations = [
    ...(c.contactId ? [assoc(c.contactId, ASSOC.callToContact)] : []),
    ...(c.dealId ? [assoc(c.dealId, ASSOC.callToDeal)] : []),
  ];
  const r = await hs<{ id: string }>("POST", "/crm/v3/objects/calls", {
    properties: {
      hs_timestamp: c.startedAt.toISOString(),
      hs_call_title: c.title,
      hs_call_body: c.body,
      hs_call_direction: "INBOUND",
      hs_call_status: "COMPLETED",
      hs_call_duration: String(c.durationSec * 1000),
      ...(c.fromNumber ? { hs_call_from_number: c.fromNumber } : {}),
      ...(c.recordingUrl ? { hs_call_recording_url: c.recordingUrl } : {}),
      aangan_vaani_call_id: c.vaaniCallId,
      aangan_call_type: c.callType,
      aangan_outcome: c.outcome,
      aangan_decline_reason: c.declineReason,
      aangan_after_hours: c.afterHours ? "true" : "false",
    },
    associations,
  });
  return r.id;
}

export type CallRow = {
  id: string;
  at: string;
  title: string;
  fromNumber: string;
  durationSec: number;
  callType: string;
  outcome: string;
  declineReason: string;
  afterHours: boolean;
};

/** Every AI-handled call since `since` (newest first), for the dashboard. */
export async function listAiCalls(since: Date, max = 2000): Promise<CallRow[]> {
  type P = Record<string, string | null>;
  const out: CallRow[] = [];
  let after: string | undefined;
  do {
    const r = await hs<SearchResult<P>>("POST", "/crm/v3/objects/calls/search", {
      filterGroups: [
        {
          // Filter on the date only: HubSpot's search index sometimes lags on custom properties,
          // so receptionist calls are picked out below by their Vaani call id.
          filters: [{ propertyName: "hs_timestamp", operator: "GTE", value: String(since.getTime()) }],
        },
      ],
      sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
      properties: ["hs_timestamp", "hs_call_title", "hs_call_from_number", "hs_call_duration", ...Object.keys(CALL_PROPS)],
      limit: 200,
      ...(after ? { after } : {}),
    });
    for (const { id, properties: p } of r.results) {
      if (!p.aangan_vaani_call_id) continue;
      out.push({
        id,
        at: p.hs_timestamp ?? "",
        title: p.hs_call_title ?? "",
        fromNumber: p.hs_call_from_number ?? "",
        durationSec: Math.round(Number(p.hs_call_duration ?? 0) / 1000),
        callType: p.aangan_call_type ?? "other",
        outcome: p.aangan_outcome ?? "no_booking",
        declineReason: p.aangan_decline_reason ?? "none",
        afterHours: p.aangan_after_hours === "true",
      });
    }
    after = r.paging?.next?.after;
  } while (after && out.length < max);
  return out;
}
