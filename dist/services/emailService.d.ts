export declare function sendMail(opts: {
    to: string | string[];
    subject: string;
    html: string;
    attachments?: any[];
}): Promise<{
    messageId: any;
}>;
export declare function sendTestEmail(to: string): Promise<{
    messageId: any;
}>;
export declare function sendTicketAssigned(opts: {
    to: string;
    ticketTitle: string;
    urgency: string;
    project: string;
    location?: string;
    assignee: string;
    description: string;
    appUrl: string;
}): Promise<void>;
export declare function sendDailyReport(opts: {
    to: string | string[];
    projectName: string;
    date: string;
    notes?: string;
    entries: any[];
    pdfBuffer?: Buffer;
    lang?: 'fr' | 'en';
}): Promise<void>;
export declare function sendHandoverPdf(opts: {
    to: string | string[];
    projectName: string;
    pdfBuffer: Buffer;
}): Promise<void>;
export declare function sendTicketEscalation(opts: {
    to: string;
    ticketTitle: string;
    projectName: string;
    hours: number;
    appUrl: string;
}): Promise<void>;
