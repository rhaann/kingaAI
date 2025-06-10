export async function sendMessage(message: string, sessionId?: string) {
    const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

    if (!N8N_WEBHOOK_URL) {
      throw new Error("N8N_WEBHOOK_URL is not defined in env variables.");
    }

    const body: any = { message };
    if (sessionId) body.sessionId = sessionId;

    console.log("Sending to N8N:", JSON.stringify(body));

    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("N8N webhook error response text:", errText); 
      throw new Error(`n8n webhook error: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return data;         
  }