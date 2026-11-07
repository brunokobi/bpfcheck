import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: "",
      };
    }

    // URL do webhook do Chat Trigger no n8n da vpsrafa. A URL é pública (o widget já a expõe),
    // então tem padrão aqui; N8N_CHAT_WEBHOOK_URL no Netlify só serve para trocar sem novo deploy.
    const webhookUrl = process.env.N8N_CHAT_WEBHOOK_URL
      || "https://n8n.brunokobi.tech/webhook/bpf-check-webhook-001/chat";
    if (!webhookUrl) {
      return {
        statusCode: 503,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Chat não configurado (N8N_CHAT_WEBHOOK_URL)" }),
      };
    }

    const response = await fetch(
      webhookUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: event.body,
      }
    );

    const text = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: text,
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Proxy error",
        message: error.message,
      }),
    };
  }
};
