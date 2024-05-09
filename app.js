const express = require('express');
const app = express();
const ejs = require('ejs');

app.set('view engine', 'ejs');

// middleware
app.use(express.urlencoded({ extended: true }));

// routing
app.get('/', (req, res) => {
    const loggedIn = req.query.loggedIn === 'true'; // check session
    const username = req.query.username || ''; // get username by query parameter
    res.render('index', { loggedIn, username }); // index.ejs template render
});

// server start
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});