import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware for parsing JSON with generous payload limit for base64 audio
app.use(express.json({ limit: '25mb' }));

// Shared server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * 1. Audio Transcription endpoint
 * Uses gemini-3.5-transcribe model
 */
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioData,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this spoken student campus problem description accurately. Output only the transcribed text without extra preamble or quotation marks.',
          },
        ],
      },
    });

    const text = response.text || '';
    return res.json({ text: text.trim() });
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to transcribe audio with gemini-3.5-transcribe',
    });
  }
});

/**
 * 2. Gemini Chatbot with Google Maps Grounding
 * Uses gemini-3.5-flash with googleMaps tool
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userLocation } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build contents from conversation history
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Configure tools: include googleMaps grounding tool
    const config: any = {
      systemInstruction:
        'You are CampusBot, the helpful AI assistant for CampusFix. You assist university students with campus maintenance inquiries, facility locations, repair department routing, emergency help desks, and nearby campus amenities or services. Use the Google Maps tool whenever the user asks about physical locations, directions, campus blocks, buildings, repair facilities, or nearby stores/services. Provide concise, friendly, and practical answers.',
      tools: [{ googleMaps: {} }],
    };

    if (
      userLocation &&
      typeof userLocation.latitude === 'number' &&
      typeof userLocation.longitude === 'number'
    ) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config,
    });

    const replyText = response.text || 'I could not generate a response. Please try again.';

    // Extract Google Maps grounding chunks and links
    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const mapSources: Array<{ title: string; uri: string }> = [];

    for (const chunk of groundingChunks) {
      if (chunk.maps?.uri) {
        mapSources.push({
          title: chunk.maps.title || 'Google Maps Location',
          uri: chunk.maps.uri,
        });
      }
    }

    return res.json({
      reply: replyText,
      mapSources,
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to process chat with gemini-3.5-flash',
    });
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
