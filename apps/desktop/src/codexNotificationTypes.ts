export interface CodexNotificationStatus {
  available: boolean;
  configured: boolean;
  helperReady: boolean;
  configPath: string;
  requiresHookReview: boolean;
  lastLiveEventAt?: string;
  lastTestAt?: string;
  error?: string;
  message: string;
}
export interface CodexNotificationsBridge {
  getCodexNotificationStatus(): Promise<CodexNotificationStatus>;
  installCodexNotifications(): Promise<CodexNotificationStatus>;
  testCodexNotifications(): Promise<CodexNotificationStatus>;
}
