// Anti-pattern: six bespoke read tools exposed to the model (limit is 5).
export const tools = [
  { name: "get_user" },
  { name: "list_orders" },
  { name: "fetch_invoice" },
  { name: "find_customer" },
  { name: "search_tickets" },
  { name: "read_inventory" },
];
