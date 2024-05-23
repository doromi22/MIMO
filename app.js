const express = require('express');
const app = express();
const path = require('path');
const ejs = require('ejs');

app.set('view engine', 'ejs');

// middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

// routing
app.get('/', (req, res) => {
    const loggedIn = req.query.loggedIn === 'true'; // check session
    const username = req.query.username || ''; // get username by query parameter
    res.render('index', { loggedIn, username }); // index.ejs template render
});

// server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});