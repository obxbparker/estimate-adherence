<?php
session_start();
if (empty($_SESSION['authenticated'])) {
    header('Location: login.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Estimate Adherence Analyzer</title>
    <link rel="stylesheet" href="static/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <header>
        <div class="header-left">
            <h1>Estimate Adherence</h1>
            <span id="upload-info" class="upload-info"></span>
        </div>
        <div class="header-right">
            <a href="logout.php" class="logout-link">Logout</a>
            <label class="upload-btn">
                Upload CSV
                <input type="file" id="file-input" accept=".csv" hidden>
            </label>
        </div>
    </header>

    <div id="loading" class="loading hidden">
        <div class="spinner"></div>
        <p>Analyzing...</p>
    </div>

    <div id="error" class="error hidden"></div>

    <div id="empty-state" class="empty-state hidden">
        <p>No data yet. Upload a ClickUp CSV export to get started.</p>
        <label class="upload-btn large">
            Upload CSV
            <input type="file" accept=".csv" class="empty-file-input" hidden>
        </label>
    </div>

    <main id="results" class="hidden">
        <section id="summary-bar" class="summary-bar">
            <div class="stat">
                <span class="stat-value" id="stat-complete">-</span>
                <span class="stat-label">Complete Tasks</span>
            </div>
            <div class="stat">
                <span class="stat-value" id="stat-analyzed">-</span>
                <span class="stat-label">Analyzed</span>
            </div>
            <div class="stat">
                <span class="stat-value" id="stat-adherent">-</span>
                <span class="stat-label">Within 110%</span>
            </div>
            <div class="stat highlight">
                <span class="stat-value" id="stat-adherence-pct">-</span>
                <span class="stat-label">Overall Adherence</span>
            </div>
            <div class="stat muted">
                <span class="stat-value" id="stat-excluded">-</span>
                <span class="stat-label">Excluded</span>
            </div>
        </section>

        <section id="config-panel" class="config-panel">
            <div class="config-header">
                <h2>Configuration</h2>
                <button id="toggle-config" class="toggle-config-btn">Hide</button>
            </div>
            <div id="config-body" class="config-body">
                <div class="config-columns">
                    <div class="config-col">
                        <h3>Exclude Assignees</h3>
                        <p class="config-hint">Uncheck assignees to exclude them from analysis</p>
                        <div class="filter-bar">
                            <input type="text" id="assignee-filter" placeholder="Filter assignees..." class="filter-input">
                            <button id="select-all-btn" class="small-btn">All</button>
                            <button id="select-none-btn" class="small-btn">None</button>
                        </div>
                        <div id="assignee-checkboxes" class="checkbox-list"></div>
                    </div>
                    <div class="config-col">
                        <h3>Teams</h3>
                        <p class="config-hint">Group assignees into teams for rolled-up reporting</p>
                        <div class="team-builder">
                            <div class="add-team-row">
                                <input type="text" id="new-team-name" placeholder="Team name..." class="filter-input">
                                <button id="add-team-btn" class="small-btn accent">Add Team</button>
                            </div>
                            <div id="teams-container"></div>
                        </div>
                    </div>
                </div>
                <div class="config-actions">
                    <button id="apply-config-btn" class="apply-btn">Apply &amp; Refresh</button>
                </div>
            </div>
        </section>

        <div class="view-toggle-bar">
            <label class="view-toggle">
                <input type="radio" name="view-mode" value="individual" checked> Individual
            </label>
            <label class="view-toggle">
                <input type="radio" name="view-mode" value="team"> Team
            </label>
        </div>

        <section class="chart-section">
            <h2>Adherence by Assignee</h2>
            <div class="chart-container">
                <canvas id="adherence-chart"></canvas>
            </div>
        </section>

        <section class="table-section">
            <h2>Detail by Assignee</h2>
            <div class="table-wrapper">
                <table id="assignee-table">
                    <thead>
                        <tr>
                            <th data-sort="name">Assignee <span class="sort-arrow"></span></th>
                            <th data-sort="total_tasks">Total Tasks <span class="sort-arrow"></span></th>
                            <th data-sort="adherent_tasks">Tasks &le; 110% <span class="sort-arrow"></span></th>
                            <th data-sort="adherence_pct">Adherence % <span class="sort-arrow"></span></th>
                        </tr>
                    </thead>
                    <tbody id="assignee-tbody"></tbody>
                </table>
            </div>
        </section>
    </main>

    <script src="static/app.js"></script>
</body>
</html>
