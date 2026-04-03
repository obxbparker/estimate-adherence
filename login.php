<?php
session_start();

define('APP_PASSWORD', getenv('APP_PASSWORD') ?: 'outerbox2026');

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (($_POST['password'] ?? '') === APP_PASSWORD) {
        $_SESSION['authenticated'] = true;
        header('Location: index.php');
        exit;
    }
    $error = 'Incorrect password';
}

// Already logged in
if (!empty($_SESSION['authenticated'])) {
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Estimate Adherence</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #f5f6f8;
            color: #1a1a2e;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .login-card {
            background: #fff;
            border-radius: 12px;
            padding: 2.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            width: 100%;
            max-width: 360px;
        }
        h1 { font-size: 1.3rem; font-weight: 700; margin-bottom: 0.25rem; }
        .subtitle { font-size: 0.85rem; color: #9ca3af; margin-bottom: 1.5rem; }
        label { display: block; font-size: 0.85rem; font-weight: 600; color: #374151; margin-bottom: 0.35rem; }
        input[type="password"] {
            width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #d1d5db;
            border-radius: 6px; font-size: 0.95rem; outline: none; margin-bottom: 1rem;
        }
        input[type="password"]:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
        button {
            width: 100%; padding: 0.6rem; background: #1a1a2e; color: #fff;
            border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 500; cursor: pointer;
        }
        button:hover { background: #2d2d4e; }
        .error { background: #fef2f2; color: #dc2626; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>Estimate Adherence</h1>
        <p class="subtitle">Enter the team password to continue</p>
        <?php if ($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <form method="POST">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" autofocus required>
            <button type="submit">Sign In</button>
        </form>
    </div>
</body>
</html>
