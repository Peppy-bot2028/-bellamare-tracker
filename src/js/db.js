/* ===== Database API Client — Bellamare Tracker ===== */

const API_BASE = "/api";

/* ---------- Sync Status ---------- */
let _syncState = "saved"; // saved | saving | error | offline

function setSyncStatus(state) {
  _syncState = state;
  const labels = { saved: "Saved", saving: "Saving\u2026", error: "Save failed", offline: "Offline" };
  const html = '<span class="syncDot ' + state + '"></span> ' + (labels[state] || state);
  var el = document.getElementById("syncStatus");
  if (el) el.innerHTML = html;
  var el2 = document.getElementById("syncStatusMobile");
  if (el2) el2.innerHTML = html;
}

/* ---------- Projects ---------- */

async function loadProjects() {
  try {
    const res = await fetch(API_BASE + "/projects");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data.projects || [];
  } catch (e) {
    console.error("loadProjects failed:", e);
    setSyncStatus("error");
    return [];
  }
}

async function saveProject(project) {
  setSyncStatus("saving");
  try {
    const id = project.id;
    const method = id ? "PUT" : "POST";
    const url = id ? (API_BASE + "/projects/" + id) : (API_BASE + "/projects");
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setSyncStatus("saved");
    const data = await res.json();
    return data.project || project;
  } catch (e) {
    console.error("saveProject failed:", e);
    setSyncStatus("error");
    return null;
  }
}

async function deleteProject(id) {
  try {
    const res = await fetch(API_BASE + "/projects/" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) {
      var errBody = "";
      try { errBody = await res.text(); } catch (_) {}
      console.error("deleteProject HTTP " + res.status + ":", errBody);
      throw new Error("HTTP " + res.status + " — " + errBody);
    }
    return true;
  } catch (e) {
    console.error("deleteProject failed:", e);
    return e.message || "Unknown error";
  }
}

async function importProjects(projectsArray) {
  setSyncStatus("saving");
  try {
    const res = await fetch(API_BASE + "/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: projectsArray })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setSyncStatus("saved");
    const data = await res.json();
    return data.count || 0;
  } catch (e) {
    console.error("importProjects failed:", e);
    setSyncStatus("error");
    return 0;
  }
}

/* ---------- Debounced Auto-Save ---------- */
const _saveTimers = {};

function debouncedSave(project, delayMs) {
  if (!project || !project.id) return;
  const delay = delayMs || 1500;
  clearTimeout(_saveTimers[project.id]);
  _saveTimers[project.id] = setTimeout(function () {
    saveProject(project);
  }, delay);
}

/* ---------- Multi-User Auto-Refresh ---------- */
let _refreshInterval = null;
let _lastRefresh = 0;

function startAutoRefresh(intervalMs) {
  var interval = intervalMs || 30000; // 30 seconds default
  stopAutoRefresh();
  _refreshInterval = setInterval(function () {
    // Don't refresh if user is actively editing a field
    if (_isEditing()) return;
    // Don't refresh if a save is in progress
    if (_syncState === "saving") return;
    silentRefresh();
  }, interval);
}

function stopAutoRefresh() {
  if (_refreshInterval) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
  }
}

async function silentRefresh() {
  try {
    var res = await fetch(API_BASE + "/projects");
    if (!res.ok) return;
    var data = await res.json();
    var serverProjects = data.projects || [];
    if (serverProjects.length === 0) return;

    // Build lookup of current expanded state
    var expandedIds = {};
    window._projects.forEach(function (p) { if (p.expanded) expandedIds[p.id] = true; });

    // Merge: update existing projects with server data, add new ones, remove deleted ones
    var serverIds = {};
    var merged = [];
    for (var i = 0; i < serverProjects.length; i++) {
      var sp = serverProjects[i];
      serverIds[sp.id] = true;
      // Preserve expanded state from local
      sp.expanded = !!expandedIds[sp.id];
      merged.push(sp);
    }

    // Check if anything actually changed (compare count + updatedAt timestamps)
    var changed = false;
    if (merged.length !== window._projects.length) {
      changed = true;
    } else {
      for (var j = 0; j < merged.length; j++) {
        var local = window._projects.find(function (p) { return p.id === merged[j].id; });
        if (!local || local.updatedAt !== merged[j].updatedAt) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      window._projects = merged;
      _ensureIds();
      buildOwnerDirectory();

      // Reload tasks for any new/changed projects
      var taskPromises = window._projects.map(function (p) {
        return loadProjectTasks(p.id);
      });
      await Promise.all(taskPromises);

      render();
      _lastRefresh = Date.now();
    }
  } catch (e) {
    // Silent fail — will retry next interval
    console.log("Auto-refresh failed:", e.message);
  }
}

/* ---------- Tasks ---------- */

async function loadTasks(projectId) {
  try {
    const url = projectId
      ? (API_BASE + "/tasks?projectId=" + encodeURIComponent(projectId))
      : (API_BASE + "/tasks");
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data.tasks || [];
  } catch (e) {
    console.error("loadTasks failed:", e);
    return [];
  }
}

async function createTask(task) {
  setSyncStatus("saving");
  try {
    const res = await fetch(API_BASE + "/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setSyncStatus("saved");
    const data = await res.json();
    return data.task || task;
  } catch (e) {
    console.error("createTask failed:", e);
    setSyncStatus("error");
    return null;
  }
}

async function updateTask(id, updates) {
  setSyncStatus("saving");
  try {
    const res = await fetch(API_BASE + "/tasks/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setSyncStatus("saved");
    const data = await res.json();
    return data.task || null;
  } catch (e) {
    console.error("updateTask failed:", e);
    setSyncStatus("error");
    return null;
  }
}

async function deleteTask(id) {
  try {
    const res = await fetch(API_BASE + "/tasks/" + id, { method: "DELETE" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return true;
  } catch (e) {
    console.error("deleteTask failed:", e);
    return false;
  }
}

/* ---------- JSON Export ---------- */
function exportToJson(projects) {
  const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bellamare-backup-" + todayISO() + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- JSON Import (from file picker) ---------- */
async function importFromFile() {
  try {
    if (!("showOpenFilePicker" in window)) {
      alert("File picker not supported. Use Chrome or Edge on desktop for import.");
      return;
    }
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      multiple: false
    });
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      alert("That JSON file isn't an array of projects.");
      return;
    }

    // Normalize projects using the same defensive defaults as the original app
    const normalized = parsed.map(normalizeProject);
    const count = await importProjects(normalized);
    alert("Imported " + count + " projects. Reloading\u2026");
    location.reload();
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error("Import failed:", e);
      alert("Import failed: " + e.message);
    }
  }
}

/* ---------- Normalize a raw project from JSON ---------- */
function normalizeProject(p) {
  return {
    id: p.id || "",
    name: p.name || p.Title || "",
    location: p.location || p.Location || "",
    projectType: p.projectType || p["Project Type"] || "",
    developer: p.developer || p.Developer || "",
    stage: (typeof p.stage === "number") ? p.stage : Number(p.stage || 0) || 0,
    stageName: p.stageName || "",
    status: p.status || p["Current Status"] || "",
    constraint: p.constraint || p["Primary Constraint"] || "",
    gate: p.gate || p["Next Gate"] || "",
    otherGate: p.otherGate || "",
    nextGateComments: p.nextGateComments || p["Next Gate Comments"] || "",
    generalComments: p.generalComments || p["General Comments"] || "",
    ownershipPct: p.ownershipPct != null ? p.ownershipPct : (p["Ownership %"] != null ? p["Ownership %"] : ""),
    cashNeeded: (typeof p.cashNeeded === "boolean") ? p.cashNeeded : (String(p.cashNeeded || p["Cash Needed"] || "").toLowerCase() === "yes"),
    cashNeededAmount: p.cashNeededAmount || "",
    decision: p.decision || "Not set",
    targetDecisionDate: p.targetDecisionDate || "",
    internalOwner: p.internalOwner || "",
    internalOwnerEmail: p.internalOwnerEmail || "",
    bucket: ((p.bucket || p.Bucket || "pipeline") === "development" ? "construction" : (p.bucket || p.Bucket || "pipeline")),
    scores: (function () {
      var raw = p.scores || {};
      function get(k, alt) {
        var v = raw[k] != null ? raw[k] : (p[k] != null ? p[k] : (p[alt] != null ? p[alt] : 0));
        var n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(4, n));
      }
      return {
        Market: get("Market", "Market Score"),
        Entitlements: get("Entitlements", "Entitlements Score"),
        Site: get("Site", "Site Control Score"),
        Construction: get("Construction", "Construction Score"),
        Capital: get("Capital", "Capital Score"),
        Sponsor: get("Sponsor", "Sponsor Score")
      };
    })()
  };
}
