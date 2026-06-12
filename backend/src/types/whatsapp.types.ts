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
  // ✅ Caption support added
  image?: { id: string; caption?: string; mime_type?: string };
  video?: { id: string; caption?: string; mime_type?: string };
  document?: {
    id: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
  };
  audio?: { id?: string; mime_type?: string };
}

export interface Status {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

export interface SendMessagePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: {
    body: string;
  };
}

declare module "express" {
  interface Request {
    rawBody?: string;
  }
}
