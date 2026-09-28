import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { supabase } from './db/supabase.js';
import { uploadsDir } from './middleware/upload.js';
import { getConfiguredGeminiModel } from './services/aiService.js';

// Route Modules
import authRoutes from './routes/authRoutes.js';
import corporateRoutes from './routes/corporateRoutes.js';
import academicRoutes from './routes/academicRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import ragRoutes from './routes/ragRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Global Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Incoming HTTP Request Logger
app.use((req, res, next) => {
  const timeStr = new Date().toLocaleTimeString();
  const summary = req.method === 'GET' ? '' : (req.body && Object.keys(req.body).length > 0 ? `| Payload: ${JSON.stringify(req.body).substring(0, 100)}...` : '');
  console.log(`📡 [UI ACTION] ${req.method} ${req.originalUrl} (${timeStr}) ${summary}`);
  next();
});

// Serve uploads if configured
if (uploadsDir && uploadsDir.length > 0) {
  app.use('/uploads', express.static(uploadsDir));
}

const isSupabaseConfigured = () => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_URL.includes('your-project'));
};

// -------------------------------------------------------------
// Core System & Health Endpoints
// -------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PAATAM.AI Backend Active (Enterprise School Management + AI Engine)',
    primaryProvider: process.env.PRIMARY_AI_PROVIDER || 'gemini',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel: getConfiguredGeminiModel(),
    sarvamConfigured: Boolean(process.env.SARVAM_API_KEY),
    sarvamChatModel: process.env.SARVAM_CHAT_MODEL || 'sarvam-105b',
    supabaseActive: isSupabaseConfigured()
  });
});

app.get('/api/test-models', async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const results: any = { gemini: {} };

  if (geminiKey) {
    try {
      const modelName = getConfiguredGeminiModel();
      const resGemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping test' }] }] })
      });
      results.gemini.status = resGemini.status;
      results.gemini.model = modelName;
      if (resGemini.ok) {
        const data = await resGemini.json() as any;
        results.gemini.response = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      } else {
        results.gemini.error = await resGemini.text();
      }
    } catch (e: any) {
      results.gemini.error = e.message;
    }
  } else {
    results.gemini.status = 'GEMINI_API_KEY missing';
  }

  res.json(results);
});

app.delete('/api/clear', async (req, res) => {
  try {
    console.log(`\n🧹 [DATABASE RESET] Received request to clear all Supabase tables...`);
    if (isSupabaseConfigured()) {
      await supabase.from('notifications').delete().neq('id', '');
      await supabase.from('submissions').delete().neq('id', '');
      await supabase.from('assignments').delete().neq('id', '');
      await supabase.from('students').delete().neq('id', '');
      await supabase.from('parents').delete().neq('id', '');
      await supabase.from('teacher_subject').delete().neq('id', '');
      await supabase.from('section').delete().neq('id', '');
      await supabase.from('class_subjects').delete().neq('id', '');
      await supabase.from('classes').delete().neq('id', '');
      await supabase.from('teacher').delete().neq('id', '');
      await supabase.from('subjects').delete().neq('id', '');
      await supabase.from('academic_years').delete().neq('id', '');
      await supabase.from('admin_branch_access').delete().neq('id', '');
      await supabase.from('branches').delete().neq('id', '');
      await supabase.from('admins').delete().neq('id', '');
      await supabase.from('corporate').delete().neq('id', '');
      await supabase.from('textbook_embeddings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    console.log(`✅ [DATABASE RESET] All Supabase tables cleaned.`);
    res.json({ success: true, message: 'All Supabase database records cleared clean.' });
  } catch (err: any) {
    console.error('❌ Database Clear Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// Mount Modular API Routers
// -------------------------------------------------------------
app.use('/api', authRoutes);
app.use('/api', corporateRoutes);
app.use('/api', academicRoutes);
app.use('/api', teacherRoutes);
app.use('/api', studentRoutes);
app.use('/api', assignmentRoutes);
app.use('/api', submissionRoutes);
app.use('/api', notificationRoutes);
app.use('/api', ragRoutes);
app.use('/api', analyticsRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('💥 Unhandled Express Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Server
app.listen(port, () => {
  console.log(`\n===============================================================`);
  console.log(`🚀 PAATAM.AI Full Backend running at http://localhost:${port}`);
  console.log(`⚡ School ERP Hierarchy: Corporate, Branches, Classes, Sections, Teachers, Students`);
  console.log(`⚡ AI Evaluation Engine: Active (OCR + Gemini / Sarvam Multi-Agent)`);
  console.log(`⚡ RAG Vector Store: Active (pgvector textbook_embeddings)`);
  console.log(`⚡ Parent WhatsApp System: Active`);
  console.log(`===============================================================\n`);
});
