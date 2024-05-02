const express = require('express');
const app = express();
const ejs = require('ejs');

app.set('view engine', 'ejs');

// 미들웨어 설정
app.use(express.urlencoded({ extended: true }));

// 라우팅 설정
app.get('/', (req, res) => {
    const loggedIn = req.query.loggedIn === 'true'; // 로그인 여부를 쿼리 파라미터로 받아옴
    const username = req.query.username || ''; // 사용자 이름을 쿼리 파라미터로 받아옴
    res.render('index', { loggedIn, username }); // index.ejs 템플릿 렌더링
});

// 서버 시작
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});