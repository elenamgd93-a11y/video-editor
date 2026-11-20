import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Choice, Field, Pick } from "@/client/components/Choice";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { ASPECTS, ASPECT_LABELS, type Aspect } from "@/lib/timeline";
import { createProject } from "@/serverFunctions/projects";

export interface TemplateOption {
  id: string;
  title: string;
  aspect: Aspect;
}

export function NewProjectDialog({
  templates,
  initialTemplate = "blank",
  onClose,
}: {
  templates: TemplateOption[];
  initialTemplate?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const start = templates.find((t) => t.id === initialTemplate);
  const [title, setTitle] = useState(start ? start.title : "");
  const [aspect, setAspect] = useState<Aspect>(start?.aspect ?? "16:9");
  const [template, setTemplate] = useState(initialTemplate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!title.trim()) return;
            setPending(true);
            setError(null);
            try {
              const { id } = await createProject({
                data: { title: title.trim(), aspect, template },
              });
              await navigate({ to: "/projects/$id", params: { id } });
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "That didn't work.",
              );
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <Field label="Name" htmlFor="project-name">
            <Input
              id="project-name"
              data-testid="project-name"
              value={title}
              maxLength={120}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Shape">
            <Choice<Aspect>
              label="Shape"
              testId="aspect"
              value={aspect}
              onChange={setAspect}
              options={ASPECTS.map((a) => ({
                value: a,
                label: `${ASPECT_LABELS[a]} ${a}`,
              }))}
            />
          </Field>
          <Pick
            label="Start from"
            testId="template-select"
            value={template}
            onChange={(id) => {
              setTemplate(id);
              const picked = templates.find((t) => t.id === id);
              if (picked) setAspect(picked.aspect);
            }}
            options={[
              { value: "blank", label: "Blank" },
              ...templates.map((t) => ({ value: t.id, label: t.title })),
            ]}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="create-project"
              pending={pending}
              disabled={!title.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
