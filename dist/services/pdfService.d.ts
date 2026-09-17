type Lang = 'fr' | 'en';
export declare function generateHandoverPdf(data: {
    project: {
        name: string;
        internalNumber: string;
        address: string;
    };
    clientName: string;
    siteManagerName: string;
    items: Array<{
        zoneName: string;
        status: string;
        comment?: string | null;
        photos?: Array<{
            photoUrl: string;
        }>;
    }>;
    generalNotes?: string | null;
    scopeOfWork?: string | null;
    customFields?: Record<string, any> | null;
    clientSignatureUrl?: string | null;
    managerSignatureUrl?: string | null;
    date: Date;
    lang?: Lang;
}): Promise<Buffer>;
export declare function generateDailyReportPdf(data: {
    project: {
        name: string;
        internalNumber: string;
    };
    client?: {
        name?: string | null;
        contactName?: string | null;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
    } | null;
    reportDate: Date;
    createdBy?: string;
    weather?: string | null;
    workersPresent: number;
    generalNotes?: string | null;
    entries: Array<{
        entryTime: string;
        description: string;
    }>;
    checklist: Array<{
        item: string;
        checked: boolean;
        notes?: string | null;
    }>;
    photos?: Array<{
        photoUrl: string;
        caption?: string | null;
    }>;
    reportId?: string;
    lang?: Lang;
}): Promise<Buffer>;
export declare function generateProjectReportPdf(data: {
    project: {
        name: string;
        internalNumber: string;
        status: string;
        address: string;
        city?: string | null;
        installationStart: Date;
        installationEnd: Date;
        dismantlingStart?: Date | null;
        dismantlingEnd?: Date | null;
    };
    client?: {
        name?: string | null;
    } | null;
    technicalManager?: {
        firstName: string;
        lastName: string;
    } | null;
    team: Array<{
        role: string;
        isLead: boolean;
        user: {
            firstName: string;
            lastName: string;
        };
    }>;
    trucks: Array<{
        vehicleType?: string | null;
        truckNumber?: string | null;
        driverName?: string | null;
        status: string;
        loadingDate?: Date | null;
    }>;
    teamBookings: Array<any>;
    hotelBookings: Array<{
        hotelName: string;
        checkin: Date;
        checkout: Date;
        occupants: Array<{
            user: {
                firstName: string;
                lastName: string;
            };
        }>;
    }>;
    tasks: {
        total: number;
        done: number;
        overdue: number;
    };
    tickets: {
        total: number;
        open: number;
        critical: number;
        list: Array<{
            title: string;
            status: string;
            urgency: string;
        }>;
    };
    dailyReports: Array<any>;
    narrative: string;
    lang?: Lang;
}): Promise<Buffer>;
export declare function generateVisitReportPdf(data: {
    project: {
        name: string;
        internalNumber: string;
    };
    visit: {
        id: string;
        title: string;
        visitDate: Date;
        notes?: string | null;
        client?: {
            name: string;
        } | null;
    };
    points: Array<{
        title: string;
        description?: string | null;
        zone?: string | null;
        status?: string | null;
        priority?: string | null;
        assignedToUser?: {
            firstName: string;
            lastName: string;
        } | null;
        photos?: Array<{
            photoUrl: string;
            caption?: string | null;
        }>;
    }>;
    lang?: Lang;
}): Promise<Buffer>;
export {};
