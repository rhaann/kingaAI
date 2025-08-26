import { NextRequest, NextResponse } from 'next/server';
import { firestore } from 'firebase-admin'; // We'll need the admin SDK
import { Message } from '@/types/types';

// This is a placeholder for the admin SDK initialization.
// We will need to create this file next.
import { adminDb } from '@/services/firebaseAdmin'; 

/**
 * This is the secure endpoint that n8n workflows will call upon completion.
 * It expects a POST request with a specific JSON body.
 */
export async function POST(req: NextRequest) {
  try {
    // --- 1. Security: Verify the request is coming from a trusted source ---
    // We'll use a simple secret key for now.
    const secret = req.headers.get('x-kinga-secret');
    if (secret !== process.env.N8N_CALLBACK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- 2. Parse the incoming data from n8n ---
    const body = await req.json();
    const { userId, chatId, resultData } = body;

    if (!userId || !chatId || !resultData) {
      return NextResponse.json({ error: 'Missing required fields: userId, chatId, or resultData' }, { status: 400 });
    }

    // --- 3. Construct the new AI message ---
    const newAiMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'ai',
      content: `The workflow has completed. Here are the results:\n\n${JSON.stringify(resultData, null, 2)}`,
    };

    // --- 4. Save the new message to the correct chat in Firestore ---
    const chatDocRef = adminDb.collection('users').doc(userId).collection('chats').doc(chatId);

    // Use FieldValue.arrayUnion to safely add the new message to the 'messages' array
    await chatDocRef.update({
      messages: firestore.FieldValue.arrayUnion(newAiMessage),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    // --- 5. Send a success response back to n8n ---
    return NextResponse.json({ success: true, message: 'Callback received and processed.' });

  } catch (error: unknown) {
    console.error("Error in n8n callback:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}