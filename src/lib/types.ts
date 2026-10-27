export type TicketStatus = "open" | "completed" | "sent" | "paid";

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
  "Access control",
  "Cybersecurity",
  "IT training",
  "Email creation",
  "Email password reset",
  "User password reset",
] as const;

export function isServiceType(kind: string | null | undefined): kind is string {
  return (SERVICE_TYPES as readonly string[]).includes(kind ?? "");
}

/** Types for special projects; a project can have several, stored in `kind` joined by KIND_SEPARATOR. */
export const PROJECT_TYPES = [
  "Structured Cabling Rollout",
  "MDF / IDF Server Room Clean-Up",
  "Rack-Mount Server Deployment",
  "Server Installation",
  "Domain Controller and DNS setup",
  "WIFI Access Points",
  "Access Control Hardware",
  "Structured Cabling Repairs",
  "NVR Setup",
  "Surveillance Cameras",
  "VoIP Phones System",
  "Router Setup",
  "VPN Point to Point",
  "Patch Panel Termination",
  "Port Termination",
  "Port Face plate",
  "Fiber Optics Repairs",
  "Fiber Optic runs",
  "Fiber Optic Termination",
] as const;

const KIND_SEPARATOR = "; ";

export function projectKinds(kind: string | null | undefined): string[] {
  return (kind ?? "").split(KIND_SEPARATOR).filter((k) => (PROJECT_TYPES as readonly string[]).includes(k));
}

/** Store one service type, or any number of project types; anything else is dropped. */
export function kindValue(kinds: string[]): string {
  if (kinds.length === 1 && isServiceType(kinds[0])) return kinds[0];
  return projectKinds(kinds.join(KIND_SEPARATOR)).join(KIND_SEPARATOR);
}

/** The job's type(s) for display, or "" for none (including the old Service/Install/... values). */
export function kindLabel(kind: string | null | undefined): string {
  return isServiceType(kind) ? kind : projectKinds(kind).join(", ");
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  completed: "Closed",
  sent: "Sent to customer",
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
  created_by: string | null;
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
  service_location: string;
};

/** Where the work was done, chosen next to the signature. "" means not chosen yet. */
export const SERVICE_LOCATIONS = { remote: "Remote", onsite: "On-site" } as const;
export type ServiceLocation = keyof typeof SERVICE_LOCATIONS;

/** Every job for a contract client is a service call; for an hourly client, a service ticket. */
/** How a job is billed: special projects are always by the hour, whatever the client type. */
export function billingType(clientType: ClientType | null | undefined, isProject: boolean): ClientType {
  return isProject ? "hourly" : (clientType ?? "hourly");
}

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

/** Expense categories for the owner's Expenses page. The label itself is what gets saved. */
export const EXPENSE_CATEGORIES = [
  "Parts and hardware",
  "Software and subscriptions",
  "Tools and equipment",
  "Fuel and vehicle",
  "Office supplies",
  "Shipping",
  "Mobile phone",
  "Phone and internet",
  "Meals",
  "Travel",
  "Training",
  "Other",
] as const;

export const PAYMENT_METHODS = [
  "Swiftnet IT account",
  "Credit Card Swiftnet",
  "Debit Card David US",
  "Debit Card David SXM",
  "Debit Card Daniel SXM",
  "Cash",
  "Bank transfer",
] as const;

export type Expense = {
  id: string;
  spent_on: string;
  vendor: string;
  category: string;
  description: string;
  amount_cents: number;
  tax_cents: number;
  payment_method: string;
  receipt: string | null;
  bill_client_id: string | null;
  markup_pct: number;
  charged: boolean;
  created_at: string;
};

/** One item on an expense's invoice, which can be charged to a customer with a markup. */
export type ExpenseItem = {
  id: string;
  expense_id: string;
  description: string;
  amount_cents: number;
  bill_client_id: string | null;
  markup_pct: number;
  charged: boolean;
};

/** What the customer pays for an item bought to resell: the cost plus the markup. */
export function resaleCents(amountCents: number, markupPct: number): number {
  return Math.round((amountCents * (100 + markupPct)) / 100);
}

export const RENEWAL_KINDS = [
  "Microsoft 365 / Office 365",
  "Antivirus",
  "Cybersecurity software",
  "Backup service",
  "Firewall subscription",
  "Software license",
  "Domain",
  "Website hosting",
  "SSL certificate",
  "Warranty",
  "Contract",
  "Other",
] as const;

/** How often a renewal comes back, in months; 0 is only once. */
export const RENEWAL_REPEATS: [number, string][] = [
  [12, "Every year"],
  [1, "Every month"],
  [3, "Every 3 months"],
  [24, "Every 2 years"],
  [36, "Every 3 years"],
  [0, "Only once"],
];

export type Renewal = {
  id: string;
  client_id: string | null;
  kind: string;
  name: string;
  due_on: string;
  repeat_months: number;
  cost_cents: number;
  notes: string;
};
