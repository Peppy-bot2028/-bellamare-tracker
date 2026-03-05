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
    var statusLabel = { pending: "Pending", in_progress: "In Progress", completed: "Done" };
    var emailUrl = buildTaskMailto(project, t);

    var completeBtn = t.status !== "completed"
      ? '<button class="btn-small btn-complete" onclick="setTaskStatus(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\', \'completed\')" title="Mark complete">\u2713 Complete</button>'
      : '<button class="btn-small btn-reopen" onclick="setTaskStatus(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\', \'pending\')" title="Reopen task">\u21a9 Reopen</button>';

    taskRows +=
      '<li class="taskItem ' + statusClass + (isOverdue ? " overdue" : "") + '">' +
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
          completeBtn +
          '<button class="emailBtn" onclick="openEmail(buildTaskMailto(window._projects[' + ri + '], window._taskCache[\'' + escAttr(projectId) + '\'][' + i + ']))" ' +
            'title="Email assignee"' + (emailUrl ? "" : " disabled") + '>\u2709</button>' +
          '<button class="deleteBtn" onclick="removeTask(\'' + escAttr(projectId) + '\', \'' + escAttr(t.id) + '\')" title="Delete task">\u00d7</button>' +
        '</span>' +
      '</li>';
  }

  var ownerOptions = "";
  var owners = Object.keys(ownerEmailDirectory);
  for (var j = 0; j < owners.length; j++) {
    ownerOptions += '<option value="' + escAttr(owners[j]) + '">' + escText(owners[j]) + '</option>';
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

  var result = await createTask(data);
  if (result) {
    var project = window._projects[ri];
    var mailto = buildTaskMailto(project, result);
    openEmail(mailto);
    await loadProjectTasks(projectId);
    render();
  }
}

async function cycleTaskStatus(projectId, taskId, currentStatus) {
  var nextStatus = { pending: "in_progress", in_progress: "completed", completed: "pending" };
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
