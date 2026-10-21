const fs = require("fs");
const path = require("path");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express = require("express");
const { z } = require("zod");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
app.use(express.static(path.join(__dirname, "..")));

const tasksFile = path.join(__dirname, "tasks.json");

let tasks = [];

try {
  if (fs.existsSync(tasksFile)) {
    tasks = JSON.parse(fs.readFileSync(tasksFile, "utf8"));
  }
} catch (error) {
  console.error("Could not load saved tasks:", error);
}

function saveTasks() {
  console.log("Saving tasks to:", tasksFile);
  console.log("Tasks count:", tasks.length);
  fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
  console.log("Tasks saved successfully");
}

function addTask(title) {
  const cleanTitle = title.trim();

  if (!cleanTitle) {
    throw new Error("Task title is required");
  }

  const task = {
    id: tasks.length
      ? Math.max(...tasks.map((t) => t.id)) + 1
      : 1,
    title: cleanTitle,
    completed: false,
  };

  tasks.push(task);
  return task;
}

// API: Get all tasks
app.get("/api/tasks", (req, res) => {
  res.json(
    tasks.map((task) => ({
      id: task.id,
      text: task.title,
      done: task.completed,
    }))
  );
});

// API: Add a task
app.post("/api/tasks", (req, res) => {
  const text = req.body?.text;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      error: "Task title is required",
    });
  }

  try {
    const task = addTask(text);
    saveTasks();

    res.status(201).json({
      id: task.id,
      text: task.title,
      done: task.completed,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

 // API: Update task completion
app.patch("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (typeof req.body?.done !== "boolean") {
    return res.status(400).json({ error: "done must be true or false" });
  }

  task.completed = req.body.done;
  saveTasks();

  res.json({
    id: task.id,
    text: task.title,
    done: task.completed,
  });
});

// API: Delete task
app.delete("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Task not found" });
  }

  tasks.splice(index, 1);
  saveTasks();
  res.status(204).end();
});

// Create MCP server and tools
function createServer() {
  const server = new McpServer({
    name: "study-buddy",
    version: "1.0.0",
  });

  // MCP tool: Add task
  server.tool(
    "add_task",
    "Add a study task to the Study Buddy task list",
    {
      title: z.string().min(1).describe("The study task title"),
    },
    async ({ title }) => {
      try {
        const task = addTask(title);

        return {
          content: [
            {
              type: "text",
              text: `Task added: ${task.title}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: error.message,
            },
          ],
        };
      }
    }
  );

  // MCP tool: List tasks
  server.tool(
    "list_tasks",
    "List all study tasks",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(tasks, null, 2),
        },
      ],
    })
  );

  return server;
}

// MCP endpoint
app.post("/mcp", async (req, res) => {
  const server = createServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal MCP server error",
      });
    }
  }
});

// Health check
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Study Buddy running at http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

