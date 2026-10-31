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

-- ------------------------------------------------------------------------------------
-- Superadmin (pengelola sistem). Cara yang disarankan:
--   python -m app.cli create-superadmin --email pengelola@karbonlens.id --name "Dewi Pengelola"
--   python -m app.cli list-superadmins
-- Lewat SQL hanya bisa bila hash bcrypt dibuat dulu (dari folder backend, venv aktif):
--   python -c "from app.security import hash_password; print(hash_password('KataSandiKuat123'))"
--
--   INSERT INTO users (company_id, name, email, password_hash, role, is_active, created_at)
--   VALUES (NULL, 'Dewi Pengelola', 'pengelola@karbonlens.id', '<hash>', 'superadmin', 1, NOW());
--
-- ------------------------------------------------------------------------------------
-- Status kebutuhan dokumen per perusahaan: required | optional | not_applicable.
-- Disarankan lewat halaman superadmin (ada pratinjau dampak, aturan pengaman, dan log audit).
-- Lewat SQL TIDAK memeriksa aturan pengaman: 'produksi' tidak boleh not_applicable dan jenis
-- Scope 1/2 wajib beralasan minimal 15 karakter. Periode terbuka juga perlu dihitung ulang.
--
--   SELECT code, name, default_status, can_exclude, scope12 FROM document_types ORDER BY no;
--   SELECT * FROM company_doc_requirements WHERE company_id = 2;            -- pengaturan khusus
--   INSERT INTO company_doc_requirements (company_id, type_code, status, reason, source, set_by, set_at)
--   VALUES (2, 'pupuk', 'not_applicable', 'PKS tanpa kebun; seluruh TBS dibeli dari pihak ketiga', 'manual', 1, NOW());
--   DELETE FROM company_doc_requirements WHERE company_id = 2 AND type_code = 'pupuk';   -- kembali ke default
--   UPDATE reporting_periods SET data_changed_at = NOW(), status = IF(status = 'calculated', 'open', status)
--    WHERE company_id = 2 AND status <> 'locked';                          -- tandai perlu dihitung ulang
--
--   SELECT id, company_id, type_code, requested_status, reason FROM exception_requests WHERE status = 'pending';

