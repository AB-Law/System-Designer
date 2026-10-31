import { attempt } from "../../../shared/async";
import { downloadJson } from "../../../shared/download";
import { Button } from "../../../ui/Button";
import { interviewApi } from "../api";

export function YourData({ onDeleted }: { onDeleted: () => void }) {
  const download = async () => {
    const data = await attempt(interviewApi.exportAll);
    if (data !== undefined) downloadJson("my-interview-data.json", data);
  };
  const removeAll = async () => {
    if (!window.confirm("Delete every role, interview, feedback report and document you have saved? This cannot be undone.")) return;
    if ((await attempt(interviewApi.deleteAll, "All interview data deleted.")) !== undefined) onDeleted();
  };
  return (
    <details className="iv-data">
      <summary>Your data and privacy</summary>
      <p className="iv-hint">Download everything this module holds about you, or remove it all.</p>
      <div className="iv-row">
        <Button size="small" onClick={() => void download()}>
          Download my data
        </Button>
        <Button size="small" variant="danger" onClick={() => void removeAll()}>
          Delete all my interview data
        </Button>
      </div>
    </details>
  );
}
