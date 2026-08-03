export function networkErrorMessage(
  message: string | null | undefined,
): string {
  return message && /[\u3400-\u9fff]/u.test(message)
    ? message
    : '网络异常，请重试';
}
