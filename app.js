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
const http = require('http');
const socketio = require('socket.io');
const { addBlankPageToPdf, removeBlankPageFromPdf } = require('./addBlankPageToPdf');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const MAX_WIDTH = 2000;
const MAX_HEIGHT = 2000;

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
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF files are allowed!'), false);
        }
    }
});

// Register endpoint
app.post('/register', async (req, res) => {
    const { username, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.render('auth/register', { errorMessage: 'パスワードが一致しません' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            return res.render('auth/register', { errorMessage: '既に存在するユーザーネームです' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, 1)', [username, hashedPassword]);

        res.redirect('/login'); // Redirect to login after registration
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

// Teacher Register endpoint
app.post('/teacherregister', async (req, res) => {
    const { username, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.render('auth/teacher_register', { errorMessage: 'パスワードが一致しません' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            return res.render('auth/teacher_register', { errorMessage: '既に存在するユーザーネームです' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, 2)', [username, hashedPassword]);

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
            return res.render('auth/login', { errorMessage: '存在しないユーザーネームです' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('auth/login', { errorMessage: 'パスワードが間違っています' });
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
const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        req.loggedIn = false;
        req.user = { username: 'guest', userId: null, role: null }; // Default to guest if not logged in
        return next();
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.loggedIn = true;

        // Get user role from the database
        const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [user.userId]);
        if (rows.length === 0) {
            req.loggedIn = false;
            req.user = { username: 'guest', userId: null, role: null };
        } else {
            req.user = { ...user, role: rows[0].role };
        }

        console.log('Authenticated user:', req.user); // 로그 추가
        console.log('Logged in status:', req.loggedIn); // 추가 로그
        next();
    } catch (err) {
        console.log('Token verification failed:', err.message);
        req.loggedIn = false;
        req.user = { username: 'guest', userId: null, role: null };
        next();
    }
};

const canAccessComic = (comic, user, loggedIn) => {
    console.log('Checking access for comic:', comic);
    console.log('Checking access for user:', user);
    console.log('User loggedIn:', loggedIn); // 추가 로그

    const comicRole = comic.role; // role 값을 숫자로 그대로 사용

    console.log('Comic role:', comicRole);
    console.log('User role:', user.role);

    if (comic.user_id === user.userId) {
        console.log('Access granted: user is the owner');
        return true; // Owner can always access their own comics
    } else if (comicRole === 1) {
        console.log('Access granted: public comic');
        return true; // Public
    } else if (comicRole === 2 && loggedIn && user.role === 1) {
        console.log('Access granted: student accessing student-only comic');
        return true; // Students only
    } else if (comicRole === 3 && loggedIn && user.role === 2) {
        console.log('Access granted: teacher accessing teacher-only comic');
        return true; // Teachers only
    } else if (comicRole === 4 && loggedIn && comic.user_id === user.userId) {
        console.log('Access granted: private comic accessed by the owner');
        return true; // Private (this case is handled by the first check)
    }
    console.log('Access denied');
    return false;
};

// Routing
app.get('/', authenticateToken, async (req, res) => {
    const loggedIn = req.loggedIn;
    const username = req.user.username;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 32;
    const offset = (page - 1) * limit;
    const role = req.user.role;
    const userId = req.user.userId;

    try {
        let [comics] = await pool.query('SELECT * FROM comics ORDER BY upload_date DESC LIMIT ? OFFSET ?', [limit, offset]);

        // 필터링
        if (role === 1) {
            comics = comics.filter(comic => comic.role === 1 || comic.role === 2 || comic.user_id === userId);
        } else if (role === 2) {
            comics = comics.filter(comic => comic.role === 1 || comic.role === 3 || comic.user_id === userId);
        } else {
            comics = comics.filter(comic => comic.role === 1 || comic.user_id === userId);
        }

        const comicsWithBasename = comics.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail);
            return comic;
        });

        if (req.query.page) {
            res.json(comicsWithBasename);  // Send JSON response if page query is present
        } else {
            res.render('index', { loggedIn, username, comics: comicsWithBasename });  // Otherwise, render EJS template
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.get('/comics', authenticateToken, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 32;
    const offset = (page - 1) * limit;

    try {
        const [comics] = await pool.query('SELECT * FROM comics ORDER BY upload_date DESC LIMIT ? OFFSET ?', [limit, offset]);
        const comicsWithAccess = comics.filter(comic => canAccessComic(comic, req.user));
        const comicsWithBasename = comicsWithAccess.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail);
            return comic;
        });
        res.json(comicsWithBasename);
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

app.get('/dontshare', (req, res) => {
    res.render('auth/teacher_register');
});

app.get('/submit', authenticateToken, (req, res) => {
    if (!req.loggedIn) {
        return res.redirect('/login');
    }
    res.render('submitcomics', { loggedIn: req.loggedIn, username: req.user.username });
});

const { PDFDocument, rgb } = require('pdf-lib');

async function resizePdf(pdfPath, outputPdfPath) {
    const fs = require('fs').promises;

    // Read the PDF file
    const existingPdfBytes = await fs.readFile(pdfPath);

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Resize each page
    const pages = pdfDoc.getPages();
    for (const page of pages) {
        const { width, height } = page.getSize();
        let scaleFactor = 1;
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            scaleFactor = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        }
        if (scaleFactor < 1) {
            page.scale(scaleFactor, scaleFactor);
        }
    }

    // Save the modified PDF to a new file
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPdfPath, pdfBytes);
}

// Function to add a blank page if the page count is odd
async function addBlankPageIfOdd(pdfPath) {
    const fs = require('fs').promises;

    // Read the PDF file
    const existingPdfBytes = await fs.readFile(pdfPath);

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Get the number of pages
    const pageCount = pdfDoc.getPageCount();

    // If the number of pages is odd, add a blank page
    if (pageCount % 2 !== 0) {
        pdfDoc.addPage();
        const pdfBytes = await pdfDoc.save();
        await fs.writeFile(pdfPath, pdfBytes);
    }
}

// Submit endpoint
app.post('/submit', authenticateToken, upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
    if (!req.loggedIn) {
        return res.status(403).json({ message: 'ログインが必要です' });
    }

    const { title, description, role, tags } = req.body;
    const thumbnail = req.files['thumbnail'][0].path.replace(/\\/g, '/'); // Ensure path uses forward slashes
    const pdf = req.files['pdf'][0].path.replace(/\\/g, '/'); // Ensure path uses forward slashes
    const resizedPdfPath = path.join(uploadDir, `resized-${path.basename(pdf)}`);

    try {
        // Resize PDF before proceeding
        await resizePdf(pdf, resizedPdfPath);

        await addBlankPageIfOdd(resizedPdfPath); // Add blank page if the page count is odd

        const [result] = await pool.query('INSERT INTO comics (title, description, thumbnail, pdf, user_id, role, tags) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [title, description, thumbnail, resizedPdfPath, req.user.userId, parseInt(role), tags]);

        const comicId = result.insertId;

        res.redirect('/');
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ message: 'server error' });
    }
});

// History page
app.get('/history', authenticateToken, async (req, res) => {
    const loggedIn = req.loggedIn;
    const username = req.user.username;

    if (!loggedIn) {
        return res.redirect('/login');
    }

    try {
        const [comics] = await pool.query('SELECT * FROM comics WHERE user_id = ?', [req.user.userId]);
        const comicsWithBasename = comics.map(comic => {
            comic.thumbnail = path.basename(comic.thumbnail); // Ensure path uses forward slashes
            return comic;
        });
        res.render('history', { comics: comicsWithBasename, loggedIn, username });
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

                // 파일 삭제 로직 추가 및 로그 기록
                if (fs.existsSync(comicFilePath)) {
                    try {
                        fs.unlinkSync(comicFilePath);
                        console.log(`Deleted comic file: ${comicFilePath}`);
                    } catch (err) {
                        console.error(`Error deleting comic file: ${comicFilePath}`, err);
                    }
                } else {
                    console.log(`Comic file not found: ${comicFilePath}`);
                }

                if (fs.existsSync(thumbnailFilePath)) {
                    try {
                        fs.unlinkSync(thumbnailFilePath);
                        console.log(`Deleted thumbnail file: ${thumbnailFilePath}`);
                    } catch (err) {
                        console.error(`Error deleting thumbnail file: ${thumbnailFilePath}`, err);
                    }
                } else {
                    console.log(`Thumbnail file not found: ${thumbnailFilePath}`);
                }

                await pool.query('DELETE FROM chat_messages WHERE comic_id = ?', [comicId]);
                await pool.query('DELETE FROM page_status WHERE comic_id = ?', [comicId]); 
                await pool.query('DELETE FROM comics WHERE id = ?', [comicId]);
            }
        }
        res.redirect('/history'); // Redirect to history after successful deletion
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.post('/update-comic-role', authenticateToken, async (req, res) => {
    const { comicId, newRole } = req.body;

    if (!comicId || !newRole) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        const [result] = await pool.query('UPDATE comics SET role = ? WHERE id = ? AND user_id = ?', [newRole, comicId, req.user.userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Comic not found or you do not have permission to update' });
        }

        res.json({ message: 'success' });
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

        console.log('Comic data:', comicData);
        console.log('User data:', req.user);

        if (!canAccessComic(comicData, req.user, req.loggedIn)) {
            return res.status(403).send('Access denied');
        }

        if (comicData.pdf) {
            comicData.pdf = '/uploads/' + path.basename(comicData.pdf); // Ensure the correct path to the PDF
        }
        if (comicData.thumbnail) {
            comicData.thumbnail = '/uploads/' + path.basename(comicData.thumbnail); // Ensure the correct path to the thumbnail
        }

        const [pageStatusRows] = await pool.query('SELECT * FROM page_status WHERE comic_id = ?', [comicId]);
        const pageStatus = pageStatusRows.length > 0 ? pageStatusRows[0].added : false;

        const [chatMessages] = await pool.query('SELECT * FROM chat_messages WHERE comic_id = ? ORDER BY timestamp', [comicId]);

        res.render('viewer', { comic: comicData, pageStatus, chatMessages, username: req.user.username, loggedIn: req.loggedIn });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'server error' });
    }
});

app.post('/add-blank-page', authenticateToken, async (req, res) => {
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

// search form page route
app.get('/searchform', authenticateToken, async (req, res) => {
    const loggedIn = req.loggedIn;
    const username = req.user ? req.user.username : '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 32;
    const offset = (page - 1) * limit;
    const role = req.user.role;

    try {
        let [comics] = await pool.query('SELECT * FROM comics ORDER BY upload_date DESC LIMIT ? OFFSET ?', [limit, offset]);

        // 필터링
        if (role === 1) {
            comics = comics.filter(comic => comic.role === 1 || comic.role === 2);
        } else if (role === 2) {
            comics = comics.filter(comic => comic.role === 1 || comic.role === 3);
        } else {
            comics = comics.filter(comic => comic.role === 1);
        }

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

// search route
app.get('/search', authenticateToken, async (req, res) => {
    const { query } = req.query;
    const loggedIn = req.loggedIn;
    const username = req.user ? req.user.username : '';
    const role = req.user.role;

    try {
        let [comics] = await pool.query('SELECT * FROM comics WHERE (title LIKE ? OR tags LIKE ?)', [`%${query}%`, `%${query}%`]);

        // 필터링
        if (role === 1) {
            comics = comics.filter(comic => comic.role === 1 || comic.role === 2);
        } else if (role === 2) {
            comics = comics.filter(comic => comic.role === 1 || comic.role === 3);
        } else {
            comics = comics.filter(comic => comic.role === 1);
        }

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

// Socket.io configuration
io.on('connection', (socket) => {
    console.log('New WebSocket connection');

    socket.on('joinRoom', ({ comicId, username }) => {
        socket.join(comicId);
        socket.to(comicId).emit('message', {
            username: 'System',
            message: `${username} has joined the chat`,
            timestamp: new Date()
        });
    });

    socket.on('sendMessage', ({ comicId, username, message }) => {
        const timestamp = new Date();
        io.to(comicId).emit('message', { username, message, timestamp });

        // Save message to the database
        pool.query('INSERT INTO chat_messages (comic_id, username, message, timestamp) VALUES (?, ?, ?, ?)', 
            [comicId, username, message, timestamp]);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
