# Change Log

## Core
- Added financial-year helpers and branch-aware document sequences.
- Added branch switch support to NextAuth JWT/session flow.
- Added Operations and Audit navigation/RBAC.

## Finance
- Added customer receipts.
- Added supplier payments and supplier ledger records.
- Added sales return and purchase return APIs.

## Inventory
- Added stock adjustment.
- Added inter-branch transfer.
- Added stock movement ledger.
- Added stock movement logging to create/edit/cancel transaction flows.

## GST
- Added supplier state code.
- Added persisted purchase CGST/SGST/IGST, place of supply and interstate flag.
- Added persisted sale place of supply/interstate metadata.
- GST summary now prefers state codes when classifying purchases.

## Printing
- Branch logo remains preferred over business logo.
- Purchase print now shows internal GRN number and split GST totals.
