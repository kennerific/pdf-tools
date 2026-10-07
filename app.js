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
  ranges.replaceChildren();
  addRow();
  drop.hidden = true;
  editor.hidden = false;
  setStatus("");
}

function addRow() {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelectorAll("input[type=number]").forEach((input) => (input.max = source.getPageCount()));
  ranges.append(row);
  row.querySelector("[name=from]").focus();
  validate();
}

function readRows() {
  const pageCount = source.getPageCount();
  return [...ranges.children].map((row) => {
    const fromInput = row.querySelector("[name=from]");
    const toInput = row.querySelector("[name=to]");
    const from = Number(fromInput.value);
    const to = Number(toInput.value);
    const fromValid = Number.isInteger(from) && from >= 1 && from <= pageCount;
    const toValid = Number.isInteger(to) && to >= 1 && to <= pageCount && (!fromValid || to >= from);
    return {
      label: row.querySelector("[name=label]").value.trim(),
      from,
      to,
      fromInput,
      toInput,
      fromValid,
      toValid,
    };
  });
}

function validate() {
  const rows = readRows();
  for (const row of rows) {
    row.fromInput.setAttribute("aria-invalid", String(row.fromInput.value !== "" && !row.fromValid));
    row.toInput.setAttribute("aria-invalid", String(row.toInput.value !== "" && !row.toValid));
  }
  cutButton.disabled = rows.length === 0 || !rows.every((row) => row.fromValid && row.toValid);
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
  const rows = readRows();
  const files = {};
  const taken = new Set();
  cutButton.disabled = true;

  try {
    for (const [i, row] of rows.entries()) {
      setStatus(`Cutting ${i + 1} of ${rows.length}…`);
      files[uniqueName(fileNameFor(row), taken)] = await extract(row.from, row.to);
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

$("add").addEventListener("click", addRow);
$("change").addEventListener("click", reset);
cutButton.addEventListener("click", cut);
