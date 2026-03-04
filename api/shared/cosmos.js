/* ===== Cosmos DB Connection — Shared Module ===== */

const { CosmosClient } = require("@azure/cosmos");

// Connection string comes from Azure Static Web App Application Settings
const connectionString = process.env.COSMOS_CONNECTION_STRING;

if (!connectionString) {
  console.error("COSMOS_CONNECTION_STRING environment variable is not set.");
}

const client = connectionString ? new CosmosClient(connectionString) : null;
const database = client ? client.database("bellamare-tracker") : null;
const projectsContainer = database ? database.container("projects") : null;
const tasksContainer = database ? database.container("tasks") : null;

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

module.exports = {
  client,
  database,
  projectsContainer,
  tasksContainer,
  corsHeaders
};
