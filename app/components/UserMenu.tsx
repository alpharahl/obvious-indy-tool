import { auth } from "../../auth";
import UserMenuClient from "./UserMenuClient";

export default async function UserMenu() {
  const session = await auth();
  return <UserMenuClient name={session?.user?.name ?? null} />;
}
