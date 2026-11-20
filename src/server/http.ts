import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { actorOf } from "@/server/users";

/** The member behind a server route's request, or a 401 response. */
export async function requireActor(request: Request) {
  const user = await getEveryAppUser(request, env);
  if (!user)
    return {
      response: Response.json(
        { error: "Sign in through your Gateway." },
        { status: 401 },
      ),
    };
  return { actor: await actorOf(user) };
}

export const jsonError = (status: number, error: string) =>
  Response.json({ error }, { status });
