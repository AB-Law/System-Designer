import { lessonIndex } from "../../lessons/load";
import { useStore } from "../../store";

/** A button-styled link to one lesson page. It renders nothing when the page does not exist, so a stale reference cannot show a dead link. */
export function LessonLink({ lesson, page, children, onOpen }: { lesson?: string; page?: string; children?: string; onOpen?: () => void }) {
  const open = useStore((s) => s.openLearn);
  if (!lesson || !page) return null;
  const found = lessonIndex()
    .find((l) => l.id === lesson)
    ?.pages.find((p) => p.id === page);
  if (!found) return null;
  return (
    <button
      type="button"
      className="link"
      onClick={() => {
        onOpen?.();
        open(lesson, page);
      }}
    >
      {children ?? `Read the lesson page: ${found.title}`}
    </button>
  );
}
