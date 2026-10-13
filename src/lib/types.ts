export type TicketStatus = "open" | "completed" | "paid";

/** The Type dropdown on service tickets and calls. The label itself is what gets saved. */
export const SERVICE_TYPES = [
  "Tiered technical support",
  "Account and access management",
  "Hardware and software troubleshooting",
  "Network setup and maintenance",
  "Wi-Fi and connectivity support",
  "VoIP communication systems",
  "Threat monitoring",
  "Data backup and disaster recovery",
  "Compliance management",
  "Cloud computing support",
  "Software installation and updates",
  "Hardware lifecycle management",
  "IT roadmapping",
  "Software installation",
  "Hardware installation",
] as const;

export function isServiceType(kind: string | null | undefined): kind is string {
  return (SERVICE_TYPES as readonly string[]).includes(kind ?? "");
}

/** The ticket's service type, or "" for none (including the old Service/Install/... values). */
export function kindLabel(kind: string | null | undefined): string {
  return isServiceType(kind) ? kind : "";
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  completed: "Closed",
  paid: "Paid",
};

export type Settings = {
  company_name: string;
  company_phone: string;
  company_email: string;
  company_address: string;
  currency: string;
  hourly_rate_cents: number;
  tax_rate_pct: number;
  tax_labor: boolean;
  rounding_minutes: number;
  minimum_minutes: number;
  terms: string;
  disclaimer: string;
};

export type ClientType = "hourly" | "contract";

export const CLIENT_TYPES: ClientType[] = ["hourly", "contract"];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  hourly: "Hourly",
  contract: "Contract",
};

export type Client = {
  id: string;
  name: string;
  client_type: ClientType;
  /** What a contract client pays per month, for the records. Not added to service tickets. */
  monthly_fee_cents: number;
  phone: string;
  email: string;
  address: string;
};

export type Ticket = {
  id: string;
  number: number;
  client_id: string;
  technician_id: string | null;
  ticket_date: string;
  kind: string;
  is_estimate: boolean;
  status: TicketStatus;
  item_to_service: string;
  make: string;
  model: string;
  machine_name: string;
  is_project: boolean;
  contacted_by: string;
  serial: string;
  service_request: string;
  labor_performed: string;
  date_wanted: string | null;
  deposit_cents: number;
  hourly_rate_cents: number;
  tax_rate_pct: number;
  tax_labor: boolean;
  rounding_minutes: number;
  minimum_minutes: number;
  signature: string | null;
  signed_name: string | null;
  signed_at: string | null;
};

/** Every job for a contract client is a service call; for an hourly client, a service ticket. */
export function recordLabel(clientType: ClientType | null | undefined, isProject = false): string {
  if (isProject) return "Special Project";
  return clientType === "contract" ? "Service Call" : "Service Ticket";
}

export type TimeEntryRow = {
  id: string;
  technician_id: string | null;
  started_at: string;
  ended_at: string | null;
};

export type PartRow = {
  id: string;
  qty: number;
  part_number: string;
  description: string;
  unit_price_cents: number;
};

/** Time is billed in whole hours, and any visit is at least one hour. */
export const BILLING_BLOCK_MINUTES = 60;

/** Billing rules for a ticket. Service calls (contract clients) aren't charged for time; it is only tracked. */
export function rulesOf(
  t: Pick<Ticket, "hourly_rate_cents" | "tax_labor">,
  clientType: ClientType = "hourly",
) {
  const contract = clientType === "contract";
  return {
    hourlyRateCents: contract ? 0 : t.hourly_rate_cents,
    // No tax is charged on service tickets, even on older tickets that stored a rate.
    taxRatePct: 0,
    taxLabor: t.tax_labor,
    // Service tickets: whole hours with a one-hour minimum. Service calls: actual minutes.
    roundingMinutes: contract ? 1 : BILLING_BLOCK_MINUTES,
    minimumMinutes: contract ? 0 : BILLING_BLOCK_MINUTES,
  };
}
