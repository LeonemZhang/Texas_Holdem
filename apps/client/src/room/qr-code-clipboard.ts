function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('二维码图片生成失败'));
    }, 'image/png');
  });
}

export async function copyQrCodeToClipboard(
  canvas: HTMLCanvasElement,
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    if (!window.texasHoldemDesktop?.copyImageToClipboard) {
      throw new Error('当前环境不支持复制二维码');
    }
  }

  if (window.texasHoldemDesktop?.copyImageToClipboard) {
    await window.texasHoldemDesktop.copyImageToClipboard(
      canvas.toDataURL('image/png'),
    );
    return;
  }

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': await canvasBlob(canvas) }),
  ]);
}
