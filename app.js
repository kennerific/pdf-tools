import { PDFDocument } from "./vendor/pdf-lib.js";
import { zipSync } from "./vendor/fflate.js";

const LARGE_FILE_BYTES = 200 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const drop = $("drop");
const fileInput = $("file");
const editor = $("editor");
const ranges = $("ranges");
const cutButton = $("cut");
const status = $("status");
const rowTemplate = $("row");
const offsetInput = $("offset");

let source = null;
let baseName = "";

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

async function loadFile(file) {
  setStatus(file.size > LARGE_FILE_BYTES ? "Large file. This may take a moment." : "Loading…");

  let doc;
  try {
    doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    setStatus("Could not read this PDF.", true);
    return;
  }
  if (doc.isEncrypted) {
    setStatus("Password-protected PDFs are not supported.", true);
    return;
  }
  source = doc;

  baseName = file.name.replace(/\.pdf$/i, "");
  $("file-name").textContent = file.name;
  $("file-pages").textContent = `${source.getPageCount()} pages`;
  offsetInput.value = 0;
  ranges.replaceChildren();
  addRow();
  drop.hidden = true;
  editor.hidden = false;
  setStatus("");
}

function addRow() {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  ranges.append(row);
  row.querySelector("[name=from]").focus();
  validate();
}

function readOffset() {
  const offset = Number(offsetInput.value);
  return Number.isInteger(offset) && offset >= 0 && offset < source.getPageCount() ? offset : null;
}

function readRows(offset) {
  const lastPage = source.getPageCount() - offset;
  return [...ranges.children].map((row) => {
    const fromInput = row.querySelector("[name=from]");
    const toInput = row.querySelector("[name=to]");
    const from = Number(fromInput.value);
    const to = Number(toInput.value);
    const fromValid = Number.isInteger(from) && from >= 1 && from <= lastPage;
    const toValid = Number.isInteger(to) && to >= 1 && to <= lastPage && (!fromValid || to >= from);
    return {
      label: row.querySelector("[name=label]").value.trim(),
      from,
      to,
      fromInput,
      toInput,
      fromValid,
      toValid,
      resolved: row.querySelector(".resolved"),
    };
  });
}

function validate() {
  const offset = readOffset();
  offsetInput.setAttribute("aria-invalid", String(offset === null));
  const rows = readRows(offset ?? 0);
  for (const row of rows) {
    row.fromInput.setAttribute("aria-invalid", String(row.fromInput.value !== "" && !row.fromValid));
    row.toInput.setAttribute("aria-invalid", String(row.toInput.value !== "" && !row.toValid));
    const showResolved = offset > 0 && row.fromValid && row.toValid;
    row.resolved.textContent = showResolved ? `→ ${row.from + offset}–${row.to + offset}` : "";
  }
  cutButton.disabled = offset === null || rows.length === 0 || !rows.every((row) => row.fromValid && row.toValid);
}

function fileNameFor(row) {
  const name = row.label || `${baseName}_p${row.from}-${row.to}`;
  return name.replace(/[\\/:*?"<>|]/g, "-");
}

function uniqueName(name, taken) {
  let candidate = `${name}.pdf`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name} (${n}).pdf`;
  taken.add(candidate);
  return candidate;
}

async function extract(from, to) {
  const output = await PDFDocument.create();
  const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));
  return output.save();
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function cut() {
  const offset = readOffset();
  const rows = readRows(offset);
  const files = {};
  const taken = new Set();
  cutButton.disabled = true;

  try {
    for (const [i, row] of rows.entries()) {
      setStatus(`Cutting ${i + 1} of ${rows.length}…`);
      files[uniqueName(fileNameFor(row), taken)] = await extract(row.from + offset, row.to + offset);
    }
    download(zipSync(files, { level: 0 }), `${baseName}_cuts.zip`);
    setStatus(`Done. ${rows.length} ${rows.length === 1 ? "file" : "files"} saved.`);
  } catch (error) {
    console.error(error);
    setStatus("Something went wrong while cutting.", true);
  } finally {
    validate();
  }
}

function reset() {
  source = null;
  fileInput.value = "";
  editor.hidden = true;
  drop.hidden = false;
  setStatus("");
}

fileInput.addEventListener("change", () => fileInput.files[0] && loadFile(fileInput.files[0]));

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("over");
});
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) drop.classList.remove("over");
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  const file = event.dataTransfer.files[0];
  if (file) loadFile(file);
});

ranges.addEventListener("input", validate);
ranges.addEventListener("click", (event) => {
  if (!event.target.matches(".remove")) return;
  event.target.closest("li").remove();
  validate();
});

offsetInput.addEventListener("input", validate);
$("add").addEventListener("click", addRow);
$("change").addEventListener("click", reset);
cutButton.addEventListener("click", cut);
