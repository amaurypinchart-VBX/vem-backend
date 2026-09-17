interface EmailAttachment {
    content?: Buffer;
    filename?: string;
    contentType?: string;
}
interface EmailInput {
    subject: string;
    text: string;
    from: string;
    attachments: EmailAttachment[];
}
interface CreateResult {
    created: boolean;
    reason?: string;
    projectId?: string;
    internalNumber?: string;
    clientName?: string;
    filesUploaded?: number;
}
export declare function createProjectFromEmail(input: EmailInput): Promise<CreateResult>;
export {};
