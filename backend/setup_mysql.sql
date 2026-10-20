-- Jalankan sekali sebagai root MySQL (phpMyAdmin / MySQL Workbench / terminal):
--   mysql -u root -p < setup_mysql.sql
-- Tabel dibuat otomatis oleh aplikasi (python -m app.seed) — file ini hanya
-- membuat database dan user.
CREATE DATABASE IF NOT EXISTS karbonlens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'karbon'@'localhost' IDENTIFIED BY 'karbon123';
GRANT ALL PRIVILEGES ON karbonlens.* TO 'karbon'@'localhost';
FLUSH PRIVILEGES;
