import multer from 'multer';
// Use 100% In-Memory Buffer (No disk uploads folder created!)
const storage = multer.memoryStorage();
export const uploadDisk = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max file size
});
export const uploadsDir = '';
