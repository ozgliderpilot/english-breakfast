export interface Env {
  BOT_TOKEN: string;       // secret
  LLM_API_KEY: string;     // secret
  WEBHOOK_SECRET: string;  // secret
  ALLOWED_CHAT_ID: string; // var, numeric string e.g. "-1001234567890"
}

export interface TgFrom { id: number; is_bot: boolean; }
export interface TgChat { id: number; type: string; }

export interface TgMessage {
  message_id: number;
  text?: string;
  chat: TgChat;
  from?: TgFrom;
  reply_to_message?: {
    message_id: number;
    text?: string;
    from?: TgFrom;
  };
}

export interface TgUpdate { message?: TgMessage; }

export type Action =
  | { kind: "ignore" }
  | { kind: "fresh";  text: string;     replyTo: number }
  | { kind: "refine"; previous: string; instruction: string; replyTo: number };
