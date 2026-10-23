# IMS SaaS - Complete Working Development Build

Next.js 14 + Prisma 5.22 + SQL Server inventory/POS application for multi-business, multi-branch use.

## Implemented modules

- Authentication with roles: ADMIN, MANAGER, STAFF, CASHIER
- Tenant -> Business -> Branch SaaS foundation
- Business/branch GST and billing settings
- Items/Product master with HSN/GST/reorder level
- Suppliers CRUD
- Customers CRUD + credit due + ledger
- Users/Roles + default branch access
- Batch-wise stock, valuation, low stock, expired/near-expiry visibility
- Purchase / GRN with batch creation, free quantity, GST, discount and split payment
- Purchase cancellation with stock reversal protection
- POS billing with batch stock, GST, discounts, split Cash/UPI/Card/Credit payment
- Customer credit ledger integration
- Sales history with GST/payment/due summary
- Sale cancellation with stock and customer-ledger reversal
- Dashboard branch-scoped summary
- Audit logging for important create/update/transaction operations

## Development setup

1. Copy `.env.example` to `.env` and update SQL Server connection and `NEXTAUTH_SECRET`.
2. Install packages:

```powershell
npm install
```

3. Validate/generate Prisma:

```powershell
npx prisma format
npx prisma validate
npx prisma generate
```

4. This build contains a redesigned development schema. For a disposable development DB, rebuild it:

```powershell
npx prisma db push --force-reset
npm run db:seed
```

> `--force-reset` deletes existing database data. Do not use it on production or any database you need to preserve.

5. Start:

```powershell
npm run dev
```

Default seed credentials unless overridden in `.env`:

- Username: `admin`
- Password: `ChangeMe@123`

Change the password after first login.

## Suggested first-use order

1. Settings: business, branch, state code, GSTIN, invoice prefixes.
2. Products: create items with GST/HSN.
3. Suppliers and Customers.
4. Purchase & GRN: receive initial stock batches.
5. POS: make sales.
6. Stock and Sales reports.

## Production notes

Before production rollout, create a proper migration/baseline strategy instead of `db push`, configure SQL Server backups, HTTPS, production secrets, centralized rate limiting, and GST invoice/report compliance testing with your accountant/tax adviser.

## Operations hardening release (2026-09-26)

See `UPGRADE-GUIDE.md` and `CHANGELOG-2026-09-26.md` before running this version against an existing database.

New UI routes:

- `/operations` — customer receipts, supplier payments, stock adjustments, branch transfers, sales returns, purchase returns, stock ledger
- `/audit` — tenant/branch audit trail

The top bar now supports switching among branches assigned through `UserBranchAccess`.
