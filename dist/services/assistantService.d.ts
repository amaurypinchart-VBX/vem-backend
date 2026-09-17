export interface AssistantUser {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
}
export interface AssistantResult {
    answer: string;
    toolCalls: Array<{
        name: string;
        input: any;
    }>;
    reportProjectId?: string;
}
export declare function askAssistant(question: string, user: AssistantUser, history?: Array<{
    role: 'user' | 'assistant';
    text: string;
}>): Promise<AssistantResult>;
