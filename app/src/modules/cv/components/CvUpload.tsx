import { useEffect, useState } from "react";
import { attempt } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { FileDrop } from "../../../ui/FileDrop";
import { cvApi } from "../api";
import { useAction } from "../hooks";
import type { CvDetail } from "../types";

const ACCEPT = [".pdf", ".docx", ".txt"];
const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_CHARS = 1200;

const PROVIDER_NAMES: Record<string, string> = { openai: "OpenAI", lmstudio: "LM Studio (local)", off: "No AI (rules only)" };

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

/** What the user picked, shown before anything is sent: a text preview for TXT, an embedded view for PDF. */
function Preview({ file }: { file: File }) {
  const [text, setText] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const lower = file.name.toLowerCase();

  useEffect(() => {
    setText(null);
    setUrl(null);
    if (lower.endsWith(".txt")) {
      let live = true;
      void file.text().then((t) => live && setText(t.trim().slice(0, PREVIEW_CHARS)));
      return () => {
        live = false;
      };
    }
    if (lower.endsWith(".pdf")) {
      const u = URL.createObjectURL(file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [file, lower]);

  if (text !== null) return <pre className="cv-preview">{text || "The file is empty."}</pre>;
  if (url) return <iframe className="cv-preview cv-preview-pdf" src={url} title={`Preview of ${file.name}`} />;
  return <p className="cv-hint">A DOCX cannot be previewed here. You can check the text it contains after it is read.</p>;
}

/** The CV upload box. The CV screen and the Hub's setup checklist both use it. */
export function CvUpload({ onUploaded, bare = false }: { onUploaded: (cv: CvDetail) => void; bare?: boolean }) {
  const { busy, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);

  useEffect(() => {
    void attempt(cvApi.llm).then((s) => s && setAi(s.effective));
  }, []);

  const send = async () => {
    if (!file) return;
    const cv = await run(() => cvApi.upload(file), "CV uploaded. Check that it was read correctly.");
    if (cv) {
      setFile(null);
      onUploaded(cv);
    }
  };

  const provider = ai ? (PROVIDER_NAMES[ai.provider] ?? ai.provider) : null;

  const body = (
    <>
      {!file ? (
        <FileDrop onFile={setFile} accept={ACCEPT} maxBytes={MAX_BYTES} label="Drop a PDF, DOCX or TXT here" />
      ) : (
        <div className="cv-picked">
          <div className="cv-picked-head">
            <strong>{file.name}</strong>
            <span className="cv-hint">{size(file.size)}</span>
          </div>
          <Preview file={file} />
          <div className="cv-picked-actions">
            <Button variant="primary" disabled={busy} onClick={() => void send()}>
              {busy ? "Reading your CV…" : "Read this CV"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setFile(null)}>
              Choose a different file
            </Button>
          </div>
          {busy && (
            <p className="cv-hint" role="status">
              Reading the file and finding its sections. This usually takes a few seconds.
            </p>
          )}
        </div>
      )}
      <p className="cv-hint">
        {provider && (
          <>
            <Badge tone={ai?.provider === "off" ? "neutral" : "gold"}>{provider}</Badge>
            {ai?.model ? ` ${ai.model} ` : " "}
            will read this CV.{" "}
          </>
        )}
        Use a text-based file; scanned images cannot be read. Your CV is private to your account. You can change the AI in Settings.
      </p>
    </>
  );
  return bare ? body : <Card title="Upload a CV">{body}</Card>;
}
