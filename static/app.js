(() => {
    const fileInput = document.getElementById('file-input');
    const loading = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const results = document.getElementById('results');
    const emptyState = document.getElementById('empty-state');
    const uploadInfo = document.getElementById('upload-info');

    let chartInstance = null;
    let rawData = null;
    let currentData = null;
    let sortCol = 'adherence_pct';
    let sortAsc = true;

    // Config state
    let excludedAssignees = new Set();
    let teams = [];
    let viewMode = 'individual';

    // --- File input (header button + empty state button) ---
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) uploadFile(file);
        fileInput.value = '';
    });

    document.querySelectorAll('.empty-file-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) uploadFile(file);
            e.target.value = '';
        });
    });

    // --- Upload ---
    async function uploadFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showError('Please upload a CSV file.');
            return;
        }

        loading.classList.remove('hidden');
        errorEl.classList.add('hidden');
        results.classList.add('hidden');
        emptyState.classList.add('hidden');

        const form = new FormData();
        form.append('csv_file', file);

        try {
            const resp = await fetch('api.php?action=upload', { method: 'POST', body: form });
            const data = await resp.json();

            if (!resp.ok) {
                showError(data.error || 'Unknown error');
                return;
            }

            rawData = data;
            // Reset exclusions for new data, keep teams
            excludedAssignees = new Set();
            buildConfigPanel(data.assignees);
            applyAndRender();
            updateUploadInfo(data.uploaded_at);

            // Save clean exclusions for new dataset
            saveSettings();
        } catch (err) {
            showError('Failed to upload file: ' + err.message);
        } finally {
            loading.classList.add('hidden');
        }
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    }

    function updateUploadInfo(isoDate) {
        if (!isoDate) {
            uploadInfo.textContent = '';
            return;
        }
        const d = new Date(isoDate);
        uploadInfo.textContent = 'Last upload: ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }

    // --- Load persisted data on page load ---
    async function loadInitialData() {
        try {
            const [dataResp, settingsResp] = await Promise.all([
                fetch('api.php?action=data'),
                fetch('api.php?action=settings'),
            ]);

            const data = await dataResp.json();
            const settings = await settingsResp.json();

            if (data.empty) {
                emptyState.classList.remove('hidden');
                return;
            }

            rawData = data;

            // Restore settings
            excludedAssignees = new Set(settings.excluded_assignees || []);
            teams = (settings.teams || []).map(t => ({
                name: t.name,
                members: new Set(t.members),
            }));

            buildConfigPanel(data.assignees);
            applyAndRender();
            updateUploadInfo(data.uploaded_at);
        } catch (err) {
            showError('Failed to load data: ' + err.message);
        }
    }

    // --- Save settings to server ---
    async function saveSettings() {
        try {
            await fetch('api.php?action=settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    excluded_assignees: [...excludedAssignees],
                    teams: teams.map(t => ({ name: t.name, members: [...t.members] })),
                }),
            });
        } catch (err) {
            // Silent fail — settings will be re-saved on next action
        }
    }

    // =========================================================
    // Config Panel
    // =========================================================

    document.getElementById('toggle-config').addEventListener('click', () => {
        const body = document.getElementById('config-body');
        const btn = document.getElementById('toggle-config');
        body.classList.toggle('collapsed');
        btn.textContent = body.classList.contains('collapsed') ? 'Show' : 'Hide';
    });

    document.getElementById('apply-config-btn').addEventListener('click', () => {
        readExclusionsFromUI();
        applyAndRender();
        saveSettings();
    });

    document.getElementById('select-all-btn').addEventListener('click', () => {
        document.querySelectorAll('#assignee-checkboxes input[type="checkbox"]').forEach(cb => {
            if (!cb.closest('.checkbox-item').classList.contains('filter-hidden')) {
                cb.checked = true;
            }
        });
    });

    document.getElementById('select-none-btn').addEventListener('click', () => {
        document.querySelectorAll('#assignee-checkboxes input[type="checkbox"]').forEach(cb => {
            if (!cb.closest('.checkbox-item').classList.contains('filter-hidden')) {
                cb.checked = false;
            }
        });
    });

    document.getElementById('assignee-filter').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#assignee-checkboxes .checkbox-item').forEach(item => {
            const name = item.dataset.name.toLowerCase();
            if (name.includes(q)) {
                item.classList.remove('filter-hidden');
                item.style.display = '';
            } else {
                item.classList.add('filter-hidden');
                item.style.display = 'none';
            }
        });
    });

    document.getElementById('add-team-btn').addEventListener('click', () => {
        const input = document.getElementById('new-team-name');
        const name = input.value.trim();
        if (!name) return;
        if (teams.some(t => t.name === name)) return;
        teams.push({ name, members: new Set() });
        input.value = '';
        renderTeams();
    });

    document.querySelectorAll('input[name="view-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            viewMode = e.target.value;
            if (rawData) applyAndRender();
        });
    });

    function buildConfigPanel(assignees) {
        const container = document.getElementById('assignee-checkboxes');
        container.innerHTML = '';

        const sorted = [...assignees].sort((a, b) => a.name.localeCompare(b.name));
        for (const a of sorted) {
            const label = document.createElement('label');
            label.className = 'checkbox-item';
            label.dataset.name = a.name;
            const checked = !excludedAssignees.has(a.name);
            label.innerHTML = `
                <input type="checkbox" value="${escHtml(a.name)}" ${checked ? 'checked' : ''}>
                <span>${escHtml(a.name)}</span>
                <span class="task-count">${a.total_tasks} tasks</span>
            `;
            container.appendChild(label);
        }

        renderTeams();
    }

    function readExclusionsFromUI() {
        excludedAssignees = new Set();
        document.querySelectorAll('#assignee-checkboxes input[type="checkbox"]').forEach(cb => {
            if (!cb.checked) {
                excludedAssignees.add(cb.value);
            }
        });
    }

    function renderTeams() {
        const container = document.getElementById('teams-container');
        container.innerHTML = '';

        if (!rawData) return;

        const allNames = rawData.assignees.map(a => a.name).sort();

        teams.forEach((team, teamIdx) => {
            const card = document.createElement('div');
            card.className = 'team-card';

            const header = document.createElement('div');
            header.className = 'team-card-header';
            header.innerHTML = `
                <strong>${escHtml(team.name)}</strong>
                <button class="team-remove-btn" title="Remove team">&times;</button>
            `;
            header.querySelector('.team-remove-btn').addEventListener('click', () => {
                teams.splice(teamIdx, 1);
                renderTeams();
            });
            card.appendChild(header);

            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'team-members-list';
            for (const member of team.members) {
                const chip = document.createElement('span');
                chip.className = 'team-member-chip';
                chip.innerHTML = `${escHtml(member)}<button title="Remove">&times;</button>`;
                chip.querySelector('button').addEventListener('click', () => {
                    team.members.delete(member);
                    renderTeams();
                });
                chipsDiv.appendChild(chip);
            }
            card.appendChild(chipsDiv);

            const addDiv = document.createElement('div');
            addDiv.className = 'team-add-member';
            const select = document.createElement('select');
            select.innerHTML = '<option value="">+ Add member...</option>';

            const assigned = new Set();
            for (const t of teams) {
                for (const m of t.members) assigned.add(m);
            }

            for (const name of allNames) {
                if (!assigned.has(name)) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    select.appendChild(opt);
                }
            }

            select.addEventListener('change', () => {
                if (select.value) {
                    team.members.add(select.value);
                    renderTeams();
                }
            });

            addDiv.appendChild(select);
            card.appendChild(addDiv);
            container.appendChild(card);
        });
    }

    // =========================================================
    // Apply filters + grouping, then render
    // =========================================================

    function applyAndRender() {
        if (!rawData) return;

        const filtered = rawData.assignees.filter(a => !excludedAssignees.has(a.name));

        if (viewMode === 'team' && teams.length > 0) {
            currentData = buildTeamView(filtered);
        } else {
            currentData = buildIndividualView(filtered);
        }

        renderResults(currentData);
        results.classList.remove('hidden');
        emptyState.classList.add('hidden');
    }

    function buildIndividualView(assignees) {
        return recomputeSummary(assignees);
    }

    function buildTeamView(assignees) {
        const assigneeMap = {};
        for (const a of assignees) {
            assigneeMap[a.name] = a;
        }

        const assigned = new Set();
        for (const t of teams) {
            for (const m of t.members) assigned.add(m);
        }

        const result = [];

        for (const team of teams) {
            let totalTasks = 0;
            let adherentTasks = 0;
            let allTasks = [];

            for (const member of team.members) {
                const a = assigneeMap[member];
                if (!a) continue;
                totalTasks += a.total_tasks;
                adherentTasks += a.adherent_tasks;
                for (const t of a.tasks) {
                    allTasks.push({ ...t, member_name: member });
                }
            }

            if (totalTasks > 0) {
                allTasks.sort((a, b) => (!a.adherent ? -1 : 1) - (!b.adherent ? -1 : 1) || b.pct - a.pct);
                result.push({
                    name: team.name,
                    total_tasks: totalTasks,
                    adherent_tasks: adherentTasks,
                    adherence_pct: round1((adherentTasks / totalTasks) * 100),
                    tasks: allTasks,
                    is_team: true,
                });
            }
        }

        for (const a of assignees) {
            if (!assigned.has(a.name)) {
                result.push(a);
            }
        }

        return recomputeSummary(result);
    }

    function recomputeSummary(assignees) {
        let totalAnalyzed = 0;
        let overallAdherent = 0;

        for (const a of assignees) {
            totalAnalyzed += a.total_tasks;
            overallAdherent += a.adherent_tasks;
        }

        return {
            summary: {
                total_complete: rawData.summary.total_complete,
                total_analyzed: totalAnalyzed,
                excluded_no_estimate: rawData.summary.excluded_no_estimate,
                excluded_no_assignee: rawData.summary.excluded_no_assignee,
                excluded_by_user: rawData.summary.total_analyzed - totalAnalyzed,
                overall_adherent: overallAdherent,
                overall_adherence_pct: totalAnalyzed > 0 ? round1((overallAdherent / totalAnalyzed) * 100) : 0,
            },
            assignees,
        };
    }

    // =========================================================
    // Render results
    // =========================================================

    function renderResults(data) {
        const s = data.summary;

        document.getElementById('stat-complete').textContent = s.total_complete.toLocaleString();
        document.getElementById('stat-analyzed').textContent = s.total_analyzed.toLocaleString();
        document.getElementById('stat-adherent').textContent = s.overall_adherent.toLocaleString();
        document.getElementById('stat-adherence-pct').textContent = s.overall_adherence_pct + '%';

        const excludedTotal = (s.excluded_no_estimate || 0) + (s.excluded_no_assignee || 0) + (s.excluded_by_user || 0);
        document.getElementById('stat-excluded').textContent = excludedTotal.toLocaleString();

        renderChart(data.assignees);
        renderTable(data.assignees);
    }

    function renderChart(assignees) {
        const sorted = [...assignees].sort((a, b) => a.adherence_pct - b.adherence_pct);
        const labels = sorted.map(a => a.name);
        const values = sorted.map(a => a.adherence_pct);
        const colors = values.map(v => v >= 80 ? '#16a34a' : v >= 60 ? '#ca8a04' : '#dc2626');

        const ctx = document.getElementById('adherence-chart').getContext('2d');

        if (chartInstance) chartInstance.destroy();

        const chartContainer = document.querySelector('.chart-container');
        chartContainer.style.minHeight = Math.max(300, sorted.length * 28) + 'px';

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Adherence %',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 4,
                    barThickness: 20,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.raw + '% adherence'
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: 100,
                        ticks: { callback: v => v + '%' },
                        grid: { color: '#f3f4f6' },
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 12 } },
                    }
                }
            }
        });
    }

    function renderTable(assignees) {
        const sorted = sortAssignees(assignees);
        const tbody = document.getElementById('assignee-tbody');
        tbody.innerHTML = '';

        document.querySelectorAll('#assignee-table thead th').forEach(th => {
            const arrow = th.querySelector('.sort-arrow');
            if (th.dataset.sort === sortCol) {
                arrow.textContent = sortAsc ? '\u25B2' : '\u25BC';
            } else {
                arrow.textContent = '';
            }
        });

        sorted.forEach((assignee, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'assignee-row';
            tr.dataset.idx = idx;

            const badgeClass = assignee.adherence_pct >= 80 ? 'adherence-green'
                : assignee.adherence_pct >= 60 ? 'adherence-yellow' : 'adherence-red';

            const nameLabel = assignee.is_team
                ? `<span class="expand-indicator">\u25B6</span><strong>${escHtml(assignee.name)}</strong>`
                : `<span class="expand-indicator">\u25B6</span>${escHtml(assignee.name)}`;

            tr.innerHTML = `
                <td>${nameLabel}</td>
                <td>${assignee.total_tasks}</td>
                <td>${assignee.adherent_tasks}</td>
                <td><span class="adherence-badge ${badgeClass}">${assignee.adherence_pct}%</span></td>
            `;

            tr.addEventListener('click', () => toggleDetail(tr, idx));
            tbody.appendChild(tr);

            const detailTr = document.createElement('tr');
            detailTr.className = 'detail-row';
            detailTr.id = 'detail-' + idx;
            const showMember = assignee.is_team;
            detailTr.innerHTML = `<td colspan="4">${buildDetailTable(assignee.tasks, showMember)}</td>`;
            tbody.appendChild(detailTr);
        });
    }

    function toggleDetail(row, idx) {
        const detailRow = document.getElementById('detail-' + idx);
        const isExpanded = row.classList.contains('expanded');

        if (isExpanded) {
            row.classList.remove('expanded');
            detailRow.classList.remove('expanded');
        } else {
            row.classList.add('expanded');
            detailRow.classList.add('expanded');
        }
    }

    function buildDetailTable(tasks, showMember) {
        const memberHeader = showMember ? '<th>Assignee</th>' : '';
        let html = `<table class="detail-table">
            <thead><tr>
                <th>Task</th>
                <th>Parent</th>
                ${memberHeader}
                <th>Estimate</th>
                <th>Logged</th>
                <th>% of Est.</th>
                <th>Status</th>
            </tr></thead><tbody>`;

        for (const t of tasks) {
            const rowClass = t.adherent ? 'at-estimate' : 'over-estimate';
            const icon = t.adherent
                ? '<span class="status-icon status-pass">\u2713</span>'
                : '<span class="status-icon status-fail">\u2717</span>';
            const memberCell = showMember ? `<td>${escHtml(t.member_name || '')}</td>` : '';

            html += `<tr class="${rowClass}">
                <td>${escHtml(t.task_name)}</td>
                <td>${escHtml(t.parent_name)}</td>
                ${memberCell}
                <td>${escHtml(t.time_estimate)}</td>
                <td>${escHtml(t.time_logged)}</td>
                <td>${t.pct}%</td>
                <td>${icon}</td>
            </tr>`;
        }

        html += '</tbody></table>';
        return html;
    }

    function sortAssignees(assignees) {
        const arr = [...assignees];
        arr.sort((a, b) => {
            let va = a[sortCol], vb = b[sortCol];
            if (typeof va === 'string') {
                va = va.toLowerCase();
                vb = vb.toLowerCase();
            }
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });
        return arr;
    }

    document.querySelectorAll('#assignee-table thead th').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (!col) return;
            if (sortCol === col) {
                sortAsc = !sortAsc;
            } else {
                sortCol = col;
                sortAsc = col === 'name';
            }
            if (currentData) renderTable(currentData.assignees);
        });
    });

    // --- Util ---
    function escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function round1(n) {
        return Math.round(n * 10) / 10;
    }

    // --- Init ---
    loadInitialData();
})();
