import { runSdeImport, type ProgressEvent } from "../../../../lib/sde/importer";
import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
// SDE import is long-running — disable Next.js default timeout
export const maxDuration = 300;

const ADMIN_CHARACTER_NAME = "Alethoria";

function encode(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hasAdmin = await prisma.character.findFirst({
    where: {
      userId: session.user.id,
      characterName: ADMIN_CHARACTER_NAME,
    },
  });
  if (!hasAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (event: ProgressEvent) => {
        controller.enqueue(enc.encode(encode(event)));
      };

      try {
        await runSdeImport(emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
