-- 当時のスキーマ定義はリポジトリに残っていないため、app.js と views から復元したもの。
-- 2026年にローカルで動作確認するために書き起こした（当時のものそのままではない）。
CREATE DATABASE IF NOT EXISTS mimo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mimo;

DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS page_status;
DROP TABLE IF EXISTS comics;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role TINYINT NOT NULL DEFAULT 1              -- 1 = student, 2 = teacher
);

CREATE TABLE comics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail VARCHAR(512),
    pdf VARCHAR(512),
    user_id INT,
    role TINYINT NOT NULL DEFAULT 1,             -- 1 all / 2 students / 3 teachers / 4 private
    tags VARCHAR(255),
    upload_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comic_id INT NOT NULL,
    username VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    color VARCHAR(32) DEFAULT NULL,              -- viewer.ejs reads chat.color
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE page_status (
    comic_id INT PRIMARY KEY,                    -- app.js relies on ON DUPLICATE KEY UPDATE
    added BOOLEAN NOT NULL DEFAULT FALSE
);
