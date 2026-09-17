export interface AssistantResult {
    answer: string;
    toolCalls: Array<{
        name: string;
        input: any;
    }>;
}
export declare function askAssistant(question: string, user: {
    firstName: string;
    lastName: string;
    role: string;
}): Promise<AssistantResult>;
