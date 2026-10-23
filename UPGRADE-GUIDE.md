# IMS SaaS Upgrade Guide — 2026-09-26

This package extends the uploaded project with operational controls needed for a multi-branch Indian-market IMS.

## Added

- Session-aware branch switching from the top bar. Access is revalidated against `UserBranchAccess` before JWT context changes.
- Business logo fallback + branch-specific logo support retained for invoices/reports.
- Financial-year document sequencing for sales invoices and internal GRN numbers.
- Supplier GST state code and persisted intra/inter-state GST fields on purchases.
- Customer receipt workflow that reduces customer outstanding and posts customer-ledger credits.
- Supplier payment workflow with calculated payable balance.
- Sales return / credit-note workflow with stock restoration and customer-credit adjustment.
- Purchase return / debit-note workflow with stock reduction and supplier-liability adjustment.
- Stock adjustment workflow for physical count, damage, expiry, breakage, loss and corrections.
- Inter-branch stock transfer workflow.
- Stock movement ledger.
- Audit Log screen.
- New Operations screen consolidating the above workflows.
- Stock-ledger recording for new purchases/sales and transaction edit/cancel paths.
- Admin test seed backfill for opening stock ledger and supplier ledger.

## Database schema update — REQUIRED

The Prisma schema contains new tables/columns. Back up the database first.

For the current development database:

```powershell
npx prisma generate
npx prisma db push
```

If you prefer a migration file in a development environment with database access:

```powershell
npx prisma migrate dev --name operations_hardening
```

For production, create and review a migration against a staging copy before running `prisma migrate deploy`.

## After schema update

```powershell
npm install
npx prisma generate
npm run typecheck
npm run dev
```

Optional test data for the existing `admin` business/branch:

```powershell
npm run db:admin-test-seed
```

## Important data behavior

- Branch switching changes both the active branch and, if applicable, business context only after verifying active `UserBranchAccess`.
- New stock movements are written to `stock_ledger_entries`. Historical transactions that predate this upgrade are not reconstructed automatically; the admin seed creates opening entries for its own seeded batches.
- Supplier payable is calculated from non-cancelled purchase due amounts minus supplier payments and purchase returns.
- Sales returns first reduce current customer outstanding where applicable; any remainder is treated as a refund amount.
- Local `public/uploads` branding is suitable for local/server deployments. For Vercel/serverless production, move uploaded branding to S3/Azure Blob/another persistent object store.

## Still intentionally separate from this operational release

The SaaS commercial control-plane (subscription plans, tenant billing, trials, plan limits and automated tenant suspension) is a separate platform-admin layer and should be implemented after the transaction system is stabilized.


## Prisma Client generation (required after extracting)

The source ZIP intentionally excludes `node_modules`. After extracting, run `npm install` (or `npm ci`) and then `npx prisma generate`. The project now also runs `prisma generate` automatically through the `postinstall` script. If VS Code still reports that `PrismaClient` is not exported, close the dev server, delete `node_modules`, `.next`, and `node_modules/.prisma` if present, reinstall packages, run `npx prisma generate`, then restart the TypeScript server / VS Code.
