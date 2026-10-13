export type TicketKind = "service" | "install" | "will_call" | "deliver";
export type TicketStatus = "open" | "completed" | "paid";

export const KIND_LABELS: Record<TicketKind, string> = {
  service: "Service",
  install: "Install",
  will_call: "Will call",
  deliver: "Deliver",
};

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

export type Client = {
  id: string;
  name: string;
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
  kind: TicketKind;
  is_estimate: boolean;
  status: TicketStatus;
  item_to_service: string;
  make: string;
  model: string;
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

export function rulesOf(t: Pick<Ticket, "hourly_rate_cents" | "tax_rate_pct" | "tax_labor" | "rounding_minutes" | "minimum_minutes">) {
  return {
    hourlyRateCents: t.hourly_rate_cents,
    taxRatePct: Number(t.tax_rate_pct),
    taxLabor: t.tax_labor,
    roundingMinutes: t.rounding_minutes,
    minimumMinutes: t.minimum_minutes,
  };
}
