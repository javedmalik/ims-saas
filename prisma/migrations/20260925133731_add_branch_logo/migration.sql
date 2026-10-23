BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[tenants] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(150) NOT NULL,
    [slug] NVARCHAR(80) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [tenants_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tenants_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [tenants_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tenants_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[businesses] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tenantId] INT NOT NULL,
    [code] NVARCHAR(30) NOT NULL,
    [legalName] NVARCHAR(200) NOT NULL,
    [tradeName] NVARCHAR(200),
    [businessType] NVARCHAR(80),
    [pan] NVARCHAR(10),
    [email] NVARCHAR(120),
    [phone] NVARCHAR(30),
    [website] NVARCHAR(200),
    [logoUrl] NVARCHAR(500),
    [currencyCode] NVARCHAR(3) NOT NULL CONSTRAINT [businesses_currencyCode_df] DEFAULT 'INR',
    [financialYearStartMonth] INT NOT NULL CONSTRAINT [businesses_financialYearStartMonth_df] DEFAULT 4,
    [isActive] BIT NOT NULL CONSTRAINT [businesses_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [businesses_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [businesses_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [businesses_tenantId_code_key] UNIQUE NONCLUSTERED ([tenantId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[branches] (
    [id] INT NOT NULL IDENTITY(1,1),
    [businessId] INT NOT NULL,
    [code] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [logoUrl] NVARCHAR(500),
    [addressLine1] NVARCHAR(200),
    [addressLine2] NVARCHAR(200),
    [city] NVARCHAR(100),
    [state] NVARCHAR(100),
    [stateCode] NVARCHAR(2),
    [pincode] NVARCHAR(10),
    [phone] NVARCHAR(30),
    [email] NVARCHAR(120),
    [gstin] NVARCHAR(15),
    [invoicePrefix] NVARCHAR(12) NOT NULL CONSTRAINT [branches_invoicePrefix_df] DEFAULT 'INV',
    [purchasePrefix] NVARCHAR(12) NOT NULL CONSTRAINT [branches_purchasePrefix_df] DEFAULT 'PUR',
    [creditNotePrefix] NVARCHAR(12) NOT NULL CONSTRAINT [branches_creditNotePrefix_df] DEFAULT 'CN',
    [lowStockGlobal] INT NOT NULL CONSTRAINT [branches_lowStockGlobal_df] DEFAULT 10,
    [allowNegativeStock] BIT NOT NULL CONSTRAINT [branches_allowNegativeStock_df] DEFAULT 0,
    [pricesIncludeTax] BIT NOT NULL CONSTRAINT [branches_pricesIncludeTax_df] DEFAULT 1,
    [isActive] BIT NOT NULL CONSTRAINT [branches_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [branches_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [branches_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [branches_businessId_code_key] UNIQUE NONCLUSTERED ([businessId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tenantId] INT NOT NULL,
    [defaultBranchId] INT,
    [username] NVARCHAR(50) NOT NULL,
    [fullName] NVARCHAR(100) NOT NULL,
    [passwordHash] NVARCHAR(256) NOT NULL,
    [role] NVARCHAR(20) NOT NULL CONSTRAINT [users_role_df] DEFAULT 'STAFF',
    [isActive] BIT NOT NULL CONSTRAINT [users_isActive_df] DEFAULT 1,
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_username_key] UNIQUE NONCLUSTERED ([username])
);

-- CreateTable
CREATE TABLE [dbo].[user_branch_access] (
    [userId] INT NOT NULL,
    [branchId] INT NOT NULL,
    [role] NVARCHAR(20),
    [isActive] BIT NOT NULL CONSTRAINT [user_branch_access_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [user_branch_access_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_branch_access_pkey] PRIMARY KEY CLUSTERED ([userId],[branchId])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [tenantId] INT NOT NULL,
    [branchId] INT,
    [userId] INT,
    [action] NVARCHAR(50) NOT NULL,
    [entityType] NVARCHAR(50) NOT NULL,
    [entityId] NVARCHAR(50),
    [metadata] NVARCHAR(max),
    [ipAddress] NVARCHAR(64),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[products] (
    [id] INT NOT NULL IDENTITY(1,1),
    [businessId] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [sku] NVARCHAR(50),
    [brand] NVARCHAR(200),
    [variant] NVARCHAR(200),
    [category] NVARCHAR(100),
    [unit] NVARCHAR(20) NOT NULL CONSTRAINT [products_unit_df] DEFAULT 'pcs',
    [hsnCode] NVARCHAR(20),
    [defaultTaxPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [products_defaultTaxPercent_df] DEFAULT 0,
    [reorderLevel] INT NOT NULL CONSTRAINT [products_reorderLevel_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [products_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [products_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [products_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[product_batches] (
    [id] INT NOT NULL IDENTITY(1,1),
    [branchId] INT NOT NULL,
    [productId] INT NOT NULL,
    [batchNo] NVARCHAR(50) NOT NULL,
    [expiryDate] DATE,
    [mrp] DECIMAL(18,2) NOT NULL,
    [costPrice] DECIMAL(18,2) NOT NULL,
    [sellPrice] DECIMAL(18,2) NOT NULL,
    [openingQty] INT NOT NULL CONSTRAINT [product_batches_openingQty_df] DEFAULT 0,
    [currentQty] INT NOT NULL CONSTRAINT [product_batches_currentQty_df] DEFAULT 0,
    [rackLocation] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [product_batches_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [product_batches_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[suppliers] (
    [id] INT NOT NULL IDENTITY(1,1),
    [businessId] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [contactPerson] NVARCHAR(150),
    [mobile] NVARCHAR(20),
    [phone] NVARCHAR(20),
    [taxId] NVARCHAR(20),
    [addressLine1] NVARCHAR(200),
    [addressLine2] NVARCHAR(200),
    [city] NVARCHAR(100),
    [state] NVARCHAR(100),
    [pincode] NVARCHAR(10),
    [isActive] BIT NOT NULL CONSTRAINT [suppliers_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [suppliers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [suppliers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[customers] (
    [id] INT NOT NULL IDENTITY(1,1),
    [businessId] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [mobile] NVARCHAR(20),
    [address] NVARCHAR(300),
    [referredBy] NVARCHAR(200),
    [taxId] NVARCHAR(20),
    [state] NVARCHAR(100),
    [stateCode] NVARCHAR(2),
    [isActive] BIT NOT NULL CONSTRAINT [customers_isActive_df] DEFAULT 1,
    [dueAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [customers_dueAmount_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [customers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [customers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[customer_ledger_entries] (
    [id] INT NOT NULL IDENTITY(1,1),
    [branchId] INT NOT NULL,
    [customerId] INT NOT NULL,
    [saleId] BIGINT,
    [txnDate] DATETIME2 NOT NULL CONSTRAINT [customer_ledger_entries_txnDate_df] DEFAULT CURRENT_TIMESTAMP,
    [debit] DECIMAL(18,2) NOT NULL CONSTRAINT [customer_ledger_entries_debit_df] DEFAULT 0,
    [credit] DECIMAL(18,2) NOT NULL CONSTRAINT [customer_ledger_entries_credit_df] DEFAULT 0,
    [note] NVARCHAR(200),
    CONSTRAINT [customer_ledger_entries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchases] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [branchId] INT NOT NULL,
    [supplierId] INT NOT NULL,
    [invoiceNo] NVARCHAR(50) NOT NULL,
    [invoiceDate] DATE NOT NULL,
    [grossAmount] DECIMAL(18,2) NOT NULL,
    [totalDiscount] DECIMAL(18,2) NOT NULL,
    [taxableAmount] DECIMAL(18,2) NOT NULL,
    [totalTax] DECIMAL(18,2) NOT NULL,
    [netAmount] DECIMAL(18,2) NOT NULL,
    [paymentMode] NVARCHAR(30) NOT NULL,
    [paidAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [purchases_paidAmount_df] DEFAULT 0,
    [dueAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [purchases_dueAmount_df] DEFAULT 0,
    [isCancelled] BIT NOT NULL CONSTRAINT [purchases_isCancelled_df] DEFAULT 0,
    [cancelReason] NVARCHAR(250),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchases_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedById] INT,
    [updatedAt] DATETIME2,
    CONSTRAINT [purchases_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchase_items] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [purchaseId] BIGINT NOT NULL,
    [productId] INT NOT NULL,
    [batchId] INT NOT NULL,
    [batchNo] NVARCHAR(50) NOT NULL,
    [expiryDate] DATE,
    [qty] INT NOT NULL,
    [freeQty] INT NOT NULL CONSTRAINT [purchase_items_freeQty_df] DEFAULT 0,
    [mrp] DECIMAL(18,2) NOT NULL,
    [costPrice] DECIMAL(18,2) NOT NULL,
    [sellPrice] DECIMAL(18,2) NOT NULL,
    [discountPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [purchase_items_discountPercent_df] DEFAULT 0,
    [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [purchase_items_discountAmount_df] DEFAULT 0,
    [taxPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [purchase_items_taxPercent_df] DEFAULT 0,
    [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [purchase_items_taxAmount_df] DEFAULT 0,
    [lineTotal] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [purchase_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[sales] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [branchId] INT NOT NULL,
    [billNo] NVARCHAR(30) NOT NULL,
    [billDateTime] DATETIME2 NOT NULL CONSTRAINT [sales_billDateTime_df] DEFAULT CURRENT_TIMESTAMP,
    [customerId] INT,
    [grossAmount] DECIMAL(18,2) NOT NULL,
    [totalDiscount] DECIMAL(18,2) NOT NULL,
    [taxableAmount] DECIMAL(18,2) NOT NULL,
    [totalCgst] DECIMAL(18,2) NOT NULL CONSTRAINT [sales_totalCgst_df] DEFAULT 0,
    [totalSgst] DECIMAL(18,2) NOT NULL CONSTRAINT [sales_totalSgst_df] DEFAULT 0,
    [totalIgst] DECIMAL(18,2) NOT NULL CONSTRAINT [sales_totalIgst_df] DEFAULT 0,
    [netAmount] DECIMAL(18,2) NOT NULL,
    [paymentMode] NVARCHAR(30) NOT NULL,
    [receivedAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [sales_receivedAmount_df] DEFAULT 0,
    [dueAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [sales_dueAmount_df] DEFAULT 0,
    [isCancelled] BIT NOT NULL CONSTRAINT [sales_isCancelled_df] DEFAULT 0,
    [cancelledAt] DATETIME2,
    [cancelledById] INT,
    [cancelReason] NVARCHAR(200),
    [createdById] INT NOT NULL,
    [updatedById] INT,
    [updatedAt] DATETIME2,
    CONSTRAINT [sales_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sales_branchId_billNo_key] UNIQUE NONCLUSTERED ([branchId],[billNo])
);

-- CreateTable
CREATE TABLE [dbo].[sale_items] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [saleId] BIGINT NOT NULL,
    [batchId] INT NOT NULL,
    [qty] INT NOT NULL,
    [rate] DECIMAL(18,2) NOT NULL,
    [discountPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [sale_items_discountPercent_df] DEFAULT 0,
    [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [sale_items_discountAmount_df] DEFAULT 0,
    [taxPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [sale_items_taxPercent_df] DEFAULT 0,
    [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [sale_items_taxAmount_df] DEFAULT 0,
    [lineTotal] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [sale_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchase_payments] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [purchaseId] BIGINT NOT NULL,
    [branchId] INT NOT NULL,
    [mode] NVARCHAR(30) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [reference] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_payments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [purchase_payments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[sale_payments] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [saleId] BIGINT NOT NULL,
    [branchId] INT NOT NULL,
    [mode] NVARCHAR(30) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [reference] NVARCHAR(100),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [sale_payments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [sale_payments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [businesses_tenantId_idx] ON [dbo].[businesses]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [branches_businessId_idx] ON [dbo].[branches]([businessId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [branches_gstin_idx] ON [dbo].[branches]([gstin]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_tenantId_idx] ON [dbo].[users]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_defaultBranchId_idx] ON [dbo].[users]([defaultBranchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [user_branch_access_branchId_idx] ON [dbo].[user_branch_access]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_tenantId_createdAt_idx] ON [dbo].[audit_logs]([tenantId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_branchId_createdAt_idx] ON [dbo].[audit_logs]([branchId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_entityType_entityId_idx] ON [dbo].[audit_logs]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_businessId_name_idx] ON [dbo].[products]([businessId], [name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_businessId_sku_idx] ON [dbo].[products]([businessId], [sku]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_batches_branchId_productId_idx] ON [dbo].[product_batches]([branchId], [productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_batches_branchId_expiryDate_idx] ON [dbo].[product_batches]([branchId], [expiryDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [suppliers_businessId_name_idx] ON [dbo].[suppliers]([businessId], [name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [customers_businessId_name_idx] ON [dbo].[customers]([businessId], [name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [customers_businessId_mobile_idx] ON [dbo].[customers]([businessId], [mobile]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [customer_ledger_entries_branchId_customerId_txnDate_idx] ON [dbo].[customer_ledger_entries]([branchId], [customerId], [txnDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchases_branchId_invoiceDate_idx] ON [dbo].[purchases]([branchId], [invoiceDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchases_supplierId_idx] ON [dbo].[purchases]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_items_purchaseId_idx] ON [dbo].[purchase_items]([purchaseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_items_productId_idx] ON [dbo].[purchase_items]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sales_branchId_billDateTime_idx] ON [dbo].[sales]([branchId], [billDateTime]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sales_customerId_idx] ON [dbo].[sales]([customerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sale_items_saleId_idx] ON [dbo].[sale_items]([saleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sale_items_batchId_idx] ON [dbo].[sale_items]([batchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_payments_purchaseId_idx] ON [dbo].[purchase_payments]([purchaseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_payments_branchId_createdAt_idx] ON [dbo].[purchase_payments]([branchId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sale_payments_saleId_idx] ON [dbo].[sale_payments]([saleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sale_payments_branchId_createdAt_idx] ON [dbo].[sale_payments]([branchId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[businesses] ADD CONSTRAINT [businesses_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[branches] ADD CONSTRAINT [branches_businessId_fkey] FOREIGN KEY ([businessId]) REFERENCES [dbo].[businesses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_defaultBranchId_fkey] FOREIGN KEY ([defaultBranchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_branch_access] ADD CONSTRAINT [user_branch_access_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_branch_access] ADD CONSTRAINT [user_branch_access_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_businessId_fkey] FOREIGN KEY ([businessId]) REFERENCES [dbo].[businesses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_batches] ADD CONSTRAINT [product_batches_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_batches] ADD CONSTRAINT [product_batches_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[suppliers] ADD CONSTRAINT [suppliers_businessId_fkey] FOREIGN KEY ([businessId]) REFERENCES [dbo].[businesses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[customers] ADD CONSTRAINT [customers_businessId_fkey] FOREIGN KEY ([businessId]) REFERENCES [dbo].[businesses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[customer_ledger_entries] ADD CONSTRAINT [customer_ledger_entries_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[customer_ledger_entries] ADD CONSTRAINT [customer_ledger_entries_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[customer_ledger_entries] ADD CONSTRAINT [customer_ledger_entries_saleId_fkey] FOREIGN KEY ([saleId]) REFERENCES [dbo].[sales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[suppliers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_updatedById_fkey] FOREIGN KEY ([updatedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_purchaseId_fkey] FOREIGN KEY ([purchaseId]) REFERENCES [dbo].[purchases]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_batchId_fkey] FOREIGN KEY ([batchId]) REFERENCES [dbo].[product_batches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sales] ADD CONSTRAINT [sales_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sales] ADD CONSTRAINT [sales_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sales] ADD CONSTRAINT [sales_cancelledById_fkey] FOREIGN KEY ([cancelledById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sales] ADD CONSTRAINT [sales_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sales] ADD CONSTRAINT [sales_updatedById_fkey] FOREIGN KEY ([updatedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sale_items] ADD CONSTRAINT [sale_items_saleId_fkey] FOREIGN KEY ([saleId]) REFERENCES [dbo].[sales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sale_items] ADD CONSTRAINT [sale_items_batchId_fkey] FOREIGN KEY ([batchId]) REFERENCES [dbo].[product_batches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_payments] ADD CONSTRAINT [purchase_payments_purchaseId_fkey] FOREIGN KEY ([purchaseId]) REFERENCES [dbo].[purchases]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_payments] ADD CONSTRAINT [purchase_payments_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sale_payments] ADD CONSTRAINT [sale_payments_saleId_fkey] FOREIGN KEY ([saleId]) REFERENCES [dbo].[sales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sale_payments] ADD CONSTRAINT [sale_payments_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
