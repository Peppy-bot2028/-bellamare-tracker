/* ===== Email Module — Bellamare Tracker ===== */

// Base directory — always available
const _baseOwnerDirectory = {
  "Paige": "paige@bellamaredevelopment.com",
  "Paul": "paul@bellamaredevelopment.com",
  "Deep": "deep@bellamaredevelopment.com",
  "AJ": "aj@bellamaredevelopment.com",
  "Anna Jane": "aj@bellamaredevelopment.com",
  "Sunny": "sunny@bellamaredevelopment.com"
};

// Full directory — built from base + all projects. Used for dropdowns.
window._ownerDirectory = Object.assign({}, _baseOwnerDirectory);

// Rebuild the directory by scanning all loaded projects AND tasks
function buildOwnerDirectory() {
  var dir = Object.assign({}, _baseOwnerDirectory);

  // Scan projects for owner name+email
  for (var i = 0; i < (window._projects || []).length; i++) {
    var p = window._projects[i];
    var name = (p.internalOwner || "").trim();
    var email = (p.internalOwnerEmail || "").trim();
    if (name && email) {
      var low = name.toLowerCase();
      var exists = false;
      for (var k in dir) {
        if (k.toLowerCase() === low) { exists = true; break; }
      }
      if (!exists) dir[name] = email;
    }
  }

  // Scan task cache for assignee name+email (picks up people added via tasks)
  for (var pid in (window._taskCache || {})) {
    var tasks = window._taskCache[pid];
    for (var t = 0; t < tasks.length; t++) {
      var tName = (tasks[t].assignee || "").trim();
      var tEmail = (tasks[t].assigneeEmail || "").trim();
      if (tName && tEmail) {
        var tLow = tName.toLowerCase();
        var tExists = false;
        for (var k2 in dir) {
          if (k2.toLowerCase() === tLow) { tExists = true; break; }
        }
        if (!tExists) dir[tName] = tEmail;
      }
    }
  }

  window._ownerDirectory = dir;
}

// Keep backward compatibility — tasks.js and app.js reference this
var ownerEmailDirectory = window._ownerDirectory;

function ownerEmailLookup(name) {
  const raw = (name || "").trim();
  if (!raw) return "";
  const low = raw.toLowerCase();

  // 1) Full directory (case-insensitive)
  for (const k of Object.keys(window._ownerDirectory || {})) {
    if (k.toLowerCase() === low) return window._ownerDirectory[k];
  }

  // 2) Look through loaded projects for a match (catches very recent edits)
  for (const p of (window._projects || [])) {
    const on = (p.internalOwner || "").trim();
    const em = (p.internalOwnerEmail || "").trim();
    if (on && em && on.toLowerCase() === low) return em;
  }
  return "";
}

function buildProjectMailto(project) {
  const email = project.internalOwnerEmail || ownerEmailLookup(project.internalOwner);
  if (!email) return null;

  const subject = encodeURIComponent(
    "Bellamare \u2013 " + project.name + " (" + (project.id || "") + ") \u2013 Action Required"
  );
  const body = encodeURIComponent(
    "Hi " + (project.internalOwner || "there") + ",\n\n" +
    "Re: " + project.name + "\n" +
    "Location: " + (project.location || "\u2014") + "\n" +
    "Stage: " + (stages[project.stage] || "\u2014") + "\n" +
    "Decision: " + (project.decision || "\u2014") + "\n" +
    "Target Date: " + (project.targetDecisionDate || "\u2014") + "\n\n" +
    "[Add your message here]\n\n" +
    "\u2014 Bellamare Development Tracker"
  );
  return "mailto:" + email + "?subject=" + subject + "&body=" + body;
}

function buildTaskMailto(project, task) {
  const email = task.assigneeEmail || ownerEmailLookup(task.assignee);
  if (!email) return null;

  const subject = encodeURIComponent(
    "Bellamare \u2013 " + project.name + " \u2013 Task: " + task.title
  );
  const body = encodeURIComponent(
    "Hi " + (task.assignee || "there") + ",\n\n" +
    "You have a new action item for " + project.name + " (" + (project.id || "") + "):\n\n" +
    "Task: " + task.title + "\n" +
    "Due: " + (task.dueDate || "No date set") + "\n" +
    "Notes: " + (task.notes || "\u2014") + "\n\n" +
    "Please update the tracker when complete.\n\n" +
    "\u2014 Bellamare Development Tracker"
  );
  return "mailto:" + email + "?subject=" + subject + "&body=" + body;
}

function buildReminderMailto(project, task) {
  const email = task.assigneeEmail || ownerEmailLookup(task.assignee);
  if (!email) return null;

  var dueText = task.dueDate || "No date set";
  var now = new Date();
  var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  var isOverdue = task.dueDate && task.dueDate < todayStr;

  const subject = encodeURIComponent(
    (isOverdue ? "REMINDER: " : "Upcoming: ") + project.name + " \u2013 " + task.title
  );
  const body = encodeURIComponent(
    "Hi " + (task.assignee || "there") + ",\n\n" +
    "This is a " + (isOverdue ? "reminder that the following task is overdue" : "heads-up that the following task is due soon") + ":\n\n" +
    "Project: " + project.name + " (" + (project.id || "") + ")\n" +
    "Task: " + task.title + "\n" +
    "Due: " + dueText + (isOverdue ? " (OVERDUE)" : "") + "\n" +
    (task.notes ? "Notes: " + task.notes + "\n" : "") +
    "\nPlease update the tracker when complete.\n\n" +
    "\u2014 Bellamare Development Tracker"
  );
  return "mailto:" + email + "?subject=" + subject + "&body=" + body;
}

function openEmail(url) {
  if (!url) {
    alert("No email address on file for this owner.");
    return;
  }
  // Use window.location.href for mailto: — works on both mobile and desktop
  window.location.href = url;
}

/* ---------- Weekly Email All Tasks ---------- */

// Group all active tasks by assignee email, return array of { name, email, tasks[] }
function groupTasksByAssignee() {
  var groups = {}; // keyed by email
  var projects = window._projects || [];

  for (var pid in (window._taskCache || {})) {
    var tasks = window._taskCache[pid];
    var project = null;
    for (var p = 0; p < projects.length; p++) {
      if (projects[p].id === pid) { project = projects[p]; break; }
    }
    if (!project) continue;

    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t];
      if (task.status === "completed") continue; // skip done tasks
      var email = task.assigneeEmail || ownerEmailLookup(task.assignee);
      var name = (task.assignee || "").trim();
      if (!email || !name) continue;

      var key = email.toLowerCase();
      if (!groups[key]) {
        groups[key] = { name: name, email: email, tasks: [] };
      }
      groups[key].tasks.push({
        projectName: project.name,
        projectId: project.id,
        title: task.title,
        dueDate: task.dueDate || "No date set",
        status: task.status || "pending",
        notes: task.notes || ""
      });
    }
  }

  // Convert to sorted array
  var result = [];
  for (var k in groups) result.push(groups[k]);
  result.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return result;
}

// Build a consolidated mailto for one assignee with all their tasks
function buildWeeklyMailto(group) {
  var lines = [];
  lines.push("Hi " + group.name + ",");
  lines.push("");
  lines.push("Here is your weekly task summary from the Bellamare Development Tracker:");
  lines.push("");

  for (var i = 0; i < group.tasks.length; i++) {
    var t = group.tasks[i];
    var statusLabel = t.status === "in_progress" ? "In Progress" : "Pending";
    lines.push((i + 1) + ". " + t.title);
    lines.push("   Project: " + t.projectName + " (" + t.projectId + ")");
    lines.push("   Due: " + t.dueDate + "  |  Status: " + statusLabel);
    if (t.notes) lines.push("   Notes: " + t.notes);
    lines.push("");
  }

  lines.push("Please update the tracker when tasks are complete.");
  lines.push("");
  lines.push("\u2014 Bellamare Development Tracker");

  var subject = encodeURIComponent(
    "Bellamare \u2013 Weekly Task Summary (" + group.tasks.length + " task" + (group.tasks.length === 1 ? "" : "s") + ")"
  );
  var body = encodeURIComponent(lines.join("\n"));
  return "mailto:" + group.email + "?subject=" + subject + "&body=" + body;
}

// Load all tasks for every project into the cache, then show the panel
async function showWeeklyEmailPanel() {
  var panel = document.getElementById("weeklyEmailPanel");
  if (!panel) return;

  // Load tasks for all projects that haven't been loaded yet
  var projects = window._projects || [];
  var toLoad = [];
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].id && !window._taskCache[projects[i].id]) {
      toLoad.push(projects[i].id);
    }
  }
  if (toLoad.length > 0) {
    panel.innerHTML = '<div style="padding:16px;color:var(--muted)">Loading all tasks...</div>';
    panel.style.display = "block";
    await Promise.all(toLoad.map(function (pid) { return loadProjectTasks(pid); }));
  }

  var groups = groupTasksByAssignee();

  if (groups.length === 0) {
    alert("No active tasks with assigned emails found.");
    panel.style.display = "none";
    return;
  }

  var html = '<div class="weeklyEmailHeader">' +
    '<h3>Weekly Task Emails</h3>' +
    '<span style="color:var(--muted);font-size:13px">' + groups.length + ' team member' + (groups.length === 1 ? '' : 's') + '</span>' +
    '<div style="display:flex;gap:8px;margin-left:auto">' +
      '<button class="btn-small btn-primary" onclick="sendAllWeeklyEmails()">Send All</button>' +
      '<button class="btn-small" onclick="hideWeeklyEmailPanel()">Close</button>' +
    '</div>' +
  '</div>';

  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    html += '<div class="weeklyEmailRow" id="weeklyRow-' + i + '">' +
      '<div class="weeklyEmailPerson">' +
        '<strong>' + escText(g.name) + '</strong>' +
        '<span style="color:var(--muted);font-size:12px;margin-left:8px">' + escText(g.email) + '</span>' +
        '<span class="badge" style="margin-left:8px">' + g.tasks.length + ' task' + (g.tasks.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<ul class="weeklyTaskList">';
    for (var t = 0; t < g.tasks.length; t++) {
      var task = g.tasks[t];
      html += '<li>' + escText(task.title) + ' <span style="color:var(--muted);font-size:11px">(' + escText(task.projectName) + ' \u2013 due ' + escText(task.dueDate) + ')</span></li>';
    }
    html += '</ul>' +
      '<button class="btn-small btn-email" onclick="sendWeeklyEmail(' + i + ')">Send Email</button>' +
    '</div>';
  }

  panel.innerHTML = html;
  panel.style.display = "block";
  // Store groups for the send functions
  window._weeklyEmailGroups = groups;
}

function hideWeeklyEmailPanel() {
  var panel = document.getElementById("weeklyEmailPanel");
  if (panel) { panel.style.display = "none"; panel.innerHTML = ""; }
  window._weeklyEmailGroups = null;
}

function sendWeeklyEmail(index) {
  var groups = window._weeklyEmailGroups;
  if (!groups || !groups[index]) return;
  var mailto = buildWeeklyMailto(groups[index]);
  window.location.href = mailto;
  // Mark row as sent
  var row = document.getElementById("weeklyRow-" + index);
  if (row) {
    row.style.opacity = "0.5";
    var btn = row.querySelector(".btn-email");
    if (btn) { btn.textContent = "Sent"; btn.disabled = true; }
  }
}

function sendAllWeeklyEmails() {
  var groups = window._weeklyEmailGroups;
  if (!groups || groups.length === 0) return;
  // Send one at a time with delay so each mailto opens
  var i = 0;
  function sendNext() {
    if (i >= groups.length) return;
    sendWeeklyEmail(i);
    i++;
    if (i < groups.length) setTimeout(sendNext, 1500);
  }
  sendNext();
}

// escText is defined in app.js (loaded after this file)
