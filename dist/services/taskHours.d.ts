export declare function classifyProjectEntries(projectId: string): Promise<void>;
export interface TaskHoursResult {
    data: Array<{
        taskTitle: string;
        stage: string | null;
        hours: number;
    }>;
    totalHours: number;
    unclassifiedHours: number;
}
export declare function computeProjectTaskHours(projectId: string): Promise<TaskHoursResult>;
