const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Pool } = require('pg');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const QRCode = require('qrcode'); // مكتبة توليد الصور

const app = express();
app.use(express.json());

// ------------------------------------------------------------------
// إعدادات
// ------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
// تأكد أن هذا الرابط هو رابط بوت البايثون الخاص بك
const PYTHON_BOT_URL = "https://whatsapp-bot-jh7d.onrender.com/webhook"; 
const CONNECTION_STRING = process.env.DATABASE_URL; 

// متغير لتخزين كود الباركود الأخير
let currentQR = null;
let isConnected = false;

// ------------------------------------------------------------------
// إعداد قاعدة البيانات
// ------------------------------------------------------------------
const pool = new Pool({ connectionString: CONNECTION_STRING, ssl: { rejectUnauthorized: false } });

async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (id VARCHAR(255) PRIMARY KEY, data TEXT)`);
}

const usePostgresAuthState = async (saveCreds) => {
    const readData = async (type, id) => {
        const key = `${type}-${id}`;
        const res = await pool.query('SELECT data FROM auth_sessions WHERE id = $1', [key]);
        if (res.rows.length > 0) return JSON.parse(res.rows[0].data);
        return null;
    };

    const writeData = async (data, type, id) => {
        const key = `${type}-${id}`;
        const value = JSON.stringify(data);
        await pool.query(
            'INSERT INTO auth_sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
            [key, value]
        );
    };

    const state = {
        creds: await readData('creds', 'main') || (await import('@whiskeysockets/baileys')).initAuthCreds(),
        keys: {
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
        }
    };

    return {
        state: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        saveCreds: async () => {
            await writeData(state.creds, 'creds', 'main');
        }
    };
};

// ------------------------------------------------------------------
// تشغيل الواتساب
// ------------------------------------------------------------------
let sock;

async function startSock() {
    await initDb();
    const { state, saveCreds } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion();

    console.log(`Starting Baileys v${version.join('.')}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // عطلنا الطباعة في اللوج
        auth: state,
        browser: ["QuranBot", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // إذا جاء باركود جديد، نحفظه في المتغير
        if (qr) {
            currentQR = qr;
            isConnected = false;
            console.log("⚡ QR Code updated, check the website!");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            console.log('✅ Connection Opened!');
            isConnected = true;
            currentQR = null; // نمسح الباركود لأنه تم الاتصال
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        let text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || "";

        if (text) {
            console.log(`Message from ${sender}: ${text}`);
            try {
                await axios.post(PYTHON_BOT_URL, {
                    event: 'message',
                    payload: { from: sender, body: text, fromMe: false }
                });
            } catch (err) {
                console.error("Webhook Error:", err.message);
            }
        }
    });
}

startSock();

// ------------------------------------------------------------------
// صفحة عرض الباركود (HTML)
// ------------------------------------------------------------------
app.get('/', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');

    if (isConnected) {
        return res.send(`
            <center>
                <h1>✅ WhatsApp Connected!</h1>
                <p>The bot is running successfully.</p>
            </center>
        `);
    }

    if (currentQR) {
        // تحويل كود الباركود إلى صورة Base64
        const qrImage = await QRCode.toDataURL(currentQR);
        return res.send(`
            <center>
                <h1>📱 Scan This QR Code</h1>
                <img src="${qrImage}" width="300" height="300" style="border: 5px solid #000; border-radius: 10px;" />
                <p>Refresh page if needed.</p>
                <script>setTimeout(function(){location.reload()}, 5000);</script>
            </center>
        `);
    }

    return res.send(`
        <center>
            <h1>⏳ Loading...</h1>
            <p>Waiting for QR Code. Please refresh in a few seconds.</p>
            <script>setTimeout(function(){location.reload()}, 3000);</script>
        </center>
    `);
});

// ------------------------------------------------------------------
// API Endpoints
// ------------------------------------------------------------------
app.post('/api/sendText', async (req, res) => {
    const { chatId, text } = req.body;
    try {
        await sock.sendMessage(chatId, { text: text });
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sendFile', async (req, res) => {
    const { chatId, file } = req.body;
    try {
        await sock.sendMessage(chatId, { 
            audio: { url: file.url }, 
            mimetype: 'audio/mp4',
            ptt: false 
        });
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
