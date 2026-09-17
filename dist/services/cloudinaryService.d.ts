import multer from 'multer';
export declare const upload: multer.Multer;
export declare function uploadToCloudinary(buffer: Buffer, folder: string, options?: Record<string, any>): Promise<{
    url: string;
    publicId: string;
}>;
export declare function deleteFromCloudinary(publicId: string): Promise<void>;
