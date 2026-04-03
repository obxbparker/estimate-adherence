<?php
require_once __DIR__ . '/config.php';

// --- Auth check ---
if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

header('Content-Type: application/json');

// --- Database ---
function get_db(): PDO {
    static $db = null;
    if ($db === null) {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec("CREATE TABLE IF NOT EXISTS analysis_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL,
            uploaded_at TEXT NOT NULL
        )");
        $db->exec("CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            excluded_assignees TEXT NOT NULL DEFAULT '[]',
            teams TEXT NOT NULL DEFAULT '[]'
        )");
        $db->exec("INSERT OR IGNORE INTO settings (id, excluded_assignees, teams) VALUES (1, '[]', '[]')");
    }
    return $db;
}

// --- Time parsing ---
function parse_time(string $val): int {
    $val = trim($val);
    if ($val === '') return 0;
    $total = 0;
    if (preg_match('/(\d+)\s*h/', $val, $m)) $total += (int)$m[1] * 60;
    if (preg_match('/(\d+)\s*m/', $val, $m)) $total += (int)$m[1];
    return $total;
}

function format_time(int $minutes): string {
    if ($minutes === 0) return '';
    $h = intdiv($minutes, 60);
    $m = $minutes % 60;
    if ($h && $m) return "{$h}h {$m}m";
    if ($h) return "{$h}h";
    return "{$m}m";
}

function parse_assignees(string $val): array {
    $val = trim($val, " \t\n\r\0\x0B[]");
    if ($val === '') return [];
    return array_map('trim', explode(',', $val));
}

// --- CSV Analysis ---
function analyze_csv($stream): array {
    $assignee_data = [];
    $total_complete = 0;
    $excluded_no_estimate = 0;
    $excluded_no_assignee = 0;

    $headers = fgetcsv($stream);
    if (!$headers) return ['error' => 'Empty CSV'];

    $col = array_flip($headers);

    while (($row = fgetcsv($stream)) !== false) {
        // Pad row to match headers
        while (count($row) < count($headers)) {
            $next = fgetcsv($stream);
            if ($next === false) break;
            $row[count($row) - 1] .= "\n" . $next[0];
            array_splice($row, count($row), 0, array_slice($next, 1));
        }

        $status = trim($row[$col['Status'] ?? -1] ?? '');
        if (strtolower($status) !== 'complete') continue;

        $total_complete++;

        $assignees = parse_assignees($row[$col['Assignee'] ?? -1] ?? '');
        if (empty($assignees)) {
            $excluded_no_assignee++;
            continue;
        }

        $time_est = parse_time($row[$col['Time Estimate'] ?? -1] ?? '');
        $time_log = parse_time($row[$col['Time Logged'] ?? -1] ?? '');

        if ($time_est === 0) {
            $excluded_no_estimate++;
            continue;
        }

        $pct = round(($time_log / $time_est) * 100, 1);
        $adherent = $pct <= 110;

        $task_info = [
            'task_name' => trim($row[$col['Task Name'] ?? -1] ?? ''),
            'parent_name' => trim($row[$col['Parent Name'] ?? -1] ?? ''),
            'time_estimate' => format_time($time_est),
            'time_logged' => format_time($time_log),
            'pct' => $pct,
            'adherent' => $adherent,
        ];

        foreach ($assignees as $assignee) {
            if (!isset($assignee_data[$assignee])) {
                $assignee_data[$assignee] = ['tasks' => [], 'adherent' => 0, 'total' => 0];
            }
            $assignee_data[$assignee]['total']++;
            if ($adherent) $assignee_data[$assignee]['adherent']++;
            $assignee_data[$assignee]['tasks'][] = $task_info;
        }
    }

    ksort($assignee_data);
    $assignees_list = [];
    $overall_adherent = 0;
    $overall_total = 0;

    foreach ($assignee_data as $name => $d) {
        $adherence_pct = $d['total'] > 0 ? round(($d['adherent'] / $d['total']) * 100, 1) : 0;
        $overall_adherent += $d['adherent'];
        $overall_total += $d['total'];

        // Sort tasks: non-adherent first (highest % first)
        usort($d['tasks'], function($a, $b) {
            $a_sort = $a['adherent'] ? 1 : -1;
            $b_sort = $b['adherent'] ? 1 : -1;
            if ($a_sort !== $b_sort) return $a_sort - $b_sort;
            return $b['pct'] <=> $a['pct'];
        });

        $assignees_list[] = [
            'name' => $name,
            'total_tasks' => $d['total'],
            'adherent_tasks' => $d['adherent'],
            'adherence_pct' => $adherence_pct,
            'tasks' => $d['tasks'],
        ];
    }

    $overall_adherence_pct = $overall_total > 0 ? round(($overall_adherent / $overall_total) * 100, 1) : 0;

    return [
        'summary' => [
            'total_complete' => $total_complete,
            'total_analyzed' => $overall_total,
            'excluded_no_estimate' => $excluded_no_estimate,
            'excluded_no_assignee' => $excluded_no_assignee,
            'overall_adherent' => $overall_adherent,
            'overall_adherence_pct' => $overall_adherence_pct,
        ],
        'assignees' => $assignees_list,
    ];
}

// --- Routing ---
$action = $_GET['action'] ?? '';

if ($action === 'upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded']);
        exit;
    }

    $ext = strtolower(pathinfo($_FILES['csv_file']['name'], PATHINFO_EXTENSION));
    if ($ext !== 'csv') {
        http_response_code(400);
        echo json_encode(['error' => 'Please upload a CSV file']);
        exit;
    }

    $stream = fopen($_FILES['csv_file']['tmp_name'], 'r');
    // Skip BOM if present
    $bom = fread($stream, 3);
    if ($bom !== "\xEF\xBB\xBF") rewind($stream);

    $result = analyze_csv($stream);
    fclose($stream);

    if (isset($result['error'])) {
        http_response_code(500);
        echo json_encode($result);
        exit;
    }

    $db = get_db();
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $stmt = $db->prepare('INSERT OR REPLACE INTO analysis_data (id, data, uploaded_at) VALUES (1, ?, ?)');
    $stmt->execute([json_encode($result), $now]);

    $result['uploaded_at'] = $now;
    echo json_encode($result);

} elseif ($action === 'data' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $db = get_db();
    $stmt = $db->query('SELECT data, uploaded_at FROM analysis_data WHERE id = 1');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        echo json_encode(['empty' => true]);
        exit;
    }

    $result = json_decode($row['data'], true);
    $result['uploaded_at'] = $row['uploaded_at'];
    echo json_encode($result);

} elseif ($action === 'settings' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $db = get_db();
    $stmt = $db->query('SELECT excluded_assignees, teams FROM settings WHERE id = 1');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo json_encode([
        'excluded_assignees' => json_decode($row['excluded_assignees'], true),
        'teams' => json_decode($row['teams'], true),
    ]);

} elseif ($action === 'settings' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'No data provided']);
        exit;
    }

    $db = get_db();
    $stmt = $db->prepare('UPDATE settings SET excluded_assignees = ?, teams = ? WHERE id = 1');
    $stmt->execute([
        json_encode($input['excluded_assignees'] ?? []),
        json_encode($input['teams'] ?? []),
    ]);
    echo json_encode(['ok' => true]);

} else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}
