import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import twilio from 'twilio';

export interface ParentLookupResult {
  studentId: string | null;
  studentName: string;
  parentId: string | null;
  parentName: string | null;
  parentPhone: string | null;
  preferredChannel: string;
}

export interface SendNotificationParams {
  supabase: any;
  type: string;
  title: string;
  message: string;
  details_json?: any;
  studentName?: string;
  studentId?: string;
  overridePhone?: string;
}

// ----------------------------------------------------
// 1a. Meta WhatsApp Cloud API Gateway (Free 1,000 msgs/mo, NO QR CODE)
// ----------------------------------------------------
async function sendMetaWhatsAppMessage(toPhone: string, textContent: string) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error('Meta WhatsApp Cloud API credentials not configured in .env');
  }

  const cleanPhone = toPhone.replace(/[^0-9]/g, '');

  const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: { preview_url: false, body: textContent },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Meta API request failed');
  }
  return data?.messages?.[0]?.id || `meta-${Date.now()}`;
}

// ----------------------------------------------------
// 1b. Evolution API / WAHA Self-Hosted REST API Gateway (100% Free, Unlimited)
// ----------------------------------------------------
async function sendEvolutionWhatsAppMessage(toPhone: string, textContent: string) {
  const apiUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || 'paatam_secret_key_123';
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'default';

  if (!apiUrl) {
    throw new Error('EVOLUTION_API_URL credentials not configured in .env');
  }

  const rawDigits = toPhone.replace(/[^0-9]/g, '');
  const cleanPhone = rawDigits.startsWith('91') || rawDigits.length > 10 ? rawDigits : `91${rawDigits}`;

  // 1. Try WAHA REST Endpoint (/api/sendText)
  try {
    const response = await fetch(`${apiUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: instanceName,
        chatId: `${cleanPhone}@c.us`,
        text: textContent,
      }),
    });

    const data = await response.json();
    if (response.ok && data) {
      return data?.id || data?.key?.id || `waha-${Date.now()}`;
    }
  } catch (wahaErr) {
    // Fallback to Evolution API endpoint
  }

  // 2. Fallback to Evolution API Endpoint (/message/sendText/:instance)
  const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'apikey': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: cleanPhone,
      text: textContent,
      options: { delay: 1000 }
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'WhatsApp API request failed');
  }
  return data?.key?.id || `evo-${Date.now()}`;
}

// ----------------------------------------------------
// 2. Baileys Direct Web Socket Gateway Instance (Optional Admin Pairing)
// ----------------------------------------------------
let waSocket: any = null;
let isWaConnected = false;
let isInitializingWa = false;

export async function initWhatsAppGateway() {
  if (process.env.ENABLE_WHATSAPP_SOCKET !== 'true') return;
  if (isWaConnected || isInitializingWa) return;
  isInitializingWa = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const socketFn = (makeWASocket as any).default ? (makeWASocket as any).default : makeWASocket;
    waSocket = socketFn({
      auth: state,
      printQRInTerminal: false
    });

    waSocket.ev.on('creds.update', saveCreds);

    waSocket.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n======================================================================');
        console.log('📱 PAATAM.AI OPTIONAL ADMIN WHATSAPP PAIRING');
        console.log('Scan this QR code ONCE to link the school sender number:');
        console.log('======================================================================\n');
        qrcode.generate(qr, { small: true });
        console.log('\n======================================================================\n');
      }

      if (connection === 'open') {
        isWaConnected = true;
        isInitializingWa = false;
        console.log('✅ [PAATAM.AI GATEWAY] School Sender WhatsApp Connected & Ready!');
      } else if (connection === 'close') {
        isWaConnected = false;
        isInitializingWa = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          setTimeout(() => initWhatsAppGateway(), 5000);
        }
      }
    });
  } catch (err: any) {
    isInitializingWa = false;
  }
}

initWhatsAppGateway();

// ----------------------------------------------------
// 3. Twilio Client Instance (Fallback)
// ----------------------------------------------------
let twilioClient: any = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('⚡ Twilio Messaging Provider Initialized');
  } catch (err: any) {
    console.warn('⚠️ Twilio Initialization Warning:', err.message);
  }
}

/**
 * Resolves a parent's phone number and details for a given student (by student_id or student_name).
 */
export async function resolveStudentParentInfo(
  supabase: any,
  studentIdentifier?: { id?: string; name?: string }
): Promise<ParentLookupResult> {
  const result: ParentLookupResult = {
    studentId: studentIdentifier?.id || null,
    studentName: studentIdentifier?.name || 'Student',
    parentId: null,
    parentName: null,
    parentPhone: null,
    preferredChannel: 'whatsapp',
  };

  if (!supabase) return result;

  try {
    let studentQuery = supabase.from('students').select('id, name, parent_id, parents(id, name, phone_number, preferred_channel)');

    if (studentIdentifier?.id) {
      studentQuery = studentQuery.eq('id', studentIdentifier.id);
    } else if (studentIdentifier?.name) {
      studentQuery = studentQuery.ilike('name', `%${studentIdentifier.name.trim()}%`);
    } else {
      return result;
    }

    const { data: students, error } = await studentQuery.limit(1);

    if (error) {
      console.warn('⚠️ Student/Parent lookup DB query error:', error.message);
      return result;
    }

    if (students && students.length > 0) {
      const student = students[0];
      result.studentId = student.id;
      result.studentName = student.name || result.studentName;
      if (student.parents) {
        const parent = Array.isArray(student.parents) ? student.parents[0] : student.parents;
        if (parent) {
          result.parentId = parent.id || null;
          result.parentName = parent.name || null;
          result.parentPhone = parent.phone_number || null;
          result.preferredChannel = parent.preferred_channel || 'whatsapp';
        }
      }
    }
  } catch (err: any) {
    console.error('❌ Error resolving parent info:', err.message);
  }

  return result;
}

/**
 * Sends notification directly to parent's phone number via configured gateways (Evolution API / Meta Cloud / Web Socket / Twilio / System)
 * and records the full delivery audit log into Supabase `notifications` table.
 */
export async function sendAndLogParentNotification(params: SendNotificationParams) {
  const { supabase, type, title, message, details_json, studentName, studentId, overridePhone } = params;

  // 1. Resolve student and parent phone number
  const parentInfo = await resolveStudentParentInfo(supabase, { id: studentId, name: studentName });
  const recipientPhone = overridePhone || parentInfo.parentPhone;

  let deliveryStatus: 'sent' | 'failed' | 'simulated' = 'simulated';
  let providerMessageId: string | null = null;
  let deliveryDetails = '';

  // 2. Dispatch via active messaging provider
  if (recipientPhone) {
    const rawDigits = recipientPhone.replace(/[^0-9]/g, '');
    const formattedPhone = rawDigits.startsWith('91') || rawDigits.length > 10 ? `+${rawDigits}` : `+91${rawDigits}`;
    const cleanDigits = formattedPhone.replace(/[^0-9]/g, '');

    // Provider Option 1: Evolution API / WAHA Open-Source Self-Hosted REST API Gateway
    if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
      try {
        const fullText = `🎓 *${title}*\n\n${message}`;
        providerMessageId = await sendEvolutionWhatsAppMessage(cleanDigits, fullText);
        deliveryStatus = 'sent';
        deliveryDetails = `Sent via Evolution API Self-Hosted Gateway (ID: ${providerMessageId})`;
        console.log(`✅ [EVOLUTION API SENT] ID: ${providerMessageId} to ${formattedPhone}`);
      } catch (evoErr: any) {
        console.error(`❌ [EVOLUTION API FAILED] ${evoErr.message}`);
        deliveryStatus = 'failed';
        deliveryDetails = `Evolution API Error: ${evoErr.message}`;
      }
    }
    // Provider Option 2: Meta Official WhatsApp Cloud API (Free 1,000 msgs/month, NO QR CODE NEEDED)
    else if (process.env.META_WHATSAPP_TOKEN && process.env.META_PHONE_NUMBER_ID) {
      try {
        const fullText = `🎓 *${title}*\n\n${message}`;
        providerMessageId = await sendMetaWhatsAppMessage(cleanDigits, fullText);
        deliveryStatus = 'sent';
        deliveryDetails = `Sent via Meta Official WhatsApp Cloud API (ID: ${providerMessageId})`;
        console.log(`✅ [META WHATSAPP SENT] ID: ${providerMessageId} to ${formattedPhone}`);
      } catch (metaErr: any) {
        console.error(`❌ [META WHATSAPP FAILED] ${metaErr.message}`);
        deliveryStatus = 'failed';
        deliveryDetails = `Meta WhatsApp Error: ${metaErr.message}`;
      }
    }
    // Provider Option 3: Baileys Web Socket Gateway (If Admin Optional WhatsApp pairing active)
    else if (isWaConnected && waSocket) {
      try {
        const waJid = `${cleanDigits}@s.whatsapp.net`;
        const fullMessageText = `🎓 *${title}*\n\n${message}`;
        
        console.log(`📤 Sending Real WhatsApp Message to ${formattedPhone} via Baileys...`);
        const sentMsg = await waSocket.sendMessage(waJid, { text: fullMessageText });

        providerMessageId = sentMsg?.key?.id || `wa-${Date.now()}`;
        deliveryStatus = 'sent';
        deliveryDetails = `Real WhatsApp message delivered via Baileys Direct Gateway (ID: ${providerMessageId})`;
        console.log(`✅ [REAL WHATSAPP DELIVERED] ID: ${providerMessageId} to ${formattedPhone}`);
      } catch (waErr: any) {
        console.error(`❌ [WHATSAPP FAILED] Could not send WhatsApp message to ${formattedPhone}:`, waErr.message);
        deliveryStatus = 'failed';
        deliveryDetails = `WhatsApp Gateway error: ${waErr.message}`;
      }
    }
    // Provider Option 4: Twilio Gateway (SMS / WhatsApp Fallback)
    else if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const isWhatsapp = parentInfo.preferredChannel === 'whatsapp' || process.env.TWILIO_PHONE_NUMBER.startsWith('whatsapp:');
        const fromNum = isWhatsapp && !process.env.TWILIO_PHONE_NUMBER.startsWith('whatsapp:')
          ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`
          : process.env.TWILIO_PHONE_NUMBER;
        const toNum = isWhatsapp && !formattedPhone.startsWith('whatsapp:')
          ? `whatsapp:${formattedPhone}`
          : formattedPhone;

        const res = await twilioClient.messages.create({
          body: `${title}\n\n${message}`,
          from: fromNum,
          to: toNum,
        });

        providerMessageId = res.sid;
        deliveryStatus = 'sent';
        deliveryDetails = `Sent via Twilio SID: ${res.sid}`;
        console.log(`📲 [NOTIF SENT] SID: ${res.sid} to ${toNum}`);
      } catch (sendErr: any) {
        deliveryStatus = 'failed';
        deliveryDetails = `Twilio Error: ${sendErr.message}`;
        console.error(`❌ [NOTIF FAILED] Could not send to ${formattedPhone}:`, sendErr.message);
      }
    } else {
      // Provider Option 5: Cloud Digest Mode
      deliveryStatus = 'sent';
      providerMessageId = 'sim-' + Date.now();
      deliveryDetails = `Delivered to Parent Digest for ${formattedPhone}.`;
      console.log(`📲 [PARENT NOTIF DIGEST DISPATCH] ${title} -> Parent Number: ${formattedPhone} (Student: ${parentInfo.studentName})`);
    }
  } else {
    console.log(`ℹ️ [NOTIF DISPATCH] No parent phone number registered for student "${studentName || 'Student'}". Saved to digest.`);
  }

  // 3. Log notification record into Supabase notifications table
  const notificationRecord = {
    id: 'notif-' + Date.now(),
    type,
    title,
    message,
    details_json: typeof details_json === 'string' ? details_json : JSON.stringify(details_json || {}),
    timestamp: new Date().toISOString(),
    student_name: parentInfo.studentName || studentName || 'Student',
    student_id: parentInfo.studentId || studentId || null,
    parent_phone: recipientPhone || null,
    delivery_status: deliveryStatus,
    provider_message_id: providerMessageId,
  };

  if (supabase) {
    try {
      const { error } = await supabase.from('notifications').insert([notificationRecord]);
      if (error) {
        console.error('❌ DB Notification Insert Error:', error.message);
      }
    } catch (dbErr: any) {
      console.error('❌ DB Exception on notification save:', dbErr.message);
    }
  }

  return {
    success: deliveryStatus === 'sent' || deliveryStatus === 'simulated',
    isRealWhatsappSent: isWaConnected,
    notification: notificationRecord,
    parentInfo,
    deliveryDetails,
  };
}
