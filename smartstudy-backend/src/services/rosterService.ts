import { supabase } from '../db/supabase.js';

export interface StudentEnrollmentPayload {
  name: string;
  rollNumber?: string;
  admissionNo?: string;
  classId?: string;
  sectionId?: string;
  contactEmail?: string;
  contactMobile?: string;
  password?: string;
  parentId?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentPreferredChannel?: 'whatsapp' | 'sms' | 'email';
}

/**
 * Creates or updates a student and links their parent and section.
 */
export async function enrollStudent(payload: StudentEnrollmentPayload) {
  let resolvedParentId = payload.parentId || null;

  // 1. Upsert parent if phone provided
  if (!resolvedParentId && payload.parentPhone) {
    const parentRecord: any = {
      name: payload.parentName || `${payload.name}'s Parent`,
      phone_number: payload.parentPhone,
      email: payload.parentEmail || null,
      preferred_channel: payload.parentPreferredChannel || 'whatsapp'
    };

    const { data: parentData, error: parentError } = await supabase
      .from('parents')
      .upsert(parentRecord, { onConflict: 'phone_number' })
      .select()
      .single();

    if (!parentError && parentData) {
      resolvedParentId = parentData.id;
    }
  }

  // 2. Prepare student record
  const studentRecord: any = {
    name: payload.name,
    roll_number: payload.rollNumber || null,
    admission_no: payload.admissionNo || null,
    class_id: payload.classId || null,
    section_id: payload.sectionId || null,
    parent_id: resolvedParentId,
    contact_email: payload.contactEmail || null,
    contact_mobile: payload.contactMobile || null
  };

  const { data: student, error: studentError } = await supabase
    .from('students')
    .insert([studentRecord])
    .select('*, parents(*)')
    .single();

  if (studentError) {
    throw new Error(`Failed to create student: ${studentError.message}`);
  }

  // 3. Update section strength if assigned to a section
  if (payload.sectionId) {
    await updateSectionStrength(payload.sectionId);
  }

  return student;
}

/**
 * Recalculates and updates the enrolled strength count for a section.
 */
export async function updateSectionStrength(sectionId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('section_id', sectionId);

    if (!error && typeof count === 'number') {
      await supabase
        .from('section')
        .update({ strength: count })
        .eq('id', sectionId);
      return count;
    }
  } catch (err) {
    console.warn('⚠️ Could not update section strength:', err);
  }
  return 0;
}

/**
 * Bulk enrollment from a list of student records.
 */
export async function bulkEnrollStudents(records: StudentEnrollmentPayload[]) {
  const results = {
    total: records.length,
    successful: 0,
    failed: 0,
    students: [] as any[],
    errors: [] as { row: number; error: string }[]
  };

  const affectedSections = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    try {
      const student = await enrollStudent(records[i]);
      results.students.push(student);
      results.successful++;
      if (records[i].sectionId) {
        affectedSections.add(records[i].sectionId!);
      }
    } catch (err: any) {
      results.failed++;
      results.errors.push({ row: i + 1, error: err?.message || 'Enrollment error' });
    }
  }

  // Recalculate strength for all touched sections
  for (const secId of affectedSections) {
    await updateSectionStrength(secId);
  }

  return results;
}

/**
 * Helper to parse CSV formatted string of students.
 */
export function parseStudentsCsv(csvContent: string): StudentEnrollmentPayload[] {
  const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const students: StudentEnrollmentPayload[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length === 0 || !values[0]) continue;

    const row: any = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });

    students.push({
      name: row.name || row.student_name || 'Student',
      rollNumber: row.roll_number || row.roll_no || row.roll || '',
      admissionNo: row.admission_no || row.admission_number || '',
      classId: row.class_id || '',
      sectionId: row.section_id || '',
      contactEmail: row.contact_email || row.email || '',
      contactMobile: row.contact_mobile || row.mobile || '',
      parentName: row.parent_name || '',
      parentPhone: row.parent_phone || row.phone_number || '',
      parentEmail: row.parent_email || ''
    });
  }

  return students;
}
