interface EmailInput {
    projectId: string;
    internalNumber: string | null;
    subject: string;
    text: string;
    from: string;
}
interface CreateResult {
    created: number;
    trucks: number;
    hotels: number;
    team: number;
    skipped: string[];
}
export declare function createBookingsFromEmail(input: EmailInput): Promise<CreateResult>;
export {};
