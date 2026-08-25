import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials missing in .env (SUPABASE_URL and SUPABASE_ANON_KEY)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Upload an image buffer or file to Supabase Storage Bucket
 * Returns the public HTTPS URL of the uploaded image or Base64 Data URL fallback
 */
export async function uploadImageToSupabase(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const base64DataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  
  try {
    const bucketName = 'student-submissions';
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `submissions/${Date.now()}-${cleanFileName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      console.warn('⚠️ Supabase storage upload notice (Using Base64 Data URL fallback):', error.message);
      return base64DataUrl;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (publicUrlData && publicUrlData.publicUrl) {
      console.log(`✅ File uploaded to Supabase Storage: ${publicUrlData.publicUrl}`);
      return publicUrlData.publicUrl;
    }

    return base64DataUrl;
  } catch (err: any) {
    console.warn('⚠️ Upload exception (Using Base64 Data URL fallback):', err?.message || err);
    return base64DataUrl;
  }
}
