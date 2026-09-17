export declare function pollImapOnce(): Promise<{
    processed: number;
    skipped: number;
    errors: number;
}>;
export declare function startImapPoller(): void;
export declare function stopImapPoller(): void;
