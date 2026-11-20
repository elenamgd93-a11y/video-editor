import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  FileAudio,
  FileImage,
  FileVideo,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { Choice } from "@/client/components/Choice";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  KIND_LABELS,
  fileUrl,
  formatBytes,
  formatDate,
  uploadFile,
} from "@/client/lib/media";
import { formatClock } from "@/lib/timeline";
import type { MediaItem } from "@/server/media";
import { deleteMedia, getLibrary, renameMedia } from "@/serverFunctions/media";

export const Route = createFileRoute("/media")({
  loader: () => getLibrary(),
  head: () => ({ meta: [{ title: "Library · Video Editor" }] }),
  component: MediaPage,
});

type Filter = "all" | "video" | "audio" | "image";

const SOURCE_LABELS: Record<MediaItem["source"], string | null> = {
  upload: null,
  voiceover: "Voiceover",
  export: "Export",
  photo: "Edited photo",
};

const ICONS = { video: FileVideo, audio: FileAudio, image: FileImage };

function details(item: MediaItem) {
  if (item.kind === "image")
    return item.width && item.height ? `${item.width} × ${item.height}` : "—";
  const length =
    item.durationMs != null ? formatClock(item.durationMs / 1000) : "—";
  return item.kind === "video" && item.width && item.height
    ? `${length} · ${item.width} × ${item.height}`
    : length;
}

function MediaPage() {
  const items = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(0);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [renaming, setRenaming] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const [pending, setPending] = useState(false);

  const shown =
    filter === "all" ? items : items.filter((item) => item.kind === filter);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        await uploadFile(file);
      } catch (error) {
        toast.error(
          `${file.name}: ${error instanceof Error ? error.message : "upload failed"}`,
        );
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
    await router.invalidate();
  }

  return (
    <AppShell>
      <PageHeader
        title="Library"
        actions={
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              className="hidden"
              data-testid="media-upload-input"
              onChange={(event) => void upload(event.target.files)}
            />
            <Button
              onClick={() => input.current?.click()}
              pending={uploading > 0}
            >
              <Upload />
              {uploading > 0 ? `Uploading ${uploading}…` : "Upload"}
            </Button>
          </>
        }
      />
      <Choice<Filter>
        label="Show"
        testId="filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "video", label: "Video" },
          { value: "audio", label: "Audio" },
          { value: "image", label: "Images" },
        ]}
      />
      {items.length === 0 ? (
        <EmptyState
          title="Your library is empty"
          description="Upload video, audio or images to use them in projects."
          action={
            <Button onClick={() => input.current?.click()}>Upload files</Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          kind="filtered"
          title={`No ${filter === "image" ? "images" : `${filter} files`} yet`}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead>Length or size</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((item) => {
                const Icon = ICONS[item.kind];
                const origin = SOURCE_LABELS[item.source];
                return (
                  <TableRow key={item.id} data-testid="media-row">
                    <TableCell className="max-w-64">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left hover:underline"
                        onClick={() => setPreview(item)}
                      >
                        <Icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="truncate">{item.name}</span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {KIND_LABELS[item.kind]}
                        {origin ? (
                          <Badge variant="secondary">{origin}</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatBytes(item.size)}
                    </TableCell>
                    <TableCell>{details(item)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${item.name}`}
                              data-testid="media-actions"
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreview(item)}>
                            Preview
                          </DropdownMenuItem>
                          {item.kind === "image" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                void navigate({
                                  to: "/photos/$id",
                                  params: { id: item.id },
                                })
                              }
                            >
                              Edit photo
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            render={
                              <a href={fileUrl(item.id)} download={item.name} />
                            }
                          >
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRenaming(item)}>
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(item)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          <div
            data-testid="media-preview"
            className="flex justify-center overflow-hidden rounded-lg bg-muted"
          >
            {preview?.kind === "image" ? (
              <img
                src={fileUrl(preview.id)}
                alt={preview.name}
                className="max-h-[60vh] object-contain"
              />
            ) : preview?.kind === "video" ? (
              <video
                src={fileUrl(preview.id)}
                controls
                className="max-h-[60vh] w-full"
              />
            ) : preview ? (
              <audio
                src={fileUrl(preview.id)}
                controls
                className="m-6 w-full"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {renaming ? (
        <RenameDialog
          name={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await renameMedia({ data: { id: renaming.id, name } });
            setRenaming(null);
            await router.invalidate();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setPending(true);
            try {
              const result = await deleteMedia({ data: { id: deleting.id } });
              if (result.error) toast.error(result.error);
              setDeleting(null);
              await router.invalidate();
            } finally {
              setPending(false);
            }
          }}
        >
          The file is removed for good.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

/** Asks for a new name. Shared by the library and the projects list. */
export function RenameDialog({
  name,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!value.trim()) return;
            setPending(true);
            setError(null);
            try {
              await onSave(value.trim());
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "That didn't work.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Name"
            data-testid="rename-input"
            value={value}
            maxLength={255}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="rename-save"
              pending={pending}
              disabled={!value.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
