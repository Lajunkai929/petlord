export function reportRuntimeError(error: unknown, source: string) {
  const normalized = error instanceof Error
    ? { message: error.message, stack: error.stack, source }
    : { message: String(error), source };
  void window.petLordDesktop?.reportError?.(normalized);
}

export function installRuntimeErrorReporting() {
  window.addEventListener("error", (event) => reportRuntimeError(event.error ?? event.message, "window.error"));
  window.addEventListener("unhandledrejection", (event) => reportRuntimeError(event.reason, "unhandledrejection"));
}
