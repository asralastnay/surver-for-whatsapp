const { makeWASocket, useMultiFileAuthState, DisconnectReason, WAMessageStubType, makeInMemoryStore, jidNormalized, generateWAMessage, proto } = require('@whiskeysockets/baileys');
const { WAStore, WASQLiteStore } = require('wa-store');
const pino = require('pino');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');

// ---------------------------------------------------------------------
// 1. المتغيرات الهامة من البيئة
// ---------------------------------------------------------------------
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const DATABASE_URL = process.env.DATABASE_URL;
const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// 2. التحقق من صلاحية مفتاح API
// ---------------------------------------------------------------------
const checkApiKey = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Forbidden: Invalid API Key' });
    }
};

// ---------------------------------------------------------------------
// 3. إعداد السيرفر (Express)
// ---------------------------------------------------------------------
const app = express();
app.use(express.json());

// مسار صحة الخدمة
app.get('/', (req, res) => {
    res.send('WhatsApp Webhook Gateway is Running and Awaiting Connection...');
});

// ---------------------------------------------------------------------
// 4. دالة الربط وبدء البوت
// ---------------------------------------------------------------------

async function connectToWhatsApp() {
    if (!DATABASE_URL) {
        console.error("FATAL: DATABASE_URL is not set. Cannot run without PostgreSQL.");
        return;
    }

    // إعداد تخزين الجلسة باستخدام PostgreSQL
    const store = new WAStore({ url: DATABASE_URL });
    await store.initialize();
    const { state, saveCreds } = await store.useLegacyAuth();

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Render Webhook Gateway', 'Baileys', '1.0'] // تعريف البوت
    });

    // حفظ الجلسة في PostgreSQL عند كل تحديث
    sock.ev.on('creds.update', saveCreds);

    // ---------------------------------------------------------------------
    // 5. مسار الـ API للإرسال (التحكم من البوت الرئيسي)
    // ---------------------------------------------------------------------
    app.post('/send', checkApiKey, async (req, res) => {
        const { jid, text, media, button_message } = req.body;
        
        if (!jid) return res.status(400).json({ success: false, message: 'JID is required' });

        try {
            if (text) {
                await sock.sendMessage(jid, { text });
                return res.json({ success: true, message: 'Text message sent' });
            } else if (media && media.url) {
                // إرسال الوسائط (صورة أو فيديو)
                const type = media.type || 'image'; // القيمة الافتراضية صورة
                const messageType = {
                    [type]: { url: media.url },
                    caption: media.caption || ''
                };
                await sock.sendMessage(jid, messageType);
                return res.json({ success: true, message: `${type} sent` });

            } else if (button_message) {
                // إرسال رسائل الأزرار (Buttons)
                const { buttons, header, body, footer } = button_message;

                const message = {
                    text: body,
                    footer: footer,
                    buttons: buttons.map((btn, index) => ({
                        buttonId: `id-${index}-${Date.now()}`,
                        buttonText: { displayText: btn.text },
                        type: 1
                    })),
                    headerType: 1
                };

                await sock.sendMessage(jid, message);
                return res.json({ success: true, message: 'Button message sent' });
            } 
            
            return res.status(400).json({ success: false, message: 'No valid message type provided (text, media, or button_message)' });

        } catch (error) {
            console.error('Error sending message:', error);
            return res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
        }
    });

    // ---------------------------------------------------------------------
    // 6. معالجة الرسائل الواردة وتحويلها إلى الـ Webhook
    // ---------------------------------------------------------------------
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        
        // تجاهل رسائل البوت نفسه والرسائل الفارغة
        if (!msg.key.fromMe && m.type === 'notify' && msg.message && WEBHOOK_URL) {
            
            let messageContent = { type: 'text', content: msg.message.conversation || msg.message.extendedTextMessage?.text || '' };

            // معالجة الوسائط (Media)
            if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage) {
                // ملاحظة: Baileys لا ترسل رابط مباشر للوسائط تلقائياً، بل يجب عليك تحميلها أولاً.
                // لتسريع العملية، سنرسل فقط البيانات الوصفية (Metadata).
                messageContent = {
                    type: Object.keys(msg.message)[0].replace('Message', ''),
                    caption: msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '',
                    // هنا يمكنك إضافة منطق تحميل الوسائط (download media) إذا أردت إرسالها لرابطك
                    // حالياً نرسل فقط أنها وصلتنا
                };
            }

            // تجميع بيانات الـ Webhook
            const webhookData = {
                event: 'message_received',
                sender_jid: msg.key.remoteJid,
                message_id: msg.key.id,
                timestamp: msg.messageTimestamp,
                message: messageContent
            };
            
            try {
                await axios.post(WEBHOOK_URL, webhookData);
                console.log(`Message from ${msg.key.remoteJid} sent to Webhook successfully.`);
            } catch (error) {
                console.error('FAILED to send to Webhook:', WEBHOOK_URL, error.message);
                // رسالة خطأ للمستخدم يمكن إلغاؤها
                await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ البوت الرئيسي لا يستجيب للويب هوك الخاص بي.' });
            }
        }
    });

    // ---------------------------------------------------------------------
    // 7. مراقبة حالة الاتصال وإعادة الاتصال
    // ---------------------------------------------------------------------
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("------------------ Scan QR Code Now -------------------");
            qrcode.generate(qr, { small: true });
            console.log("-----------------------------------------------------");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to', lastDisconnect.error, ', Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Connection Open! Bot is ready to receive messages.');
        }
    });
}

// ابدأ السيرفر واستمع للمنفذ
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    connectToWhatsApp();
});
