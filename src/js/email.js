/* ===== Email Module — Bellamare Tracker ===== */

const ownerEmailDirectory = {
  "Paige": "paige@bellamaredevelopment.com",
  "Paul": "paul@bellamaredevelopment.com",
  "Deep": "deep@bellamaredevelopment.com",
  "AJ": "aj@bellamaredevelopment.com",
  "Anna Jane": "aj@bellamaredevelopment.com",
  "Sunny": "sunny@bellamaredevelopment.com"
};

function ownerEmailLookup(name) {
  const raw = (name || "").trim();
  if (!raw) return "";
  const low = raw.toLowerCase();

  // 1) Hard directory (case-insensitive)
  for (const k of Object.keys(ownerEmailDirectory)) {
    if (k.toLowerCase() === low) return ownerEmailDirectory[k];
  }

  // 2) Look through loaded projects for a match
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
