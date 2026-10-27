import { useRef, useState } from "react";

/** Returns an error message, or null when the file is acceptable. `accept` is a list of extensions such as [".pdf"]. */
export function checkFile(file: { name: string; size: number }, opts: { accept?: string[]; maxBytes?: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (opts.maxBytes && file.size > opts.maxBytes) return `That file is larger than ${Math.round(opts.maxBytes / (1024 * 1024))} MB.`;
  if (opts.accept?.length) {
    const name = file.name.toLowerCase();
    if (!opts.accept.some((ext) => name.endsWith(ext.toLowerCase()))) return `Use a ${opts.accept.join(", ")} file.`;
  }
  return null;
}

export function FileDrop({
  onFile,
  accept,
  maxBytes,
  label = "Drop a file here, or choose one",
}: {
  onFile: (f: File) => void;
  accept?: string[];
  maxBytes?: number;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (f: File | undefined) => {
    if (!f) return;
    const err = checkFile(f, { accept, maxBytes });
    setError(err);
    if (!err) onFile(f);
  };

  return (
    <div>
      <div
        className={"ui-drop" + (over ? " over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
      >
        <span>{label}</span>
        <button type="button" className="btn small" onClick={() => input.current?.click()}>
          Choose file
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept={accept?.join(",")}
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="ui-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
