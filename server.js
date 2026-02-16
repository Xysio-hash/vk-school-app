const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ ЗДЕСЬ ТВОЙ ID ТАБЛИЦЫ
const SPREADSHEET_ID = '1tEklyTXbYXTO8d47lLz0HJMRax-starW9gnBmfiZdpA';

app.use(cors({
    origin: ['https://xysio-hash.github.io', 'http://localhost:3000', 'https://vk.com', 'https://dev.vk.com'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));
app.options('*', cors());

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

async function getGoogleSheetsClient() {
    try {
        let credentials;
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            const credsPath = path.join(__dirname, 'config', 'google-credentials.json');
            credentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        }
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const client = await auth.getClient();
        return google.sheets({ version: 'v4', auth: client });
    } catch (error) {
        console.error('Ошибка авторизации Google Sheets:', error);
        return null;
    }
}

async function saveToGoogleSheets(data) {
    try {
        const sheets = await getGoogleSheetsClient();
        if (!sheets) {
            console.log('❌ Нет доступа к Google Sheets');
            return false;
        }
        const values = [[
            data.vk_id,
            data.name,
            data.school_id,
            data.school_name,
            data.game_id,
            data.game_name,
            data.phone,
            data.date
        ]];
        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:H',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
        };
        await sheets.spreadsheets.values.append(request);
        console.log('✅ Данные сохранены в Google Sheets');
        return true;
    } catch (error) {
        console.error('❌ Ошибка сохранения в Google Sheets:', error);
        return false;
    }
}

app.get('/', (req, res) => {
    res.send('🚀 Сервер работает! Данные сохраняются в Google Sheets');
});

app.post('/save', async (req, res) => {
    const newData = req.body;
    console.log('📥 Получены данные:', newData);
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    const existing = db.find(entry => entry.vk_id === newData.vk_id && entry.game_id === newData.game_id);
    if (existing) {
        console.log('⚠️ Участник уже зарегистрирован на эту игру');
        return res.json({ status: "already_exists", message: "Вы уже участвуете в этой игре", google: false });
    }
    db.push(newData);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    const saved = await saveToGoogleSheets(newData);
    if (saved) {
        res.json({ status: "saved", message: "Данные сохранены в Google Sheets", google: true });
    } else {
        res.json({ status: "saved", message: "Данные сохранены локально", google: false });
    }
});

app.get('/stats', (req, res) => {
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(db);
});

app.get('/test-google', async (req, res) => {
    const testData = {
        vk_id: "test_" + Date.now(),
        name: "Тест Тестов",
        school_id: "1",
        school_name: "Тестовая школа",
        game_id: "test_game",
        game_name: "Тестовая игра",
        phone: "+79999999999",
        date: new Date().toISOString()
    };
    const result = await saveToGoogleSheets(testData);
    res.json({ success: result, message: result ? "✅ Google Sheets работает!" : "❌ Ошибка Google Sheets", testData });
});

app.get('/check-participation', (req, res) => {
    const { user_id, game_id } = req.query;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const participant = db.find(entry => entry.vk_id === user_id && entry.game_id === game_id);
        res.json({ participates: !!participant });
    } catch (error) {
        res.json({ participates: false, error: true });
    }
});

app.get('/user-games', (req, res) => {
    const { user_id } = req.query;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const userGames = db.filter(entry => entry.vk_id === user_id).map(entry => entry.game_id);
        res.json({ games: userGames });
    } catch (error) {
        res.json({ games: [], error: true });
    }
});

// ✅ НОВЫЙ МАРШРУТ ДЛЯ ПОЛНЫХ ЗАЯВОК ПОЛЬЗОВАТЕЛЯ
app.get('/user-applications', (req, res) => {
    const { user_id } = req.query;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const userApps = db.filter(entry => entry.vk_id === user_id).map(app => ({
            game_id: app.game_id,
            game_name: app.game_name,
            school_name: app.school_name,
            date: app.date
        }));
        res.json({ applications: userApps });
    } catch (error) {
        console.error("Ошибка получения заявок пользователя:", error);
        res.json({ applications: [], error: true });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Google Sheets ID: ${SPREADSHEET_ID}`);
});
