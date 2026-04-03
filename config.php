<?php
// Shared session & config for all pages
ini_set('session.cookie_path', '/');
ini_set('session.cookie_httponly', '1');

// Don't override session save path — use server default
session_start();

define('APP_PASSWORD', getenv('APP_PASSWORD') ?: 'outerbox2026');
define('DATA_DIR', __DIR__ . '/data');
define('DB_PATH', DATA_DIR . '/data.db');

// Ensure data directory exists
if (!is_dir(DATA_DIR)) {
    @mkdir(DATA_DIR, 0775, true);
}
