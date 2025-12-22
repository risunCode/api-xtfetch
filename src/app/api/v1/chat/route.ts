/**
 * AI Chat API (Public - Rate Limited)
 * POST: Send chat message to Gemini
 * GET: Get session history
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/redis';
import { chat, getChatSession, type GeminiModel } from '@/lib/integrations/gemini';
import { loadConfigFromDB, getGeminiRateLimit, getGeminiRateWindow } from '@/lib/services/helper/service-config';

export async function POST(request: NextRequest) {
    // Load config from DB
    await loadConfigFromDB();
    const RATE_LIMIT = getGeminiRateLimit();
    const RATE_WINDOW = getGeminiRateWindow() * 60; // convert minutes to seconds
    
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
        
        // Validate model
        const validModels: GeminiModel[] = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
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
        console.error('Chat API error:', error);
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
