/**
 * AI Chat API (Public - Rate Limited)
 * POST: Send chat message to Gemini or Magma API
 * GET: Get session history
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/database';
import { chat, getChatSession, type GeminiModel } from '@/lib/integrations/ai-provider';
import { serviceConfigLoad, serviceConfigGetGeminiRateLimit, serviceConfigGetGeminiRateWindow } from '@/core/config';
import { logger } from '@/lib/services/shared/logger';

// Magma API models (external)
type MagmaModel = 'gpt5' | 'copilot-smart';
type AIModel = GeminiModel | MagmaModel;

const MAGMA_ENDPOINTS: Record<MagmaModel, string> = {
    'gpt5': 'https://magma-api.biz.id/ai/gpt5',
    'copilot-smart': 'https://magma-api.biz.id/ai/copilot-think',
};

async function chatWithMagma(model: MagmaModel, message: string): Promise<{ success: boolean; text?: string; model?: string; error?: string }> {
    try {
        const endpoint = MAGMA_ENDPOINTS[model];
        const url = `${endpoint}?prompt=${encodeURIComponent(message)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        });
        
        if (!response.ok) {
            throw new Error(`Magma API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.status || !data.result?.response) {
            throw new Error('Invalid response from Magma API');
        }
        
        return {
            success: true,
            text: data.result.response,
            model: model === 'gpt5' ? 'GPT-5' : 'Copilot Smart',
        };
    } catch (error) {
        logger.error('chat', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Magma API error',
        };
    }
}

export async function POST(request: NextRequest) {
    // Load config from DB
    await serviceConfigLoad();
    const RATE_LIMIT = serviceConfigGetGeminiRateLimit();
    const RATE_WINDOW = serviceConfigGetGeminiRateWindow() * 60; // convert minutes to seconds
    
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    const rateLimitKey = `chat:${ip}`;
    const { success: allowed, remaining } = await rateLimit(rateLimitKey, RATE_LIMIT, RATE_WINDOW);
    
    if (!allowed) {
        return NextResponse.json({
            success: false,
            error: 'Rate limit exceeded. Please wait a moment.',
            rateLimit: { remaining: 0, limit: RATE_LIMIT, resetIn: RATE_WINDOW }
        }, { status: 429 });
    }
    
    try {
        const body = await request.json();
        const { message, image, sessionKey, model, webSearch } = body;
        
        if (!message || typeof message !== 'string') {
            return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
        }
        
        if (message.length > 4000) {
            return NextResponse.json({ success: false, error: 'Message too long (max 4000 chars)' }, { status: 400 });
        }
        
        // Check if using Magma API models
        const magmaModels: MagmaModel[] = ['gpt5', 'copilot-smart'];
        if (magmaModels.includes(model as MagmaModel)) {
            // Magma API - text only, no session support
            const result = await chatWithMagma(model as MagmaModel, message);
            return NextResponse.json({
                ...result,
                rateLimit: { remaining, limit: RATE_LIMIT }
            });
        }
        
        // Gemini models
        const validModels: GeminiModel[] = ['gemini-2.5-flash', 'gemini-flash-latest'];
        const selectedModel = validModels.includes(model) ? model : 'gemini-2.5-flash';
        
        // Validate image if provided
        let imageData: { mimeType: string; data: string } | undefined;
        if (image) {
            if (!image.mimeType || !image.data) {
                return NextResponse.json({ success: false, error: 'Invalid image format' }, { status: 400 });
            }
            
            const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!validMimeTypes.includes(image.mimeType)) {
                return NextResponse.json({ success: false, error: 'Unsupported image type' }, { status: 400 });
            }
            
            // Check base64 size (max ~5MB)
            if (image.data.length > 7000000) {
                return NextResponse.json({ success: false, error: 'Image too large (max 5MB)' }, { status: 400 });
            }
            
            imageData = image;
        }
        
        // Call Gemini
        const result = await chat({
            message,
            image: imageData,
            sessionKey,
            model: selectedModel,
            webSearch: webSearch === true,
        });
        
        return NextResponse.json({
            ...result,
            rateLimit: { remaining, limit: RATE_LIMIT }
        });
        
    } catch (error) {
        logger.error('chat', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal error'
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const sessionKey = searchParams.get('sessionKey');
    
    if (!sessionKey) {
        return NextResponse.json({ success: false, error: 'sessionKey required' }, { status: 400 });
    }
    
    const session = getChatSession(sessionKey);
    
    return NextResponse.json({
        success: true,
        data: {
            sessionKey: session.key,
            history: session.history,
            messageCount: session.history.length,
        }
    });
}
