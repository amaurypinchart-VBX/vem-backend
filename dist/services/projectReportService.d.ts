export declare function gatherProjectReportData(projectId: string): Promise<{
    project: any;
    client: any;
    technicalManager: any;
    team: any;
    trucks: any;
    teamBookings: any;
    hotelBookings: any;
    tasks: {
        total: any;
        done: any;
        overdue: any;
        list: any;
    };
    tickets: {
        total: any;
        open: any;
        critical: any;
        list: any;
    };
    dailyReports: any;
}>;
export type ProjectReportData = Awaited<ReturnType<typeof gatherProjectReportData>>;
export declare function generateProjectReport(projectId: string): Promise<{
    text: string;
    data: ProjectReportData;
    narrative: string;
}>;
