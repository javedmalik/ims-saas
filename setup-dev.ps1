$ErrorActionPreference = "Stop"
Write-Host "Installing packages..."
npm install
Write-Host "Formatting and validating Prisma..."
npx prisma format
npx prisma validate
npx prisma generate
Write-Host "WARNING: The next command resets the configured development database." -ForegroundColor Yellow
$answer = Read-Host "Type RESET to continue"
if ($answer -ne "RESET") { Write-Host "Database reset skipped."; exit 0 }
npx prisma db push --force-reset
npm run db:seed
Write-Host "Setup complete. Run: npm run dev" -ForegroundColor Green
