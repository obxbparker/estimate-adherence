<?php
// Shared session & config for all pages
ini_set('session.cookie_path', '/');
ini_set('session.cookie_httponly', '1');
ini_set('session.use_strict_mode', '1');

// Use the data directory for session storage if the default isn't writable
$session_dir = __DIR__ . '/data/sessions';
if (!is_dir($session_dir)) {
    @mkdir($session_dir, 0775, true);
}
if (is_writable($session_dir)) {
    ini_set('session.save_path', $session_dir);
}

session_start();

define('APP_PASSWORD', getenv('APP_PASSWORD') ?: 'outerbox2026');
define('DATA_DIR', __DIR__ . '/data');
define('DB_PATH', DATA_DIR . '/data.db');
