import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Editor } from "@/components/editor/Editor";

export default function EditorPage({ params }: PageProps<"/editor/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {params.then(({ id }) => (
        <Editor projectId={id} />
      ))}
    </Suspense>
  );
}
