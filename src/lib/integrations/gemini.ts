/**
 * Gemini AI Integration
 * Handles API key rotation and chat functionality
 */

import { supabaseAdmin } from '@/lib/supabase';

export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash-lite';

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
        console.error('Failed to get Gemini API keys:', error);
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
export async function updateKeyUsage(keyId: string, success: boolean, error?: string): Promise<void> {
    if (!supabaseAdmin) return;
    
    const updates: Record<string, unknown> = {
        last_used_at: new Date().toISOString(),
        use_count: supabaseAdmin.rpc('increment', { row_id: keyId, column_name: 'use_count' }),
    };
    
    if (!success) {
        updates.error_count = supabaseAdmin.rpc('increment', { row_id: keyId, column_name: 'error_count' });
        updates.last_error = error || 'Unknown error';
        
        // If rate limited, set reset time (1 minute)
        if (error?.includes('429') || error?.toLowerCase().includes('rate limit')) {
            updates.rate_limit_reset = new Date(Date.now() + 60000).toISOString();
        }
    }
    
    // Simple update without RPC
    const { error: updateError } = await supabaseAdmin
        .from('gemini_api_keys')
        .update({
            last_used_at: new Date().toISOString(),
            ...(success ? {} : { last_error: error || 'Unknown error' }),
        })
        .eq('id', keyId);
    
    // Increment counters separately
    if (success) {
        await supabaseAdmin.rpc('increment_gemini_use_count', { key_id: keyId });
    } else {
        await supabaseAdmin.rpc('increment_gemini_error_count', { key_id: keyId });
    }
    
    if (updateError) {
        console.error('Failed to update key usage:', updateError);
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
): Promise<{ success: boolean; text?: string; error?: string; tokensUsed?: number }> {
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
            return { success: false, error: errorMsg };
        }
        
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const tokensUsed = data?.usageMetadata?.totalTokenCount;
        
        if (!text) {
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
    
    // Get API key
    const apiKeyRecord = await getNextApiKey();
    if (!apiKeyRecord) {
        return { success: false, error: 'No API keys available. Please configure Gemini API keys in admin settings.' };
    }
    
    // Call Gemini
    const result = await callGeminiApi(apiKeyRecord.key, model, contents, request.webSearch);
    
    // Update key usage
    await updateKeyUsage(apiKeyRecord.id, result.success, result.error);
    
    if (!result.success) {
        // Try next key if available
        const nextKey = await getNextApiKey();
        if (nextKey && nextKey.id !== apiKeyRecord.id) {
            const retryResult = await callGeminiApi(nextKey.key, model, contents, request.webSearch);
            await updateKeyUsage(nextKey.id, retryResult.success, retryResult.error);
            
            if (retryResult.success) {
                // Save to session
                saveToSession(session.key, userMessage);
                saveToSession(session.key, { role: 'model', parts: [{ text: retryResult.text }] });
                
                return {
                    success: true,
                    text: retryResult.text,
                    model,
                    sessionKey: session.key,
                    tokensUsed: retryResult.tokensUsed,
                };
            }
        }
        
        return { success: false, error: result.error };
    }
    
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
