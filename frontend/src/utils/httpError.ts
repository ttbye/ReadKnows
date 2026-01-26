/**
 * 统一从 fetch Response 中提取可读错误信息。
 * 兼容后端常见格式：{ error, details } / { message }，以及纯文本错误。
 */
export type ParsedHttpError = {
  status: number;
  statusText: string;
  message: string;
  details?: string;
  raw?: unknown;
  rawText?: string;
};

function pickString(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : undefined;
  }
  return undefined;
}

export async function readErrorFromResponse(res: Response): Promise<ParsedHttpError> {
  const status = res.status;
  const statusText = res.statusText || '';
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  let data: any = null;
  let rawText = '';

  // 优先尝试 JSON（使用 clone，避免消耗原始 body 导致后续无法读取）
  try {
    if (contentType.includes('application/json')) {
      data = await res.clone().json();
    }
  } catch {
    // ignore
  }

  // 再尝试读取文本（用于兜底/调试/某些后端返回 text/plain）
  try {
    rawText = await res.text();
  } catch {
    rawText = '';
  }

  // 如果没有 JSON，但文本看起来像 JSON，尝试解析
  if (!data && rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // ignore
    }
  }

  const message =
    pickString(data?.error) ||
    pickString(data?.message) ||
    pickString(data?.msg) ||
    pickString(rawText) ||
    pickString(statusText) ||
    `HTTP ${status}`;

  const details = pickString(data?.details) || pickString(data?.detail) || pickString(data?.reason);

  return {
    status,
    statusText,
    message,
    details,
    raw: data ?? undefined,
    rawText: rawText || undefined,
  };
}

