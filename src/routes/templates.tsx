import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { AspectThumb } from "@/client/components/AspectThumb";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { NewProjectDialog } from "@/client/components/NewProjectDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { ASPECT_LABELS } from "@/lib/timeline";
import { deleteTemplate, getTemplates } from "@/serverFunctions/projects";

export const Route = createFileRoute("/templates")({
  loader: () => getTemplates(),
  head: () => ({ meta: [{ title: "Templates · Video Editor" }] }),
  component: TemplatesPage,
});

type Template = Awaited<ReturnType<typeof getTemplates>>[number];

function TemplatesPage() {
  const templates = Route.useLoaderData();
  const router = useRouter();
  const [using, setUsing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="Templates"
        description="Publish your own from a project's editor."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <li
            key={template.id}
            data-testid="template-card"
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs"
          >
            <div className="flex h-28 items-center justify-center bg-muted">
              <AspectThumb aspect={template.aspect} />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{template.title}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    {ASPECT_LABELS[template.aspect]} {template.aspect}
                  </span>
                  {template.builtIn ? (
                    <Badge variant="secondary">Built in</Badge>
                  ) : (
                    <span className="truncate">
                      · {template.authorEmail ?? "Former member"}
                    </span>
                  )}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUsing(template.id)}
                >
                  Use template
                </Button>
                {template.canDelete ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    data-testid="delete-template"
                    aria-label={`Delete ${template.title}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(template)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {using ? (
        <NewProjectDialog
          templates={templates}
          initialTemplate={using}
          onClose={() => setUsing(null)}
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
              await deleteTemplate({ data: { id: deleting.id } });
              setDeleting(null);
              await router.invalidate();
            } finally {
              setPending(false);
            }
          }}
        >
          Projects already made from it keep their copy.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
