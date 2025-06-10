import { sendMessage } from "@/lib/sendMessage";

export async function POST(req: Request) {
  const { message, sessionId } = await req.json();

  try {
    const result = await sendMessage(message, sessionId);
    return Response.json({ result });
  } catch (err: any) {
    return new Response(err.message || "Unknown error", { status: 500 });
  }
}