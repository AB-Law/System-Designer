import { Card } from "../../../ui/Card";
import { FileDrop } from "../../../ui/FileDrop";
import { cvApi } from "../api";
import { useAction } from "../hooks";
import type { CvDetail } from "../types";

const ACCEPT = [".pdf", ".docx", ".txt"];
const MAX_BYTES = 5 * 1024 * 1024;

/** The CV upload box. The CV screen and the Hub's setup checklist both use it. */
export function CvUpload({ onUploaded, bare = false }: { onUploaded: (cv: CvDetail) => void; bare?: boolean }) {
  const { busy, run } = useAction();

  const onFile = async (f: File) => {
    const cv = await run(() => cvApi.upload(f), "CV uploaded. Check that it was read correctly.");
    if (cv) onUploaded(cv);
  };

  const body = (
    <>
      <FileDrop
        onFile={(f) => void onFile(f)}
        accept={ACCEPT}
        maxBytes={MAX_BYTES}
        label={busy ? "Reading your CV…" : "Drop a PDF, DOCX or TXT here"}
      />
      <p className="cv-hint">
        Use a text-based file. Scanned images cannot be read. Your CV is private to your account and is sent to the AI provider you choose
        in Settings.
      </p>
    </>
  );
  return bare ? body : <Card title="Upload a CV">{body}</Card>;
}
