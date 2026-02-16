const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройки Google Sheets
const SPREADSHEET_ID = '1tEklyTXbYXTO8d47lLz0HJMRax-starW9gnBmfiZdpA';

// Расширенные настройки CORS
app.use(cors({
    origin: [
        'https://xysio-hash.github.io',
        'http://localhost:3000',
        'https://vk.com',
        'https://dev.vk.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Для обработки предварительных запросов OPTIONS
app.options('*', cors());

app.use(express.json());

// Локальная база
const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

// Авторизация в Google Sheets
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
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const client = await auth.getClient();
        return google.sheets({ version: 'v4', auth: client });
    } catch (error) {
        console.error('Ошибка авторизации Google Sheets:', error);
        return null;
    }
}

// Функция для записи в Google Sheets
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
            resource: {
                values: values
            }
        };
        
        const response = await sheets.spreadsheets.values.append(request);
        console.log('✅ Данные сохранены в Google Sheets');
        return true;
    } catch (error) {
        console.error('❌ Ошибка сохранения в Google Sheets:', error);
        return false;
    }
}

// Корневой маршрут
app.get('/', (req, res) => {
    res.send('🚀 Сервер работает! Данные сохраняются в Google Sheets');
});

// Сохранение данных
app.post('/save', async (req, res) => {
    const newData = req.body;
    
    console.log('📥 Получены данные:', newData);
    
    // Проверяем, есть ли уже такой участник
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    const existingParticipant = db.find(entry => 
        entry.vk_id === newData.vk_id && entry.game_id === newData.game_id
    );
    
    if (existingParticipant) {
        console.log('⚠️ Участник уже зарегистрирован на эту игру');
        return res.json({ 
            status: "already_exists", 
            message: "Вы уже участвуете в этой игре",
            google: false 
        });
    }
    
    // Сохраняем локально
    db.push(newData);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    
    // Сохраняем в Google Sheets
    const saved = await saveToGoogleSheets(newData);
    
    if (saved) {
        res.json({ 
            status: "saved", 
            message: "Данные сохранены в Google Sheets",
            google: true 
        });
    } else {
        res.json({ 
            status: "saved", 
            message: "Данные сохранены локально (ошибка Google Sheets)",
            google: false 
        });
    }
});

// Статистика из локальной базы
app.get('/stats', (req, res) => {
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(db);
});

// Проверка Google Sheets
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
    res.json({ 
        success: result, 
        message: result ? "✅ Google Sheets работает!" : "❌ Ошибка Google Sheets",
        testData: testData
    });
});

// Проверка участия пользователя в конкретной игре
app.get('/check-participation', (req, res) => {
    const { user_id, game_id } = req.query;
    console.log(`🔍 Проверка участия: user=${user_id}, game=${game_id}`);
    
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        
        const participant = db.find(entry => 
            entry.vk_id === user_id && entry.game_id === game_id
        );
        
        console.log(`📊 Результат: ${participant ? 'уже участвует' : 'не участвует'}`);
        res.json({ participates: !!participant });
    } catch (error) {
        console.error("Ошибка проверки участия:", error);
        res.json({ participates: false, error: true });
    }
});

// Получение всех игр пользователя
app.get('/user-games', (req, res) => {
    const { user_id } = req.query;
    console.log(`🔍 Получение игр пользователя: ${user_id}`);
    
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        
        const userGames = db
            .filter(entry => entry.vk_id === user_id)
            .map(entry => entry.game_id);
        
        console.log(`📊 Игры пользователя:`, userGames);
        res.json({ games: userGames });
    } catch (error) {
        console.error("Ошибка получения игр пользователя:", error);
        res.json({ games: [], error: true });
    }
});

// Получение всех заявок пользователя с полной информацией
app.get('/user-applications', (req, res) => {
    const { user_id } = req.query;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        
        const userApps = db.filter(entry => entry.vk_id === user_id);
        
        // Возвращаем только нужные поля
        const applications = userApps.map(app => ({
            game_id: app.game_id,
            game_name: app.game_name,
            school_name: app.school_name,
            date: app.date
        }));
        
        res.json({ applications });
    } catch (error) {
        console.error("Ошибка получения заявок пользователя:", error);
        res.json({ applications: [], error: true });
    }
});
// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Google Sheets ID: ${SPREADSHEET_ID}`);
});
