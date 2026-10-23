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

type Context = {
  params: {
    id: string;
  };
};

export async function POST(
  req: NextRequest,
  { params }: Context
) {
  const session =
    await getServerSession(
      authOptions
    );

  if (!session?.user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
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
        error: "Forbidden",
      },
      {
        status: 403,
      }
    );
  }

  const branchId =
    Number(params.id);

  if (
    !branchId ||
    Number.isNaN(branchId)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid branch",
      },
      {
        status: 400,
      }
    );
  }

  const branch =
    await prisma.branch.findFirst({
      where: {
        id:
          branchId,

        businessId:
          session.user.businessId,

        business: {
          tenantId:
            session.user.tenantId,
        },
      },

      include: {
        business: true,
      },
    });

  if (!branch) {
    return NextResponse.json(
      {
        error:
          "Branch not found",
      },
      {
        status: 404,
      }
    );
  }

  const formData =
    await req.formData();

  const file =
    formData.get("file");

  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        error:
          "Please choose a logo image.",
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

  let extension = "jpg";

  if (
    file.type ===
    "image/png"
  ) {
    extension = "png";
  } else if (
    file.type ===
    "image/webp"
  ) {
    extension = "webp";
  }

  const fileName =
    `branch-${branchId}-${Date.now()}.${extension}`;

  const uploadDirectory =
    path.join(
      process.cwd(),
      "public",
      "uploads",
      "branding",
      "branches"
    );

  await mkdir(
    uploadDirectory,
    {
      recursive: true,
    }
  );

  const filePath =
    path.join(
      uploadDirectory,
      fileName
    );

  const buffer =
    Buffer.from(
      await file.arrayBuffer()
    );

  await writeFile(
    filePath,
    buffer
  );

  const logoUrl =
    `/uploads/branding/branches/${fileName}`;

  await prisma.$transaction(
    async (tx) => {
      await tx.branch.update({
        where: {
          id:
            branchId,
        },

        data: {
          logoUrl,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId:
            session.user.tenantId,

          branchId:
            session.user.branchId,

          userId:
            Number(
              session.user.id
            ),

          action:
            "BRANCH_LOGO_UPLOAD",

          entityType:
            "Branch",

          entityId:
            String(
              branchId
            ),

          metadata:
            JSON.stringify({
              before: {
                logoUrl:
                  branch.logoUrl,
              },

              after: {
                logoUrl,
              },

              branchName:
                branch.name,
            }),
        },
      });
    }
  );

  return NextResponse.json({
    ok: true,

    message:
      "Branch logo uploaded successfully.",

    logoUrl,
  });
}