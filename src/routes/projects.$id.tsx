import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Editor } from "@/client/editor/Editor";
import { getEditor } from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$id")({
  // The editor draws on a canvas and plays media: it runs in the browser.
  ssr: false,
  loader: ({ params }) => getEditor({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.project.title ?? "Project"} · Video Editor` },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  if (!data) {
    return (
      <AppShell>
        <PageHeader title="Project not found" />
        <p data-testid="not-found" className="text-sm text-muted-foreground">
          It was deleted, or it hasn't been shared with you.
        </p>
      </AppShell>
    );
  }
  return (
    <Editor
      key={data.project.id}
      data={data}
      onReloadLibrary={() => router.invalidate()}
    />
  );
}
