-- Jalankan sekali sebagai root MySQL (MySQL Workbench / phpMyAdmin / terminal):
--   mysql -u root -p < setup_mysql.sql
-- File ini hanya membuat database dan user. Tabel dibuat otomatis saat backend pertama kali
-- dijalankan (atau dengan: python -m app.cli init-db).
CREATE DATABASE IF NOT EXISTS karbonlens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'karbon'@'localhost' IDENTIFIED BY 'karbon123';
GRANT ALL PRIVILEGES ON karbonlens.* TO 'karbon'@'localhost';
FLUSH PRIVILEGES;

-- ------------------------------------------------------------------------------------
-- Penugasan admin peninjau lewat SQL (alternatif dari `python -m app.cli assign`).
-- Akun admin sebaiknya dibuat dengan `python -m app.cli create-admin` karena kata sandi
-- harus di-hash dengan bcrypt. Setelah akun ada, penugasan bisa dilakukan dengan SQL:
--
--   USE karbonlens;
--   SELECT id, email, role FROM users WHERE role = 'admin';      -- cari id admin
--   SELECT id, name FROM companies;                               -- cari id perusahaan
--   INSERT INTO admin_companies (admin_id, company_id, assigned_at) VALUES (5, 2, NOW());
--   DELETE FROM admin_companies WHERE admin_id = 5 AND company_id = 2;   -- mencabut
