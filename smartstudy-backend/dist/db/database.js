import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Local Database File
const dbDir = path.resolve(__dirname, '../../');
const dbPath = path.join(dbDir, 'smartstudy.db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const sqlite = sqlite3.verbose();
export const db = new sqlite.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to connect to SQLite database:', err.message);
    }
    else {
        console.log(`✅ Clean SQLite Database connected at: ${dbPath}`);
    }
});
export function queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
}
export function queryGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
}
export function executeRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err)
                reject(err);
            else
                resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}
/**
 * Initialize Clean Database Schema (No Hardcoded Placeholders)
 */
export async function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            try {
                // 1. Assignments Table
                await executeRun(`
          CREATE TABLE IF NOT EXISTS assignments (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            class_name TEXT NOT NULL,
            questions_json TEXT NOT NULL,
            status TEXT DEFAULT 'dispatched',
            created_at TEXT NOT NULL
          )
        `);
                // 2. Submissions Table
                await executeRun(`
          CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            assignment_id TEXT NOT NULL,
            student_name TEXT NOT NULL,
            subject TEXT NOT NULL,
            language TEXT NOT NULL,
            lang_code TEXT NOT NULL,
            sample_paper_url TEXT,
            ocr_text TEXT,
            score INTEGER,
            feedback TEXT,
            socratic_hint TEXT,
            final_score INTEGER,
            final_feedback TEXT,
            final_hint TEXT,
            status TEXT DEFAULT 'pending_review',
            submitted_at TEXT NOT NULL
          )
        `);
                // 3. Notifications Table
                await executeRun(`
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            details_json TEXT,
            timestamp TEXT NOT NULL,
            student_name TEXT
          )
        `);
                console.log('✨ Database tables initialized clean with 0 placeholders.');
                resolve();
            }
            catch (err) {
                console.error('❌ Error initializing clean database schema:', err);
                reject(err);
            }
        });
    });
}
/**
 * Utility to wipe all database tables clean
 */
export async function clearAllData() {
    await executeRun('DELETE FROM submissions');
    await executeRun('DELETE FROM assignments');
    await executeRun('DELETE FROM notifications');
    console.log('🧹 All database records cleared.');
}
