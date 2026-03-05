/* ===== Projects API — Azure Function ===== */

const { projectsContainer, corsHeaders } = require("../shared/cosmos");

module.exports = async function (context, req) {
  const headers = corsHeaders();
  const method = req.method.toUpperCase();
  const id = context.bindingData.id || null;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }

  try {
    // --- GET: List all or get one ---
    if (method === "GET") {
      if (id) {
        const { resource } = await projectsContainer.item(id, id).read();
        if (!resource) {
          context.res = { status: 404, headers, body: JSON.stringify({ error: "Not found" }) };
          return;
        }
        context.res = { status: 200, headers, body: JSON.stringify({ project: resource }) };
      } else {
        const { resources } = await projectsContainer.items.readAll().fetchAll();
        context.res = { status: 200, headers, body: JSON.stringify({ projects: resources || [] }) };
      }
      return;
    }

    // --- POST: Create or bulk import ---
    if (method === "POST") {
      const body = req.body;

      // Bulk import endpoint: POST /api/projects/import
      if (id === "import" && body && body.projects) {
        const projects = body.projects;
        let count = 0;
        for (const p of projects) {
          const doc = Object.assign({}, p);
          doc.createdAt = doc.createdAt || new Date().toISOString();
          doc.updatedAt = new Date().toISOString();
          await projectsContainer.items.upsert(doc);
          count++;
        }
        context.res = { status: 200, headers, body: JSON.stringify({ count }) };
        return;
      }

      // Single create
      if (!body || !body.name === undefined) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Request body required" }) };
        return;
      }
      body.createdAt = body.createdAt || new Date().toISOString();
      body.updatedAt = new Date().toISOString();
      const { resource } = await projectsContainer.items.create(body);
      context.res = { status: 201, headers, body: JSON.stringify({ project: resource }) };
      return;
    }

    // --- PUT: Update (or create if new) ---
    if (method === "PUT") {
      if (!id) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Project ID required" }) };
        return;
      }
      const body = req.body;
      if (!body) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Request body required" }) };
        return;
      }

      // Try to read existing doc to merge; if not found, create new
      let existing = null;
      try {
        const readResult = await projectsContainer.item(id, id).read();
        existing = readResult.resource;
      } catch (readErr) {
        // Document doesn't exist yet — that's fine, we'll create it
      }

      const updated = existing ? Object.assign({}, existing, body) : Object.assign({}, body);
      updated.id = id;
      updated.createdAt = updated.createdAt || new Date().toISOString();
      updated.updatedAt = new Date().toISOString();
      // Remove UI-only fields
      delete updated.expanded;

      const { resource: result } = await projectsContainer.items.upsert(updated);
      context.res = { status: 200, headers, body: JSON.stringify({ project: result }) };
      return;
    }

    // --- DELETE ---
    if (method === "DELETE") {
      if (!id) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Project ID required" }) };
        return;
      }
      await projectsContainer.item(id, id).delete();
      context.res = { status: 200, headers, body: JSON.stringify({ success: true }) };
      return;
    }

    context.res = { status: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    context.log.error("Projects API error:", err.message);
    const status = err.code === 404 ? 404 : 500;
    context.res = { status, headers, body: JSON.stringify({ error: err.message }) };
  }
};
