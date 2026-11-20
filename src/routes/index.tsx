import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NewProjectDialog } from "@/client/components/NewProjectDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { AspectThumb } from "@/client/components/AspectThumb";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { formatDate } from "@/client/lib/media";
import { ASPECT_LABELS } from "@/lib/timeline";
import {
  deleteProject,
  duplicateProject,
  getProjects,
  renameProject,
} from "@/serverFunctions/projects";
import { RenameDialog } from "./media";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Projects · Video Editor" }] }),
  component: ProjectsPage,
});

type Project = Awaited<ReturnType<typeof getProjects>>["projects"][number];

const ROLE_LABELS = {
  owner: null,
  editor: "Editor",
  viewer: "Viewer",
} as const;

function ProjectsPage() {
  const { projects, templates } = Route.useLoaderData();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        actions={
          <Button data-testid="new-project" onClick={() => setCreating(true)}>
            <Plus />
            New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create one and it will appear here."
          action={
            <Button onClick={() => setCreating(true)}>New project</Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const role = ROLE_LABELS[project.role];
            return (
              <li
                key={project.id}
                data-testid="project-card"
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs"
              >
                <Link
                  to="/projects/$id"
                  params={{ id: project.id }}
                  className="flex h-32 items-center justify-center bg-muted"
                >
                  <AspectThumb aspect={project.aspect} />
                </Link>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0 space-y-1">
                    <Link
                      to="/projects/$id"
                      params={{ id: project.id }}
                      className="block truncate font-medium hover:underline"
                    >
                      {project.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {ASPECT_LABELS[project.aspect]} {project.aspect}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatDate(project.updatedAt)}</span>
                      {role ? <Badge variant="secondary">{role}</Badge> : null}
                    </p>
                    {project.ownerEmail ? (
                      <p className="truncate text-xs text-muted-foreground">
                        From {project.ownerEmail}
                      </p>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${project.title}`}
                          data-testid="project-actions"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={
                          <Link
                            to="/projects/$id"
                            params={{ id: project.id }}
                          />
                        }
                      >
                        Open
                      </DropdownMenuItem>
                      {project.role === "owner" ? (
                        <>
                          <DropdownMenuItem
                            onClick={() => setRenaming(project)}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await duplicateProject({
                                  data: { id: project.id },
                                });
                                await router.invalidate();
                              } catch {
                                toast.error("Couldn't duplicate the project.");
                              }
                            }}
                          >
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(project)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating ? (
        <NewProjectDialog
          templates={templates}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {renaming ? (
        <RenameDialog
          name={renaming.title}
          onClose={() => setRenaming(null)}
          onSave={async (title) => {
            await renameProject({ data: { id: renaming.id, title } });
            setRenaming(null);
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.title}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setPending(true);
            try {
              await deleteProject({ data: { id: deleting.id } });
              setDeleting(null);
              await router.invalidate();
            } finally {
              setPending(false);
            }
          }}
        >
          Its timeline and export list go for good; files stay in the library.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
