export interface ImportedMedia {
  uri: string;
  mimeType: string;
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export async function importMediaFile(file: File): Promise<ImportedMedia> {
  const response = await fetch("/api/media/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl: await fileToDataUrl(file) }),
  });
  const payload = await response.json() as { uri?: string; mimeType?: string; error?: { message?: string } };
  if (!response.ok || !payload.uri) throw new Error(payload.error?.message ?? "媒体保存失败");
  return { uri: payload.uri, mimeType: payload.mimeType ?? file.type ?? "image/png" };
}

export async function importImageFile(file: File): Promise<ImportedMedia> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  return importMediaFile(file);
}

export async function importVideoFile(file: File): Promise<ImportedMedia> {
  if (!["video/mp4", "video/webm"].includes(file.type)) throw new Error("请选择 MP4 或 WebM 视频。");
  return importMediaFile(file);
}
