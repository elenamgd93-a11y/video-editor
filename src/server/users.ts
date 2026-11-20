import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface Actor {
  id: string;
  email: string;
  admin: boolean;
}

/** The signed-in member as the app knows them, recorded on first sight. */
export async function actorOf(user: EveryAppUser): Promise<Actor> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email.toLowerCase() })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email.toLowerCase() },
    });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}

export async function userByEmail(email: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}
