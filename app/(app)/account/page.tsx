import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import AddCharacterButton from "../../components/AddCharacterButton";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const characters = await prisma.character.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isMain: "desc" }, { characterName: "asc" }],
  });

  return (
    <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-base uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Account
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
          Linked EVE characters
        </p>
      </div>

      <AddCharacterButton />

      <div className="flex flex-col gap-2 max-w-lg">
        {characters.map((char) => (
          <div
            key={char.id}
            className="flex items-center justify-between px-4 py-3 rounded border"
            style={{ background: "var(--panel)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              {/* EVE character portrait */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://images.evetech.net/characters/${char.characterId}/portrait?size=32`}
                alt=""
                width={32}
                height={32}
                className="rounded"
              />
              <div className="flex flex-col">
                <span className="text-sm" style={{ color: "var(--foreground)" }}>
                  {char.characterName}
                </span>
                <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                  #{char.characterId}
                </span>
              </div>
            </div>

            {char.isMain && (
              <span
                className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                Main
              </span>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
