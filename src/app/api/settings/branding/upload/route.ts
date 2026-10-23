import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getServerSession,
} from "next-auth";

import {
  mkdir,
  writeFile,
} from "fs/promises";

import path from "path";

import {
  authOptions,
} from "@/lib/auth";

import {
  prisma,
} from "@/lib/db";

import {
  can,
} from "@/lib/rbac";

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export async function POST(
  req: NextRequest
) {
  const session =
    await getServerSession(
      authOptions
    );

  if (!session?.user) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  if (
    !can(
      session.user.role,
      "MANAGE_SETTINGS"
    )
  ) {
    return NextResponse.json(
      {
        error:
          "You do not have permission to update branding.",
      },
      {
        status: 403,
      }
    );
  }

  const {
    tenantId,
    businessId,
    branchId,
  } = session.user;

  if (
    !tenantId ||
    !businessId ||
    !branchId
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid session context. Please logout and login again.",
      },
      {
        status: 401,
      }
    );
  }

  let formData: FormData;

  try {
    formData =
      await req.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid upload request.",
      },
      {
        status: 400,
      }
    );
  }

  const file =
    formData.get(
      "file"
    );

  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        error:
          "Please choose a logo or banner image.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !ALLOWED_TYPES.includes(
      file.type
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Only PNG, JPG/JPEG and WebP images are allowed.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    file.size >
    MAX_FILE_SIZE
  ) {
    return NextResponse.json(
      {
        error:
          "Image size must not exceed 5 MB.",
      },
      {
        status: 400,
      }
    );
  }

  const business =
    await prisma.business.findFirst({
      where: {
        id:
          businessId,

        tenantId,

        isActive:
          true,
      },
    });

  if (!business) {
    return NextResponse.json(
      {
        error:
          "Business not found.",
      },
      {
        status: 404,
      }
    );
  }

  const branch =
    await prisma.branch.findFirst({
      where: {
        id:
          branchId,

        businessId,

        isActive:
          true,
      },
    });

  if (!branch) {
    return NextResponse.json(
      {
        error:
          "Branch not found.",
      },
      {
        status: 404,
      }
    );
  }

  let extension =
    "jpg";

  if (
    file.type ===
    "image/png"
  ) {
    extension =
      "png";
  }

  if (
    file.type ===
    "image/webp"
  ) {
    extension =
      "webp";
  }

  const fileName =
    `business-${businessId}-${Date.now()}.${extension}`;

  const uploadDirectory =
    path.join(
      process.cwd(),
      "public",
      "uploads",
      "branding"
    );

  await mkdir(
    uploadDirectory,
    {
      recursive: true,
    }
  );

  const destination =
    path.join(
      uploadDirectory,
      fileName
    );

  const arrayBuffer =
    await file.arrayBuffer();

  await writeFile(
    destination,
    Buffer.from(
      arrayBuffer
    )
  );

  const logoUrl =
    `/uploads/branding/${fileName}`;

  await prisma.$transaction(
    async (tx) => {
      await tx.business.update({
        where: {
          id:
            businessId,
        },

        data: {
          logoUrl,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,

          branchId,

          userId:
            Number(
              session.user.id
            ),

          action:
            "BRANDING_UPLOAD",

          entityType:
            "Business",

          entityId:
            String(
              businessId
            ),

          metadata:
            JSON.stringify({
              previousLogoUrl:
                business.logoUrl,

              logoUrl,

              originalFileName:
                file.name,

              storedFileName:
                fileName,

              contentType:
                file.type,

              size:
                file.size,
            }),
        },
      });
    }
  );

  return NextResponse.json({
    ok: true,

    message:
      "Logo / banner uploaded successfully.",

    logoUrl,
  });
}