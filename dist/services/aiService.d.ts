import { z } from 'zod';
export declare const DEFAULT_MODEL: string;
export declare function anthropicRequest(body: Record<string, any>, opts?: {
    timeoutMs?: number;
    retries?: number;
}): Promise<any>;
export interface CallClaudeParams {
    messages: Array<{
        role: 'user' | 'assistant';
        content: any;
    }>;
    system?: string | Array<{
        type: 'text';
        text: string;
        cache_control?: {
            type: 'ephemeral';
        };
    }>;
    maxTokens?: number;
    model?: string;
    timeoutMs?: number;
}
export declare function callClaude(params: CallClaudeParams): Promise<string>;
export interface CallClaudeJSONParams<T> extends CallClaudeParams {
    schema: z.ZodType<T, any, any>;
}
export declare function callClaudeJSON<T>(params: CallClaudeJSONParams<T>): Promise<T>;
