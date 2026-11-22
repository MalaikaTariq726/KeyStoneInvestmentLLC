"use client";

import { useRef, useState } from "react";
import { Icon } from "./Icon";

export interface PickedFile {
  fileName: string;
  contentType: string;
  base64: string;
}

const MAX_FILE = 3 * 1024 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024;
const bytes = (b64: string) => Math.floor((b64.length * 3) / 4);
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Phone photos are often 3-6 MB. Scale to at most 1600px and re-encode as JPEG so receipts
// stay readable but small (they're stored inside the MongoDB document, like the desktop app does).
async function compressImage(file: File): Promise<PickedFile> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.82));
    const dataUrl = await readAsDataUrl(blob);
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return { fileName: `${name}.jpg`, contentType: "image/jpeg", base64: dataUrl.split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AttachmentPicker({ files, onChange }: { files: PickedFile[]; onChange: (f: PickedFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = files.reduce((s, f) => s + bytes(f.base64), 0);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    setBusy(true);
    const next = [...files];
    try {
      for (const file of Array.from(list)) {
        let picked: PickedFile;
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          if (file.size > MAX_FILE) { setError(`"${file.name}" is over 3 MB.`); continue; }
          picked = { fileName: file.name, contentType: "application/pdf", base64: (await readAsDataUrl(file)).split(",")[1] };
        } else if (file.type.startsWith("image/")) {
          picked = await compressImage(file);
        } else {
          setError("Only photos/images or PDF files can be attached.");
          continue;
        }
        const newTotal = next.reduce((s, f) => s + bytes(f.base64), 0) + bytes(picked.base64);
        if (newTotal > MAX_TOTAL) { setError("Attachments can add up to 4 MB at most."); break; }
        next.push(picked);
      }
      onChange(next.slice(0, 10));
    } catch {
      setError("A file couldn't be read. Try a different one.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-soft px-4 py-6 text-center transition hover:border-accent/50 hover:bg-white"
      >
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-accent shadow-card"><Icon name="clip" /></span>
        <span className="text-sm font-bold">{busy ? "Preparing files…" : "Add receipts or invoices"}</span>
        <span className="text-xs text-muted">Take a photo or choose images / PDF · up to 4 MB in total</span>
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
              {f.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${f.contentType};base64,${f.base64}`} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-red-50 text-[10px] font-extrabold text-red-600">PDF</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{f.fileName}</span>
                <span className="text-xs text-muted">{kb(bytes(f.base64))}</span>
              </span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${f.fileName}`}>
                <Icon name="x" className="h-4 w-4" />
              </button>
            </li>
          ))}
          <li className="text-right text-xs font-semibold text-muted">{kb(total)} of 4 MB</li>
        </ul>
      )}
    </div>
  );
}
