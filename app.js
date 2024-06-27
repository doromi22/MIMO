const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const ejs = require('ejs');
const { addBlankPageToPdf, removeBlankPageFromPdf } = require('./addBlankPageToPdf');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Serve static files from the uploads directory
app.use('/uploads', express.static(uploadDir));

// MySQL connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, Date.now() + '-' + safeFileName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png' || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PNG images and PDF files are allowed!'), false);
        }
    }
});

// Register endpoint
app.post('/register', async (req, res) => {
    const { username, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.status(400).json({ message: 'パスワードが一致しません' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            return res.status(400).json({ message: '既に存在するユーザーネームです' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);

        res.redirect('/login'); // Redirect to login after registration
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(400).json({ message: '存在しないユーザーネームです' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'パスワードが間違っています' });
        }

        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.cookie('token', token, { httpOnly: true }); // Set token in cookie
        res.redirect('/'); // Redirect to home after login
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// Logout endpoint
app.get('/logout', (req, res) => {
    res.clearCookie('token'); // Clear the token cookie
    res.redirect('/'); // Redirect to home after logout
});

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        req.loggedIn = false;
        return next();
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            req.loggedIn = false;
            return next();
        }
        req.loggedIn = true;
        req.user = user;
        next();
    });
};

// Routing
app.get('/', authenticateToken, async (req, res) => {
    const loggedIn = req.loggedIn;
    const username = req.user ? req.user.username : '';

    try {
        const [comics] = await pool.query('SELECT * FROM comics WHERE is_public = 1 ORDER BY upload_date DESC LIMIT 6');
        const comicsWithBasename = comics.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail);
            return comic;
        });
        res.render('index', { loggedIn, username, comics: comicsWithBasename });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.get('/login', (req, res) => {
    res.render('auth/login');
});

app.get('/register', (req, res) => {
    res.render('auth/register');
});

app.get('/submit', authenticateToken, (req, res) => {
    if (!req.loggedIn) {
        return res.redirect('/login');
    }
    res.render('submitcomics');
});

// Submit endpoint
app.post('/submit', authenticateToken, upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
    if (!req.loggedIn) {
        return res.status(403).json({ message: 'ログインが必要です' });
    }

    const { title, description, is_public, tags } = req.body;
    const thumbnail = req.files['thumbnail'][0].path.replace(/\\/g, '/'); // Ensure path uses forward slashes
    const pdf = req.files['pdf'][0].path.replace(/\\/g, '/'); // Ensure path uses forward slashes

    try {
        const [result] = await pool.query('INSERT INTO comics (title, description, thumbnail, pdf, user_id, is_public, tags) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [title, description, thumbnail, pdf, req.user.userId, is_public, tags]);

        const comicId = result.insertId;

        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// History page
app.get('/history', authenticateToken, async (req, res) => {
    if (!req.loggedIn) {
        return res.redirect('/login');
    }

    try {
        const [comics] = await pool.query('SELECT * FROM comics WHERE user_id = ?', [req.user.userId]);
        const comicsWithBasename = comics.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail); // Ensure path uses forward slashes
            return comic;
        });
        res.render('history', { comics: comicsWithBasename });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.post('/delete-comic', authenticateToken, async (req, res) => {
    let { comicIds } = req.body;

    if (typeof comicIds === 'string') {
        try {
            comicIds = JSON.parse(comicIds);
        } catch (error) {
            return res.status(400).json({ message: 'Invalid comicIds format' });
        }
    }

    if (!Array.isArray(comicIds)) {
        return res.status(400).json({ message: 'Invalid comicIds format' });
    }

    try {
        for (const comicId of comicIds) {
            const [comics] = await pool.query('SELECT * FROM comics WHERE id = ? AND user_id = ?', [comicId, req.user.userId]);
            if (comics.length > 0) {
                const comic = comics[0];
                const comicFilePath = path.join(uploadDir, path.basename(comic.pdf));
                const thumbnailFilePath = path.join(uploadDir, path.basename(comic.thumbnail));
                if (fs.existsSync(comicFilePath)) {
                    fs.unlinkSync(comicFilePath);
                }
                if (fs.existsSync(thumbnailFilePath)) {
                    fs.unlinkSync(thumbnailFilePath);
                }
                await pool.query('DELETE FROM comics WHERE id = ?', [comicId]);
            }
        }
        res.redirect('/history'); // Redirect to history after successful deletion
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.get('/viewer/:comicId', authenticateToken, async (req, res) => {
    const { comicId } = req.params;

    try {
        const [comic] = await pool.query('SELECT * FROM comics WHERE id = ?', [comicId]);
        if (comic.length === 0) {
            return res.status(404).send('Comic not found');
        }

        const comicData = comic[0];
        if (comicData.pdf) {
            comicData.pdf = '/uploads/' + path.basename(comicData.pdf); // Ensure the correct path to the PDF
        }
        if (comicData.thumbnail) {
            comicData.thumbnail = '/uploads/' + path.basename(comicData.thumbnail); // Ensure the correct path to the thumbnail
        }

        // 추가된 페이지 상태를 데이터베이스에서 가져옵니다.
        const [pageStatusRows] = await pool.query('SELECT * FROM page_status WHERE comic_id = ?', [comicId]);
        const pageStatus = pageStatusRows.length > 0 ? pageStatusRows[0].added : false;

        res.render('viewer', { comic: comicData, pageStatus });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.post('/add-blank-page', authenticateToken, async (req, res) => {
    if (!req.loggedIn) {
        return res.status(403).json({ message: 'ログインが必要です' });
    }

    const { comicId, action } = req.body;

    try {
        const [comics] = await pool.query('SELECT * FROM comics WHERE id = ? AND user_id = ?', [comicId, req.user.userId]);
        if (comics.length === 0) {
            return res.status(404).json({ message: 'Comic not found' });
        }

        const comic = comics[0];
        const pdfPath = comic.pdf;
        const tempPdfPath = path.join(uploadDir, `temp-${path.basename(pdfPath)}`);

        if (action === 'add') {
            await addBlankPageToPdf(pdfPath, tempPdfPath);
            fs.renameSync(tempPdfPath, pdfPath);
            await pool.query('INSERT INTO page_status (comic_id, added) VALUES (?, true) ON DUPLICATE KEY UPDATE added = true', [comicId]);
        } else if (action === 'remove') {
            await removeBlankPageFromPdf(pdfPath, tempPdfPath);
            fs.renameSync(tempPdfPath, pdfPath);
            await pool.query('UPDATE page_status SET added = false WHERE comic_id = ?', [comicId]);
        }

        res.redirect(`/viewer/${comicId}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// 검색 폼 페이지 라우트
app.get('/searchform', authenticateToken, async (req, res) => {
    const loggedIn = req.loggedIn;
    const username = req.user ? req.user.username : '';

    try {
        const [comics] = await pool.query('SELECT * FROM comics WHERE is_public = 1 ORDER BY upload_date DESC LIMIT 6');
        const comicsWithBasename = comics.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail);
            return comic;
        });
        res.render('searchform', { loggedIn, username, comics: comicsWithBasename });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// 검색 라우트
app.get('/search', authenticateToken, async (req, res) => {
    const { query } = req.query;
    const loggedIn = req.loggedIn;
    const username = req.user ? req.user.username : '';

    try {
        const [comics] = await pool.query('SELECT * FROM comics WHERE (title LIKE ? OR tags LIKE ?) AND is_public = 1', [`%${query}%`, `%${query}%`]);
        const comicsWithBasename = comics.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail);
            return comic;
        });
        res.render('search', { loggedIn, username, query, comics: comicsWithBasename });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
