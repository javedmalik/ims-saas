type Props = {
  logoUrl?: string | null;

  legalName: string;

  tradeName?: string | null;

  branchName?: string | null;

  address?: string | null;

  gstin?: string | null;

  phone?: string | null;

  email?: string | null;

  title: string;

  subtitle?: string | null;
};

export function PrintHeader({
  logoUrl,
  legalName,
  tradeName,
  branchName,
  address,
  gstin,
  phone,
  email,
  title,
  subtitle,
}: Props) {
  return (
    <div className="print-header">
      {logoUrl && (
        <div className="mb-3 flex justify-center">
          <img
            src={logoUrl}
            alt={tradeName || legalName}
            className="max-h-24 max-w-full object-contain"
          />
        </div>
      )}

      <div className="text-center">
        <h1 className="text-2xl font-bold">{tradeName || legalName}</h1>

        {tradeName && <p className="text-sm font-medium">{legalName}</p>}

        {branchName && (
          <p className="mt-1 text-sm font-semibold">{branchName}</p>
        )}

        {address && <p className="mt-1 text-sm">{address}</p>}

        <div className="mt-1 flex flex-wrap justify-center gap-x-4 text-sm">
          {gstin && <span>GSTIN: {gstin}</span>}

          {phone && <span>Phone: {phone}</span>}

          {email && <span>Email: {email}</span>}
        </div>
      </div>

      <div className="my-4 border-t-2 border-black" />

      <div className="text-center">
        <h2 className="text-xl font-bold uppercase">{title}</h2>

        {subtitle && <p className="mt-1 text-sm">{subtitle}</p>}
      </div>
    </div>
  );
}
