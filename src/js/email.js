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

// Rebuild the directory by scanning all loaded projects
function buildOwnerDirectory() {
  var dir = Object.assign({}, _baseOwnerDirectory);
  for (var i = 0; i < (window._projects || []).length; i++) {
    var p = window._projects[i];
    var name = (p.internalOwner || "").trim();
    var email = (p.internalOwnerEmail || "").trim();
    if (name && email) {
      // Use the first email found for each name (base directory takes priority)
      var low = name.toLowerCase();
      var exists = false;
      for (var k in dir) {
        if (k.toLowerCase() === low) { exists = true; break; }
      }
      if (!exists) dir[name] = email;
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

function openEmail(url) {
  if (!url) {
    alert("No email address on file for this owner.");
    return;
  }
  window.open(url, "_blank");
}
