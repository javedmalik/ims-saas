export const UserRole = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
  CASHIER: "CASHIER",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PERMISSIONS = {
  VIEW_DASHBOARD: [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.CASHIER,
  ],

  MAKE_SALE: [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.CASHIER,
  ],

  CANCEL_SALE: [UserRole.ADMIN, UserRole.MANAGER],

  MANAGE_PURCHASES: [UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF],

  MANAGE_CATALOG: [UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF],

  MANAGE_CUSTOMERS: [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.STAFF,
    UserRole.CASHIER,
  ],

  MANAGE_SUPPLIERS: [UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF],

  VIEW_REPORTS: [UserRole.ADMIN, UserRole.MANAGER],

  MANAGE_USERS: [UserRole.ADMIN],

  MANAGE_SETTINGS: [UserRole.ADMIN],

  OPERATE_FINANCE: [UserRole.ADMIN, UserRole.MANAGER],

  MANAGE_STOCK: [UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF],

  VIEW_AUDIT: [UserRole.ADMIN, UserRole.MANAGER],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string | undefined, permission: Permission): boolean {
  return (
    !!role && (PERMISSIONS[permission] as readonly string[]).includes(role)
  );
}

export const ROUTE_PERMISSIONS: Array<{
  prefix: string;
  permission: Permission;
}> = [
  {
    prefix: "/pos",
    permission: "MAKE_SALE",
  },

  {
    prefix: "/sales",
    permission: "VIEW_REPORTS",
  },

  {
    prefix: "/purchases",
    permission: "MANAGE_PURCHASES",
  },

  {
    prefix: "/reports",
    permission: "VIEW_REPORTS",
  },

  {
    prefix: "/print/sales",
    permission: "MAKE_SALE",
  },

  {
    prefix: "/print/purchases",
    permission: "MANAGE_PURCHASES",
  },

  {
    prefix: "/print/supplier-payments",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/print/credit-notes",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/print/debit-notes",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/print/stock-transfers",
    permission: "MANAGE_STOCK",
  },

  {
    prefix: "/stock",
    permission: "MANAGE_CATALOG",
  },

  {
    prefix: "/products",
    permission: "MANAGE_CATALOG",
  },

  {
    prefix: "/suppliers",
    permission: "MANAGE_SUPPLIERS",
  },

  {
    prefix: "/customers",
    permission: "MANAGE_CUSTOMERS",
  },

  {
    prefix: "/users",
    permission: "MANAGE_USERS",
  },

  {
    prefix: "/operations",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/audit",
    permission: "VIEW_AUDIT",
  },

  {
    prefix: "/settings",
    permission: "MANAGE_SETTINGS",
  },

  {
    prefix: "/api/reports",
    permission: "VIEW_REPORTS",
  },

  {
    prefix: "/api/products",
    permission: "MANAGE_CATALOG",
  },

  {
    prefix: "/api/stock",
    permission: "MANAGE_CATALOG",
  },

  {
    prefix: "/api/purchases",
    permission: "MANAGE_PURCHASES",
  },

  {
    prefix: "/api/customers",
    permission: "MANAGE_CUSTOMERS",
  },

  {
    prefix: "/api/suppliers",
    permission: "MANAGE_SUPPLIERS",
  },

  {
    prefix: "/api/branches",
    permission: "MANAGE_SETTINGS",
  },

  {
    prefix: "/api/settings",
    permission: "MANAGE_SETTINGS",
  },

  {
    prefix: "/api/customer-receipts",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/api/supplier-payments",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/api/supplier-ledger",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/api/returns",
    permission: "OPERATE_FINANCE",
  },

  {
    prefix: "/api/stock-adjustments",
    permission: "MANAGE_STOCK",
  },

  {
    prefix: "/api/stock-transfers",
    permission: "MANAGE_STOCK",
  },

  {
    prefix: "/api/stock-ledger",
    permission: "MANAGE_STOCK",
  },

  {
    prefix: "/api/audit",
    permission: "VIEW_AUDIT",
  },

  {
    prefix: "/api/users",
    permission: "MANAGE_USERS",
  },
];
