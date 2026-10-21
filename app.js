
let tasks = [];

const API_URL = "http://localhost:3000/api/tasks";

const taskList = document.getElementById("taskList");
const taskInput = document.getElementById("taskInput");
const chatInput = document.getElementById("chatInput");
const chatWindow = document.getElementById("chatWindow");

async function apiRequest(path = "", options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadTasks() {
  try {
    tasks = await apiRequest();
    renderTasks();
  } catch (error) {
    console.error("Could not load tasks:", error);
    taskList.innerHTML =
      '<div class="empty">Could not connect to the server. Make sure Study Buddy is running.</div>';
  }
}

function renderTasks() {
  taskList.innerHTML = "";

  if (!tasks.length) {
    taskList.innerHTML =
      '<div class="empty">No tasks yet. Add one above or ask Study Buddy.</div>';
  }

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task-item";

    const check = document.createElement("button");
    check.className = "task-check" + (task.done ? " checked" : "");
    check.textContent = task.done ? "✓" : "";
    check.setAttribute(
      "aria-label",
      task.done ? "Mark task incomplete" : "Mark task complete"
    );

    check.onclick = async () => {
      try {
        const updated = await apiRequest(`/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: !task.done }),
        });

        tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
        renderTasks();
      } catch (error) {
        console.error(error);
        alert("Could not update task. Check that the server is running.");
      }
    };

    const text = document.createElement("div");
    text.className = "task-text" + (task.done ? " done" : "");
    text.textContent = task.text;

    const tag = document.createElement("span");
    tag.className = "task-tag";
    tag.textContent = task.done ? "Done" : "To do";

    const del = document.createElement("button");
    del.className = "delete-task";
    del.textContent = "×";
    del.setAttribute("aria-label", "Delete task");

    del.onclick = async () => {
      try {
        await apiRequest(`/${task.id}`, { method: "DELETE" });
        tasks = tasks.filter((t) => t.id !== task.id);
        renderTasks();
      } catch (error) {
        console.error(error);
        alert("Could not delete task. Check that the server is running.");
      }
    };

    row.append(check, text, tag, del);
    taskList.appendChild(row);
  });

  const done = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  document.getElementById("totalCount").textContent = total;
  document.getElementById("doneCount").textContent = done;
  document.getElementById("progressLabel").textContent = percent + "%";
  document.getElementById("progressBar").style.width = percent + "%";
}

async function addTask(text) {
  const clean = text.trim().replace(/^["']|["']$/g, "").slice(0, 100);
  if (!clean) return false;

  try {
    const task = await apiRequest("", {
      method: "POST",
      body: JSON.stringify({ text: clean }),
    });

    tasks.unshift(task);
    renderTasks();
    return true;
  } catch (error) {
    console.error("Could not add task:", error);
    say("Study Buddy", "I couldn't save that task. Check that the server is running.");
    return false;
  }
}

function say(who, message) {
  const item = document.createElement("div");
  item.className =
    "chat-message " +
    (who === "You" ? "user-message" : "assistant-message");

  const avatar = document.createElement("span");
  avatar.className = "chat-avatar";
  avatar.textContent = who === "You" ? "You" : "✦";

  const content = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = who;

  const p = document.createElement("p");
  p.style.whiteSpace = "pre-line";
  p.textContent = message;

  content.append(name, p);
  item.append(avatar, content);
  chatWindow.appendChild(item);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function respond(raw) {
  const input = raw.trim();
  if (!input) return;

  say("You", input);
  const lower = input.toLowerCase();
  let response;

  if (lower.startsWith("add ") || lower.startsWith("remind me to ")) {
    const task = lower.startsWith("add ")
      ? input.slice(4)
      : input.slice("remind me to ".length);

    const added = await addTask(task);

    response = added
      ? "Done — I added your task to the list."
      : "Tell me the task you want to add.";
  } else if (
    lower.includes("show") &&
    (lower.includes("task") || lower.includes("list"))
  ) {
    response = tasks.length
      ? "Here are your tasks:\n" +
        tasks
          .map(
            (task, index) =>
              `${index + 1}. ${task.done ? "✓" : "○"} ${task.text}`
          )
          .join("\n")
      : 'Your task list is empty. Try saying "add revise chemistry".';
  } else if (
    lower.includes("focus") ||
    lower.includes("study plan") ||
    lower.includes("plan my day")
  ) {
    const pending = tasks.filter((task) => !task.done);

    response = pending.length
      ? `Let's keep it manageable. Start with "${pending[0].text}" for 20 minutes, take a 5-minute break, then move to the next task. You have ${pending.length} task${pending.length === 1 ? "" : "s"} left.`
      : "You've completed everything on your list. Add one small task if you want to keep going, or take a well-earned break.";
  } else if (
    lower.includes("complete") ||
    lower.includes("finished") ||
    lower.includes("done")
  ) {
    const pending = tasks.find((task) => !task.done);

    if (pending) {
      try {
        const updated = await apiRequest(`/${pending.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: true }),
        });

        tasks = tasks.map((task) =>
          task.id === updated.id ? updated : task
        );
        renderTasks();
        response = `Nice work! I marked "${updated.text}" as complete. One step at a time.`;
      } catch (error) {
        console.error(error);
        response = "I couldn't update that task. Please check the server.";
      }
    } else {
      response = "There are no pending tasks right now. Great job!";
    }
  } else if (lower.includes("hello") || lower.includes("hi ")) {
    response =
      'Hello! I can help organise your study tasks. Try "add revise chemistry" or "help me focus".';
  } else {
    response =
      'I can help with a few study actions in this prototype. Try:\n• "add practise Python"\n• "show my tasks"\n• "help me focus"\n• "mark one task complete"';
  }

  window.setTimeout(() => say("Study Buddy", response), 180);
}

document.getElementById("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (await addTask(taskInput.value)) {
    taskInput.value = "";
  }
});

document.getElementById("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  respond(chatInput.value);
  chatInput.value = "";
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => respond(button.dataset.prompt));
});

document.getElementById("focusBtn").addEventListener("click", () => {
  respond("Help me focus");
});

document.getElementById("showAll").addEventListener("click", () => {
  taskInput.focus();
  document.getElementById("pageTitle").textContent =
    "Your tasks, all in one place.";
});

document.getElementById("navTasks").addEventListener("click", () => {
  taskInput.focus();
  document.getElementById("pageTitle").textContent =
    "Your tasks, all in one place.";
  document.getElementById("navTasks").classList.add("active");
  document.getElementById("navToday").classList.remove("active");
});

document.getElementById("navToday").addEventListener("click", () => {
  document.getElementById("pageTitle").textContent =
    "Good day. Ready to focus?";
  document.getElementById("navToday").classList.add("active");
  document.getElementById("navTasks").classList.remove("active");
});

loadTasks();
