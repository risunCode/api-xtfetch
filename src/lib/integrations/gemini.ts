/**
 * Gemini AI Integration
 * Handles API key rotation and chat functionality
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/services/helper/logger';

export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-flash-latest';

export interface GeminiApiKey {
    id: string;
    key: string;
    label: string;
    enabled: boolean;
    use_count: number;
    error_count: number;
    last_used_at: string | null;
    last_error: string | null;
    rate_limit_reset: string | null;
    created_at: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

export interface GeminiChatRequest {
    message: string;
    image?: { mimeType: string; data: string }; // base64 image
    history?: ChatMessage[];
    model?: GeminiModel;
    sessionKey?: string;
    webSearch?: boolean;
}

export interface GeminiChatResponse {
    success: boolean;
    text?: string;
    error?: string;
    model?: string;
    sessionKey?: string;
    tokensUsed?: number;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// In-memory session storage (for demo - use Redis in production)
const chatSessions = new Map<string, ChatMessage[]>();

/**
 * Get all Gemini API keys from database
 */
export async function getGeminiApiKeys(): Promise<GeminiApiKey[]> {
    if (!supabaseAdmin) return [];
    
    const { data, error } = await supabaseAdmin
        .from('gemini_api_keys')
        .select('*')
        .order('created_at', { ascending: true });
    
    if (error) {
        logger.error('gemini', `Failed to get Gemini API keys: ${error}`);
        return [];
    }
    return data || [];
}

/**
 * Get next available API key (round-robin with rate limit check)
 */
export async function getNextApiKey(): Promise<GeminiApiKey | null> {
    const keys = await getGeminiApiKeys();
    const enabledKeys = keys.filter(k => k.enabled);
    
    if (enabledKeys.length === 0) return null;
    
    // Filter out rate-limited keys
    const now = new Date();
    const availableKeys = enabledKeys.filter(k => {
        if (!k.rate_limit_reset) return true;
        return new Date(k.rate_limit_reset) < now;
    });
    
    if (availableKeys.length === 0) {
        // All keys rate limited, return the one that resets soonest
        return enabledKeys.sort((a, b) => {
            const aReset = a.rate_limit_reset ? new Date(a.rate_limit_reset).getTime() : 0;
            const bReset = b.rate_limit_reset ? new Date(b.rate_limit_reset).getTime() : 0;
            return aReset - bReset;
        })[0];
    }
    
    // Return key with lowest use count (load balancing)
    return availableKeys.sort((a, b) => a.use_count - b.use_count)[0];
}

/**
 * Update API key usage stats
 */
export async function updateKeyUsage(keyId: string, success: boolean, error?: string, rateLimitSeconds?: number): Promise<void> {
    if (!supabaseAdmin) return;
    
    const updates: Record<string, unknown> = {
        last_used_at: new Date().toISOString(),
    };
    
    if (!success) {
        updates.last_error = error || 'Unknown error';
        
        // If rate limited, set reset time
        if (rateLimitSeconds && rateLimitSeconds > 0) {
            updates.rate_limit_reset = new Date(Date.now() + rateLimitSeconds * 1000).toISOString();
        }
    } else {
        // Clear rate limit on success
        updates.rate_limit_reset = null;
        updates.last_error = null;
    }
    
    // Update the record
    const { error: updateError } = await supabaseAdmin
        .from('gemini_api_keys')
        .update(updates)
        .eq('id', keyId);
    
    // Increment counters separately
    if (success) {
        await supabaseAdmin.rpc('increment_gemini_use_count', { key_id: keyId });
    } else {
        await supabaseAdmin.rpc('increment_gemini_error_count', { key_id: keyId });
    }
    
    if (updateError) {
        logger.error('gemini', `Failed to update key usage: ${updateError}`);
    }
}

/**
 * Generate session key
 */
export function generateSessionKey(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create chat session
 */
export function getChatSession(sessionKey?: string): { key: string; history: ChatMessage[] } {
    if (sessionKey && chatSessions.has(sessionKey)) {
        return { key: sessionKey, history: chatSessions.get(sessionKey)! };
    }
    
    const newKey = generateSessionKey();
    chatSessions.set(newKey, []);
    return { key: newKey, history: [] };
}

/**
 * Save message to session
 */
export function saveToSession(sessionKey: string, message: ChatMessage): void {
    const history = chatSessions.get(sessionKey) || [];
    history.push(message);
    
    // Keep only last 20 messages to prevent context overflow
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }
    
    chatSessions.set(sessionKey, history);
}

/**
 * Call Gemini API
 */
export async function callGeminiApi(
    apiKey: string,
    model: GeminiModel,
    contents: ChatMessage[],
    webSearch: boolean = false
): Promise<{ success: boolean; text?: string; error?: string; tokensUsed?: number; isRateLimited?: boolean; retryAfterSeconds?: number }> {
    const url = `${GEMINI_API_BASE}/${model}:generateContent`;
    
    const body: Record<string, unknown> = {
        contents: contents.map(msg => ({
            role: msg.role,
            parts: msg.parts,
        })),
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
        },
    };
    
    // Add grounding/search if enabled (Gemini 2.0+ feature)
    if (webSearch) {
        body.tools = [{ googleSearch: {} }];
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
            
            // Check for rate limit (429) or quota exceeded
            const isRateLimited = response.status === 429 || 
                errorMsg.toLowerCase().includes('rate limit') ||
                errorMsg.toLowerCase().includes('quota') ||
                errorMsg.toLowerCase().includes('resource exhausted');
            
            // Parse retry-after header or default to 60 seconds
            let retryAfterSeconds = 60;
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
                retryAfterSeconds = parseInt(retryAfter) || 60;
            } else if (errorMsg.includes('retry after')) {
                // Try to extract seconds from error message
                const match = errorMsg.match(/retry after (\d+)/i);
                if (match) retryAfterSeconds = parseInt(match[1]);
            }
            
            return { 
                success: false, 
                error: `[${response.status}] ${errorMsg}`,
                isRateLimited,
                retryAfterSeconds: isRateLimited ? retryAfterSeconds : undefined
            };
        }
        
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const tokensUsed = data?.usageMetadata?.totalTokenCount;
        
        if (!text) {
            // Check for safety block
            const blockReason = data?.candidates?.[0]?.finishReason;
            if (blockReason === 'SAFETY') {
                return { success: false, error: 'Response blocked by safety filters' };
            }
            return { success: false, error: 'No response generated' };
        }
        
        return { success: true, text, tokensUsed };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Request failed' 
        };
    }
}

/**
 * Main chat function with auto key rotation
 */
export async function chat(request: GeminiChatRequest): Promise<GeminiChatResponse> {
    const model = request.model || 'gemini-2.5-flash';
    const MAX_RETRIES = 3;
    
    // Get session
    const session = getChatSession(request.sessionKey);
    
    // Build user message
    const userParts: ChatMessage['parts'] = [];
    
    if (request.image) {
        userParts.push({
            inlineData: {
                mimeType: request.image.mimeType,
                data: request.image.data,
            },
        });
    }
    
    userParts.push({ text: request.message });
    
    const userMessage: ChatMessage = { role: 'user', parts: userParts };
    
    // Build full conversation
    const contents: ChatMessage[] = [...session.history, userMessage];
    
    // Track tried keys to avoid retrying same key
    const triedKeyIds = new Set<string>();
    let lastError = 'No API keys available';
    
    // Try up to MAX_RETRIES times with different keys
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Get API key (excluding already tried ones)
        const apiKeyRecord = await getNextApiKey();
        
        if (!apiKeyRecord) {
            return { success: false, error: 'No API keys available. Please configure Gemini API keys in admin settings.' };
        }
        
        // Skip if already tried this key
        if (triedKeyIds.has(apiKeyRecord.id)) {
            // All available keys have been tried
            break;
        }
        
        triedKeyIds.add(apiKeyRecord.id);
        
        // Call Gemini
        const result = await callGeminiApi(apiKeyRecord.key, model, contents, request.webSearch);
        
        // Update key usage with rate limit info
        await updateKeyUsage(
            apiKeyRecord.id, 
            result.success, 
            result.error,
            result.retryAfterSeconds
        );
        
        if (result.success) {
            // Save to session
            saveToSession(session.key, userMessage);
            saveToSession(session.key, { role: 'model', parts: [{ text: result.text }] });
            
            return {
                success: true,
                text: result.text,
                model,
                sessionKey: session.key,
                tokensUsed: result.tokensUsed,
            };
        }
        
        lastError = result.error || 'Unknown error';
        
        // If rate limited, try next key immediately
        if (result.isRateLimited) {
            continue;
        }
        
        // For other errors (invalid key, safety block, etc.), don't retry
        if (result.error?.includes('API key') || result.error?.includes('safety')) {
            break;
        }
    }
    
    return { success: false, error: lastError };
}

/**
 * Admin: Add new API key
 */
export async function addGeminiApiKey(key: string, label: string): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAdmin) return { success: false, error: 'Database not configured' };
    
    // Validate key format
    if (!key.startsWith('AIza')) {
        return { success: false, error: 'Invalid API key format' };
    }
    
    const { error } = await supabaseAdmin
        .from('gemini_api_keys')
        .insert({
            key,
            label,
            enabled: true,
            use_count: 0,
            error_count: 0,
        });
    
    if (error) {
        return { success: false, error: error.message };
    }
    
    return { success: true };
}

/**
 * Admin: Update API key
 */
export async function updateGeminiApiKey(
    id: string, 
    updates: Partial<Pick<GeminiApiKey, 'label' | 'enabled'>>
): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAdmin) return { success: false, error: 'Database not configured' };
    
    const { error } = await supabaseAdmin
        .from('gemini_api_keys')
        .update(updates)
        .eq('id', id);
    
    if (error) {
        return { success: false, error: error.message };
    }
    
    return { success: true };
}

/**
 * Admin: Delete API key
 */
export async function deleteGeminiApiKey(id: string): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAdmin) return { success: false, error: 'Database not configured' };
    
    const { error } = await supabaseAdmin
        .from('gemini_api_keys')
        .delete()
        .eq('id', id);
    
    if (error) {
        return { success: false, error: error.message };
    }
    
    return { success: true };
}
