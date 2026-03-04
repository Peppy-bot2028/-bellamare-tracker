/* ===== Tasks API — Azure Function ===== */

const { tasksContainer, corsHeaders } = require("../shared/cosmos");
const crypto = require("crypto");

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
    // --- GET: List tasks (optionally filtered by projectId) or get one ---
    if (method === "GET") {
      if (id) {
        // Get single task — need to query since we partition by projectId
        const query = {
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: id }]
        };
        const { resources } = await tasksContainer.items.query(query).fetchAll();
        if (!resources || resources.length === 0) {
          context.res = { status: 404, headers, body: JSON.stringify({ error: "Not found" }) };
          return;
        }
        context.res = { status: 200, headers, body: JSON.stringify({ task: resources[0] }) };
      } else {
        const projectId = req.query.projectId;
        let resources;

        if (projectId) {
          // Filter by project
          const query = {
            query: "SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.createdAt DESC",
            parameters: [{ name: "@projectId", value: projectId }]
          };
          const result = await tasksContainer.items.query(query).fetchAll();
          resources = result.resources;
        } else {
          // Get all tasks
          const result = await tasksContainer.items.readAll().fetchAll();
          resources = result.resources;
        }

        context.res = { status: 200, headers, body: JSON.stringify({ tasks: resources || [] }) };
      }
      return;
    }

    // --- POST: Create task ---
    if (method === "POST") {
      const body = req.body;
      if (!body || !body.title) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Task title required" }) };
        return;
      }
      if (!body.projectId) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "projectId required" }) };
        return;
      }

      body.id = body.id || ("task-" + crypto.randomUUID());
      body.status = body.status || "pending";
      body.createdAt = body.createdAt || new Date().toISOString();
      body.completedAt = body.completedAt || null;

      const { resource } = await tasksContainer.items.create(body);
      context.res = { status: 201, headers, body: JSON.stringify({ task: resource }) };
      return;
    }

    // --- PUT: Update task ---
    if (method === "PUT") {
      if (!id) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Task ID required" }) };
        return;
      }
      const body = req.body;
      if (!body) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Request body required" }) };
        return;
      }

      // Find existing task (query by id since partition key is projectId)
      const query = {
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: id }]
      };
      const { resources } = await tasksContainer.items.query(query).fetchAll();
      if (!resources || resources.length === 0) {
        context.res = { status: 404, headers, body: JSON.stringify({ error: "Not found" }) };
        return;
      }

      const existing = resources[0];
      const updated = Object.assign({}, existing, body);
      updated.id = id;
      updated.updatedAt = new Date().toISOString();

      const { resource: result } = await tasksContainer
        .item(id, existing.projectId)
        .replace(updated);
      context.res = { status: 200, headers, body: JSON.stringify({ task: result }) };
      return;
    }

    // --- DELETE ---
    if (method === "DELETE") {
      if (!id) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: "Task ID required" }) };
        return;
      }

      // Find existing task to get its partition key
      const query = {
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: id }]
      };
      const { resources } = await tasksContainer.items.query(query).fetchAll();
      if (!resources || resources.length === 0) {
        context.res = { status: 404, headers, body: JSON.stringify({ error: "Not found" }) };
        return;
      }

      await tasksContainer.item(id, resources[0].projectId).delete();
      context.res = { status: 200, headers, body: JSON.stringify({ success: true }) };
      return;
    }

    context.res = { status: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    context.log.error("Tasks API error:", err.message);
    const status = err.code === 404 ? 404 : 500;
    context.res = { status, headers, body: JSON.stringify({ error: err.message }) };
  }
};
