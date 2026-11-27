export async function downloadCanvasJpg(source: HTMLCanvasElement, filename: string, background = "#10242e") {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Görsel oluşturulamadı.");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("Görsel JPG olarak kaydedilemedi.");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
