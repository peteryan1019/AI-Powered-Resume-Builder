import type { User } from "../../generated/prisma/client.js";
import prisma from "../lib/prisma.js";
import { buildHeaders, formatInstance, type ExportedProfile} from "../lib/profileExport.js";

export async function getExportedProfile(
  user: User,
): Promise<ExportedProfile> {
  const profile = await prisma.profile.findUnique({
    where: {
      userId: user.id,
    },
    include: {
      sections: {
        orderBy: {
          order: "asc",
        },
        include: {
          instances: {
            orderBy: {
              order: "asc",
            },
          },
        },
      },
    },
  });

  const sections = (profile?.sections ?? []).flatMap((section) =>
    section.instances.map((instance) =>
      formatInstance(section.type, instance),
    ),
  );

  return {
    headers: buildHeaders(user, profile),
    sections,
  };
}