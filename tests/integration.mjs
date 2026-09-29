import assert from "node:assert/strict";
const origin = "http://127.0.0.1:5173";
const prefix = `qa-${Date.now()}`;
async function call(path, method = "GET", data, expected = 200) {
  const response = await fetch(`http://127.0.0.1:8787/api${path}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const project = {
  id: `${prefix}-project`,
  kind: "project",
  title: "QA project",
  description: "Temporary integration test",
  color: "#a78bfa",
  columns: ["Backlog", "Doing", "Done"],
};
const task = {
  id: `${prefix}-task`,
  kind: "task",
  title: "QA recurring task",
  description: "",
  projectId: project.id,
  status: "Backlog",
  priority: "high",
  due: "2026-09-16",
  tags: "qa",
  checklist: [{ id: "step1", text: "Verify", done: true }],
  repeat: "weekly",
};
const note = {
  id: `${prefix}-note`,
  kind: "note",
  title: "QA note",
  body: "Persisted text",
  projectId: project.id,
};
const event = {
  id: `${prefix}-event`,
  kind: "event",
  title: "QA event",
  date: "2026-09-16",
  time: "10:00",
  endTime: "11:00",
  description: "Test",
};
let successor;
try {
  const status = await call("/status");
  assert.equal(status.mailEnabled, false);
  assert.deepEqual(status.mailAddresses, {
    inbox: "contact@example.com",
    noReply: "no-reply@example.com",
  });
  for (const item of [project, task, note, event])
    await call(`/records/${item.id}`, "PUT", item);
  const records = await call("/records");
  for (const item of [project, task, note, event])
    assert.deepEqual(
      records.find((r) => r.id === item.id),
      item,
    );
  await call(`/records/${project.id}`, "DELETE", undefined, 409);
  await call(
    `/records/${project.id}`,
    "PUT",
    { ...project, columns: ["New", "Done"] },
    400,
  );
  const done = await call(`/tasks/${task.id}/complete`, "POST", {
    complete: true,
    today: "2026-09-16",
  });
  assert.equal(done[0].status, "Done");
  assert.equal(done[1].due, "2026-09-23");
  assert.equal(done[1].checklist[0].done, false);
  successor = done[1].id;
  await call(`/tasks/${task.id}/complete`, "POST", {
    complete: true,
    today: "2026-09-16",
  });
  await call(`/tasks/${task.id}/complete`, "POST", {
    complete: false,
    today: "2026-09-16",
  });
  await call(`/tasks/${task.id}/complete`, "POST", {
    complete: true,
    today: "2026-09-16",
  });
  assert.equal(
    (await call("/records")).filter(
      (r) => r.kind === "task" && r.projectId === project.id,
    ).length,
    2,
  );
  await call(
    `/records/${event.id}`,
    "PUT",
    { ...event, endTime: "09:00" },
    400,
  );
  const draft = {
    id: `${prefix}-mail`,
    sender: "contact@example.com",
    recipient: "test@example.com",
    subject: "QA draft",
    body: "No real delivery",
  };
  await call(`/mail/${draft.id}`, "PUT", draft);
  assert.equal(
    (await call("/mail")).find((m) => m.id === draft.id).body,
    draft.body,
  );
  const form = new FormData();
  form.set(
    "file",
    new Blob(["test attachment"], { type: "text/plain" }),
    "qa.txt",
  );
  const attachmentResponse = await fetch(
    `http://127.0.0.1:8787/api/mail/${draft.id}/attachments`,
    { method: "POST", headers: { Origin: origin }, body: form },
  );
  assert.equal(attachmentResponse.status, 200);
  const attachments = await attachmentResponse.json();
  const download = await fetch(
    `http://127.0.0.1:8787/api/mail/${draft.id}/attachments/${attachments[0].id}`,
  );
  assert.equal(await download.text(), "test attachment");
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  await call(`/mail/${draft.id}/send`, "POST", {}, 409);
  await call(`/mail/${draft.id}`, "PATCH", { folder: "trash" });
  const denied = await fetch(`http://127.0.0.1:8787/api/records/${task.id}`, {
    method: "DELETE",
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(denied.status, 403);
  console.log(
    "PASS: CRUD persistence, project constraints, recurring-task idempotence, event validation, mail drafts, private attachments, local send blocking, and CSRF rejection.",
  );
  console.log(`Temporary mail in local trash: ${draft.id}`);
} finally {
  for (const id of [task.id, successor, note.id, event.id, project.id].filter(
    Boolean,
  ))
    await call(`/records/${id}`, "DELETE");
}
