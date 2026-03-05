/* ===== Task Management Module — Bellamare Tracker ===== */

// Cache of loaded tasks keyed by projectId
window._taskCache = {};

// Load tasks for a project and cache them
async function loadProjectTasks(projectId) {
  if (!projectId) return [];
  const tasks = await loadTasks(projectId);
  window._taskCache[projectId] = tasks;
  return tasks;
}

// Get cached tasks (or empty array)
function getCachedTasks(projectId) {
  return window._taskCache[projectId] || [];
}

// Count all open tasks across cached projects
function countOpenTasks() {
  var total = 0, overdue = 0;
  var now = todayISO();
  for (var pid in window._taskCache) {
    var tasks = window._taskCache[pid];
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].status !== "completed") {
        total++;
        if (tasks[i].dueDate && tasks[i].dueDate < now) overdue++;
      }
    }
  }
  return { total: total, overdue: overdue };
}

// Render the task panel HTML for a project
function renderTaskPanel(project, ri) {
  var projectId = project.id;
  var tasks = getCachedTasks(projectId);
  var now = todayISO();

  var taskRows = "";
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var isOverdue = t.status !== "completed" && t.dueDate && t.dueDate < now;
    var statusClass = (t.status || "pending").replace(/ /g, "_");
    var statusLabel = { pending: "Pending", in_progress: "In Progress" };
    var emailUrl = buildTaskMailto(project, t);

    // No separate complete button — status cycles via the badge (Pending → In Progress)

    var notesHtml = t.notes
      ? '<div class="taskNotes">' + escText(t.notes) + '</div>'
      : '';

    taskRows +=
      '<li class="taskItem ' + statusClass + (isOverdue ? " overdue" : "") + '">' +
        '<div class="taskMainRow">' +
          '<button class="taskStatusBadge ' + statusClass + '" ' +
            'onclick="cycleTaskStatus(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\', \'' + statusClass + '\')" ' +
            'title="Click to change status">' +
            (statusLabel[t.status] || t.status) +
          '</button>' +
          '<span class="taskTitle" title="' + escAttr(t.title) + '">' + escText(t.title) + '</span>' +
          '<span class="taskAssignee">' + escText(t.assignee || "") + '</span>' +
          '<span class="taskDue' + (isOverdue ? " overdue" : "") + '">' +
            (t.dueDate || "\u2014") +
          '</span>' +
          '<span class="taskActions">' +
            '<button class="btn-small" onclick="toggleTaskNotes(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\')" title="Edit notes">\u270e Notes</button>' +
            '<button class="emailBtn" onclick="openEmail(buildTaskMailto(_findProject(\'' + escAttr(projectId) + '\'), window._taskCache[\'' + escAttr(projectId) + '\'][' + i + ']))" ' +
              'title="Email assignee"' + (emailUrl ? "" : " disabled") + '>\u2709</button>' +
            '<button class="deleteBtn" onclick="removeTask(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\')" title="Delete task">\u00d7</button>' +
          '</span>' +
        '</div>' +
        notesHtml +
        '<div class="taskNotesEdit" id="taskNotesEdit-' + escAttr(t.id) + '" style="display:none">' +
          '<textarea id="taskNotesArea-' + escAttr(t.id) + '" rows="2" placeholder="Add notes..." ' +
            'style="width:100%;padding:8px 10px;border:1px solid rgba(0,0,0,.12);border-radius:10px;font-size:13px;resize:vertical;margin-top:6px">' + escText(t.notes || "") + '</textarea>' +
          '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">' +
            '<button class="btn-small" onclick="toggleTaskNotes(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\')">Cancel</button>' +
            '<button class="btn-small btn-primary" onclick="saveTaskNotes(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\')">Save Notes</button>' +
          '</div>' +
        '</div>' +
      '</li>';
  }

  var ownerOptions = "";
  var owners = Object.keys(window._ownerDirectory || {});
  for (var j = 0; j < owners.length; j++) {
    ownerOptions += '<option value="' + escAttr(owners[j]) + '">' + escText(owners[j]) + ' (' + escText(window._ownerDirectory[owners[j]]) + ')</option>';
  }

  return (
    '<div class="taskPanel">' +
      '<div class="taskHeader">' +
        '<h3>Action Items (' + tasks.length + ')</h3>' +
        '<button class="btn-small btn-primary" onclick="showAddTaskForm(\'' + escAttr(projectId) + '\', ' + ri + ')">+ Add Task</button>' +
      '</div>' +
      (tasks.length > 0
        ? '<ul class="taskList">' + taskRows + '</ul>'
        : '<div style="font-size:12px;color:var(--muted);padding:8px 0">No tasks yet. Add one after your monthly meeting.</div>') +
      '<div id="addTaskForm-' + escAttr(projectId) + '" style="display:none">' +
        '<div class="addTaskForm">' +
          '<div class="field">' +
            '<div class="label">Task Title</div>' +
            '<input type="text" id="taskTitle-' + escAttr(projectId) + '" placeholder="e.g., Submit rezoning application" />' +
          '</div>' +
          '<div class="twoCol">' +
            '<div class="field">' +
              '<div class="label">Assignee</div>' +
              '<select id="taskAssignee-' + escAttr(projectId) + '">' +
                '<option value="">Select assignee...</option>' +
                ownerOptions +
                '<option value="__other__">Other (type name)</option>' +
              '</select>' +
              '<input type="text" id="taskAssigneeOther-' + escAttr(projectId) + '" placeholder="Enter name" style="display:none;margin-top:6px" />' +
            '</div>' +
            '<div class="field">' +
              '<div class="label">Due Date</div>' +
              '<input type="date" id="taskDue-' + escAttr(projectId) + '" />' +
            '</div>' +
          '</div>' +
          '<div class="field">' +
            '<div class="label">Notes</div>' +
            '<textarea id="taskNotes-' + escAttr(projectId) + '" rows="2" placeholder="Optional notes..." ' +
              'style="width:100%;padding:9px 10px;border:1px solid rgba(0,0,0,.12);border-radius:10px;font-size:13px;resize:vertical"></textarea>' +
          '</div>' +
          '<div class="formActions">' +
            '<button class="btn-small" onclick="hideAddTaskForm(\'' + escAttr(projectId) + '\')">Cancel</button>' +
            '<button class="btn-small btn-email" onclick="saveAndEmailTask(\'' + escAttr(projectId) + '\', ' + ri + ')">Save & Email</button>' +
            '<button class="btn-small btn-primary" onclick="saveNewTask(\'' + escAttr(projectId) + '\', ' + ri + ')">Save Task</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _findProject(id) {
  for (var i = 0; i < (window._projects || []).length; i++) {
    if (window._projects[i].id === id) return window._projects[i];
  }
  return null;
}

function showAddTaskForm(projectId) {
  var form = document.getElementById("addTaskForm-" + projectId);
  if (form) form.style.display = "block";

  // Wire up the "Other" option for assignee
  var sel = document.getElementById("taskAssignee-" + projectId);
  var other = document.getElementById("taskAssigneeOther-" + projectId);
  if (sel && other) {
    sel.onchange = function () {
      other.style.display = (sel.value === "__other__") ? "block" : "none";
    };
  }
}

function hideAddTaskForm(projectId) {
  var form = document.getElementById("addTaskForm-" + projectId);
  if (form) form.style.display = "none";
}

function _getTaskFormData(projectId) {
  var title = (document.getElementById("taskTitle-" + projectId) || {}).value || "";
  var assigneeSel = (document.getElementById("taskAssignee-" + projectId) || {}).value || "";
  var assigneeOther = (document.getElementById("taskAssigneeOther-" + projectId) || {}).value || "";
  var assignee = (assigneeSel === "__other__") ? assigneeOther : assigneeSel;
  var dueDate = (document.getElementById("taskDue-" + projectId) || {}).value || "";
  var notes = (document.getElementById("taskNotes-" + projectId) || {}).value || "";

  if (!title.trim()) {
    alert("Please enter a task title.");
    return null;
  }

  return {
    projectId: projectId,
    title: title.trim(),
    assignee: assignee.trim(),
    assigneeEmail: ownerEmailLookup(assignee.trim()),
    dueDate: dueDate,
    status: "pending",
    notes: notes.trim(),
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

async function saveNewTask(projectId, ri) {
  var data = _getTaskFormData(projectId);
  if (!data) return;

  var result = await createTask(data);
  if (result) {
    await loadProjectTasks(projectId);
    render();
  }
}

async function saveAndEmailTask(projectId, ri) {
  var data = _getTaskFormData(projectId);
  if (!data) return;

  // Open email BEFORE the async save — desktop browsers block mailto:
  // links triggered after an await (no longer a trusted user gesture)
  var project = _findProject(projectId);
  if (project) {
    var mailto = buildTaskMailto(project, data);
    openEmail(mailto);
  }

  var result = await createTask(data);
  if (result) {
    await loadProjectTasks(projectId);
    render();
  }
}

async function cycleTaskStatus(projectId, taskId, currentStatus) {
  var nextStatus = { pending: "in_progress", in_progress: "pending" };
  var newStatus = nextStatus[currentStatus] || "pending";
  var updates = { status: newStatus };
  if (newStatus === "completed") {
    updates.completedAt = new Date().toISOString();
  } else {
    updates.completedAt = null;
  }

  var result = await updateTask(taskId, updates);
  if (result) {
    await loadProjectTasks(projectId);
    render();
  }
}

async function setTaskStatus(projectId, taskId, newStatus) {
  var updates = { status: newStatus };
  if (newStatus === "completed") {
    updates.completedAt = new Date().toISOString();
  } else {
    updates.completedAt = null;
  }

  var result = await updateTask(taskId, updates);
  if (result) {
    await loadProjectTasks(projectId);
    render();
  }
}

async function removeTask(projectId, taskId) {
  if (!confirm("Delete this task?")) return;
  var result = await deleteTask(taskId);
  if (result) {
    await loadProjectTasks(projectId);
    render();
  }
}

function toggleTaskNotes(projectId, taskId) {
  var el = document.getElementById("taskNotesEdit-" + taskId);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

async function saveTaskNotes(projectId, taskId) {
  var area = document.getElementById("taskNotesArea-" + taskId);
  if (!area) return;
  var notes = area.value.trim();
  var result = await updateTask(taskId, { notes: notes });
  if (result) {
    await loadProjectTasks(projectId);
    render();
  }
}
