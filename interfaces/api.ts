export enum EventType {
  WhatsAppQR = "whatsapp_qr",
  WhatsAppConnecting = "whatsapp_connecting",
  Redirect = "redirect",
  ContactCompare = "contact_compare",
  ContactPhotoApply = "contact_photo_apply",
  ContactPhotoSkip = "contact_photo_skip",
  SyncProgress = "sync_progress",
}

export interface Event {
  type: EventType;
  data: any;
}

export interface ContactCompare {
  name: string;
  google: string;
  whatsapp: string;
}

export interface SyncProgress {
  progress: number;
  syncCount: number;
  skippedCount: number;
  totalContacts?: number;
  image?: string;
  isSynced?: boolean;
  error?: string;
}

export interface SessionStatus {
  whatsappConnected: boolean;
  googleConnected: boolean;
  purchased: boolean;
}

export interface SyncOptions {
  overwrite_photos?: string; // "true" or "false" (since converted to string via query params)
  require_confirmation?: string; // "true" or "false"
}
