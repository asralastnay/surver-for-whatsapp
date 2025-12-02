const { 
    default: makeWASocket, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    initAuthCreds,
    BufferJSON
} = require('@whiskeysockets/baileys');
const { Pool } = require('pg');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

// ------------------------------------------------------------------
// إعدادات البيئة
// ------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
// رابط الويب هوك الخاص ببوت البايثون (تأكد من وجوده في متغيرات البيئة أو عدله هنا)
// مثال: https://your-python-bot.onrender.com/webhook
const PYTHON_BOT_URL = process.env.PYTHON_BOT_URL || "https://whatsapp-bot-jh7d.onrender.com/webhook"; 

// رابط قاعدة البيانات من Render
const CONNECTION_STRING = process.env.DATABASE_URL; 

let currentQR = null;
let isConnected = false;
let sock;

// ------------------------------------------------------------------
// إعداد قاعدة البيانات PostgreSQL
// ------------------------------------------------------------------
if (!CONNECTION_STRING) {
    console.error("❌ Error: DATABASE_URL is missing! Please add it in Render Environment Variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false } // ضروري لاستضافات مثل Render
});

// إنشاء جدول الجلسات إذا لم يكن موجوداً
async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (id VARCHAR(255) PRIMARY KEY, data TEXT)`);
}

// دالة لحذف الجلسة عند التلف
async function clearSession() {
    console.log("⚠️ Clearing session data from Database...");
    await pool.query('DELETE FROM auth_sessions');
}

// ------------------------------------------------------------------
// دالة التعامل مع تخزين الجلسة (Postgres Auth)
// ------------------------------------------------------------------
const usePostgresAuthState = async (saveCreds) => {
    const readData = async (type, id) => {
        const key = `${type}-${id}`;
        try {
            const res = await pool.query('SELECT data FROM auth_sessions WHERE id = $1', [key]);
            if (res.rows.length > 0) {
                // BufferJSON.reviver مهم جداً لاستعادة المفاتيح بشكل صحيح
                return JSON.parse(res.rows[0].data, BufferJSON.reviver);
            }
        } catch (error) {
            console.error('Error reading auth data:', error);
        }
        return null;
    };

    const writeData = async (data, type, id) => {
        const key = `${type}-${id}`;
        try {
            // BufferJSON.replacer مهم لحفظ المفاتيح الثنائية
            const value = JSON.stringify(data, BufferJSON.replacer);
            await pool.query(
                'INSERT INTO auth_sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                [key, value]
            );
        } catch (error) {
            console.error('Error writing auth data:', error);
        }
    };

    const creds = await readData('creds', 'main') || initAuthCreds();

    return {
        state: {
            creds: creds,
            keys: makeCacheableSignalKeyStore({
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const val = await readData(type, id);
                        if (val) data[id] = val;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            await writeData(data[category][id], category, id);
                        }
                    }
                }
            }, pino({ level: 'silent' }))
        },
        saveCreds: async () => {
            await writeData(creds, 'creds', 'main');
        }
    };
};

// ------------------------------------------------------------------
// تشغيل الواتساب (Start Socket)
// ------------------------------------------------------------------
async function startSock() {
    await initDb();
    const { state, saveCreds } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion();

    console.log(`Starting Baileys v${version.join('.')}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, 
        auth: state,
        browser: ["QuranBot", "Chrome", "4.0.0"], // اسم يظهر في الأجهزة المرتبطة
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            isConnected = false;
            console.log("⚡ New QR Code generated. Scan it now.");
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('❌ Connection closed. Reason code:', statusCode);

            // التعامل الذكي مع قطع الاتصال
            if (statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.loggedOut) {
                console.log(`⚠️ Session Corrupted or Logged Out. Clearing DB and Restarting...`);
                await clearSession(); // حذف الجلسة
                startSock(); // إعادة التشغيل من الصفر
            } else if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                startSock();
            } else {
                console.log('🔄 Restarting anyway...');
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ Connection Opened Successfully!');
            isConnected = true;
            currentQR = null; 
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            
            // استخراج النص من أنواع الرسائل المختلفة
            let text = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.imageMessage?.caption || "";

            if (text) {
                console.log(`📩 Message from ${sender}: ${text}`);
                // إرسال الرسالة إلى بوت البايثون
                await axios.post(PYTHON_BOT_URL, {
                    event: 'message',
                    payload: { from: sender, body: text, fromMe: false }
                });
            }
        } catch (err) {
            // لا توقف السيرفر عند حدوث خطأ بسيط في الرسالة
            console.error("Msg Error (Ignored):", err.message);
        }
    });
}

startSock();

// ------------------------------------------------------------------
// صفحة الويب (لعرض الباركود والحالة)
// ------------------------------------------------------------------
app.get('/', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');

    if (isConnected) {
        return res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                <h1 style="color: green;">✅ WhatsApp Connected!</h1>
                <p>The server is running and connected to WhatsApp.</p>
            </div>
        `);
    }

    if (currentQR) {
        try {
            const qrImage = await QRCode.toDataURL(currentQR);
            return res.send(`
                <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                    <h1>📱 Scan QR Code</h1>
                    <img src="${qrImage}" width="300" height="300" style="border: 5px solid #333; border-radius: 10px;" />
                    <p>Open WhatsApp > Linked Devices > Link a Device</p>
                    <p>Refreshing automatically in 5 seconds...</p>
                    <script>setTimeout(() => location.reload(), 5000);</script>
                </div>
            `);
        } catch (e) {
            return res.send("Error generating QR code.");
        }
    }

    return res.send(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1>⏳ Initializing...</h1>
            <p>Please wait...</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
        </div>
    `);
});

// ------------------------------------------------------------------
// API: إرسال النص
// ------------------------------------------------------------------
app.post('/api/sendText', async (req, res) => {
    const { chatId, text } = req.body;
    if (!sock || !isConnected) return res.status(503).json({ error: "WhatsApp not connected" });
    
    try {
        await sock.sendMessage(chatId, { text: text });
        res.json({ status: 'success' });
    } catch (err) {
        console.error("Send Text Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------------------------------
// API: إرسال الملفات (مع دعم PTT للآيفون)
// ------------------------------------------------------------------
app.post('/api/sendFile', async (req, res) => {
    // نستقبل ptt من البايثون
    const { chatId, file, mimetype, caption, ptt } = req.body; 
    
    if (!sock || !isConnected) return res.status(503).json({ error: "WhatsApp not connected" });

    try {
        const msgOptions = { 
            document: { url: file.url },
            mimetype: mimetype || 'application/pdf',
            fileName: 'file',
            caption: caption || ''
        };

        // إذا كان نوع الملف صوتياً، أو تم طلب تفعيل PTT
        if ((mimetype && mimetype.startsWith('audio')) || ptt === true) {
            // حذف خصائص المستند (Document) لأننا سنرسل صوتاً
            delete msgOptions.document;
            delete msgOptions.fileName;
            delete msgOptions.caption; // الرسائل الصوتية لا تقبل نصاً
            
            msgOptions.audio = { url: file.url };
            msgOptions.mimetype = mimetype || 'audio/mp4';
            
            // ✅ تفعيل PTT (Push To Talk)
            // إذا أرسل البايثون ptt: true، ستصبح هذه true وتظهر كموجات صوتية
            msgOptions.ptt = ptt ? true : false; 
        } else if (mimetype && mimetype.startsWith('image')) {
            // دعم الصور أيضاً
            delete msgOptions.document;
            delete msgOptions.fileName;
            msgOptions.image = { url: file.url };
        }

        await sock.sendMessage(chatId, msgOptions);
        res.json({ status: 'success' });
    } catch (err) {
        console.error("Send File Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
