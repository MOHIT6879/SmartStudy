import multer from 'multer';

// Use 100% In-Memory Buffer (No disk uploads folder created!)
const storage = multer.memoryStorage();

export const uploadDisk = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max file size for bulk ZIP/PDF uploads
});

export const uploadsDir: string = '';
