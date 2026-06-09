import { appDataDir, basename, join } from "@tauri-apps/api/path";
import { copyFile, mkdir } from "@tauri-apps/plugin-fs";

export function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Copies a user file into the app's attachments folder; returns the new absolute path. */
export async function storeAttachmentFile(srcPath: string): Promise<string> {
  const dir = await join(await appDataDir(), "attachments");
  await mkdir(dir, { recursive: true });
  const name = await basename(srcPath);
  const dest = await join(dir, `${Date.now()}-${name}`);
  await copyFile(srcPath, dest);
  return dest;
}

/** Uint8Array → base64 without blowing the call stack on large files. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
