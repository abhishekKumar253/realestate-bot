export interface WhatsAppWebhookPayload {
  object: string;
  entry: Entry[];
}

export interface Entry {
  id: string;
  changes: Change[];
}

export interface Change {
  value: Value;
  field: string;
}

export interface Value {
  messaging_product: string;
  metadata: Metadata;
  contacts?: Contact[];
  messages?: IncomingMessage[];
  statuses?: Status[];
}

export interface Metadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface Contact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface IncomingMessage {
  id: string;
  timestamp: string;
  type:
    | "text"
    | "interactive"
    | "image"
    | "video"
    | "document"
    | "audio"
    | "location"
    | "sticker"
    | "button"
    | "order"
    | "system"
    | "unknown";
  from: string;
  text?: { body: string };
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  image?: { id: string; caption?: string; mime_type?: string };
  video?: { id: string; caption?: string; mime_type?: string };
  document?: {
    id: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
  };
  audio?: { id: string; mime_type?: string }; 
  context?: {
    from: string;
    id: string;
  };
}

export interface Status {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

// ─── Outbound Payloads ────────────────────────────────────────
export interface SendTextPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { body: string; preview_url?: boolean };
}

export interface SendTemplatePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
}

export interface SendInteractiveListPayload {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    body: { text: string };
    action: {
      button: string;
      sections: {
        title: string;
        rows: { id: string; title: string; description?: string }[];
      }[];
    };
  };
}

export type SendMessagePayload =
  | SendTextPayload
  | SendTemplatePayload
  | SendInteractiveListPayload;

declare module "express" {
  interface Request {
    rawBody?: string;
  }
}
