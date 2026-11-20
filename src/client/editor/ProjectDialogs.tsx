import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Pick } from "@/client/components/Choice";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import {
  getShares,
  publishTemplate,
  revokeShare,
  setShareRole,
  shareProject,
} from "@/serverFunctions/projects";

type ShareRole = "viewer" | "editor";
const ROLE_OPTIONS = [
  { value: "editor" as const, label: "Editor" },
  { value: "viewer" as const, label: "Viewer" },
];

export function ShareDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<
    { userId: string; email: string; role: ShareRole }[] | null
  >(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () =>
    setShares(await getShares({ data: { id: projectId } }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Editors can change the timeline and export. Viewers can only play
            it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              const result = await shareProject({
                data: { id: projectId, email, role },
              });
              if (result.error) setError(result.error);
              else {
                setEmail("");
                await load();
              }
            } catch {
              setError("Enter a member's email address.");
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="min-w-48 flex-1">
            <Field label="Member's email" htmlFor="share-email">
              <Input
                id="share-email"
                type="email"
                data-testid="share-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-32">
            <Pick
              label="Role"
              testId="share-role"
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS}
            />
          </div>
          <Button
            type="submit"
            data-testid="share-submit"
            pending={pending}
            disabled={!email.trim()}
          >
            Share
          </Button>
        </form>
        {error ? (
          <Alert variant="destructive" data-testid="share-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {shares && shares.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {shares.map((share) => (
              <li
                key={share.userId}
                data-testid="share-row"
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {share.email}
                </span>
                <div className="w-28">
                  <Pick
                    label={`Role for ${share.email}`}
                    hideLabel
                    testId={`share-role-${share.email}`}
                    value={share.role}
                    onChange={async (next) => {
                      await setShareRole({
                        data: {
                          id: projectId,
                          userId: share.userId,
                          role: next,
                        },
                      });
                      await load();
                    }}
                    options={ROLE_OPTIONS}
                  />
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  data-testid="share-revoke"
                  aria-label={`Stop sharing with ${share.email}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await revokeShare({
                      data: { id: projectId, userId: share.userId },
                    });
                    await load();
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : shares ? (
          <p className="text-sm text-muted-foreground">
            Only you can open this project.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PublishDialog({
  projectId,
  title,
  onClose,
}: {
  projectId: string;
  title: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(title);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish as template</DialogTitle>
          <DialogDescription>
            Every member can start a project from a copy of this timeline and
            its media.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <Alert data-testid="published">
            <AlertDescription>
              Published. It's on the Templates page.
            </AlertDescription>
          </Alert>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(null);
              try {
                await publishTemplate({
                  data: { id: projectId, title: name.trim() },
                });
                setDone(true);
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "That didn't work.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            <Field label="Template name" htmlFor="template-title">
              <Input
                id="template-title"
                data-testid="template-title"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              data-testid="publish-submit"
              pending={pending}
              disabled={!name.trim()}
            >
              Publish
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
