document.addEventListener("DOMContentLoaded", () => {
    // --- Storyboard drag-and-drop ---
    let draggedButton = null;
    let dragOriginParent = null;
    let dragOriginNextSibling = null;

    function attachDragEvents(btn) {
        if (btn.dataset.dragReady === "true") return;
        btn.dataset.dragReady = "true";

        btn.addEventListener("dragstart", (e) => {
            draggedButton = btn;
            dragOriginParent = btn.parentElement;
            dragOriginNextSibling = btn.nextElementSibling;
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => btn.classList.add("dragging"), 0);
        });
        btn.addEventListener("dragend", () => {
            btn.classList.remove("dragging");
            draggedButton = null;
            dragOriginParent = null;
            dragOriginNextSibling = null;
        });
    }

    function restoreToOrigin(button) {
        if (!dragOriginParent) return;

        if (dragOriginNextSibling && dragOriginNextSibling.parentNode === dragOriginParent) {
            dragOriginParent.insertBefore(button, dragOriginNextSibling);
        } else {
            dragOriginParent.appendChild(button);
        }
    }

    function createButtonClone(sourceButton) {
        const clone = sourceButton.cloneNode(true);
        clone.classList.remove("dragging");
        clone.dataset.dragReady = "false";
        attachDragEvents(clone);
        return clone;
    }

    function attachDropZone(zone) {
        zone.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            zone.classList.add("drag-over");
        });
        zone.addEventListener("dragleave", (e) => {
            if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
        });
        zone.addEventListener("drop", (e) => {
            e.preventDefault();
            zone.classList.remove("drag-over");
            if (draggedButton && !zone.contains(draggedButton)) {
                if (zone.classList.contains("duplicate-zone")) {
                    const duplicateButton = createButtonClone(draggedButton);
                    zone.appendChild(duplicateButton);
                    restoreToOrigin(draggedButton);
                } else {
                    zone.appendChild(draggedButton);
                }
            }
        });
    }

    const clearDuplicateZoneButton = document.getElementById("clearDuplicateZone");
    const duplicateZone = document.querySelector("#storyboard .duplicate-zone");

    if (clearDuplicateZoneButton && duplicateZone) {
        clearDuplicateZoneButton.addEventListener("click", () => {
            duplicateZone.querySelectorAll("button").forEach((button) => button.remove());
        });
    }

    document.querySelectorAll("#storyboard button[draggable='true']").forEach(attachDragEvents);
    document.querySelectorAll("#storyboard .drop-zone").forEach(attachDropZone);

    updateBackendHealth();
    initializePromptAdmin();
    initializeEvalOutliner();
});

const API_ORIGIN = (window.location.port === "5500" || window.location.protocol === "file:")
    ? "http://localhost:3001"
    : "";

function apiUrl(path) {
    return `${API_ORIGIN}${path}`;
}

// Shared cache so prompt buttons and Prompt Admin stay in sync.
let promptAdminCache = {};
let promptAdminOriginalCache = {};
let promptAdminDraftCache = {};
const DEFAULT_EMAIL_RECIPIENT = "vidojam2@gmail.com";

function clonePromptMap(source) {
    return Object.fromEntries(
        Object.entries(source || {}).map(([key, value]) => [
            key,
            Array.isArray(value) ? [...value] : []
        ])
    );
}

function getEffectiveCategoryStatements(category) {
    if (Array.isArray(promptAdminDraftCache[category])) {
        return promptAdminDraftCache[category];
    }

    if (Array.isArray(promptAdminCache[category])) {
        return promptAdminCache[category];
    }

    return [];
}

async function updateBackendHealth() {
    const healthEl = document.getElementById("backendHealth");

    if (!healthEl) {
        return;
    }

    healthEl.textContent = "Backend: checking...";
    healthEl.classList.remove("ok", "error");
    healthEl.classList.add("checking");

    try {
        const response = await fetch(apiUrl("/api/health"));

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();

        if (payload && payload.ok) {
            healthEl.textContent = "Backend: connected";
            healthEl.classList.remove("checking", "error");
            healthEl.classList.add("ok");
            return;
        }

        throw new Error("Health check response was not ok");
    } catch (error) {
        healthEl.textContent = "Backend: disconnected";
        healthEl.classList.remove("checking", "ok");
        healthEl.classList.add("error");
    }
}

function initializePromptAdmin() {
    const categorySelect = document.getElementById("adminCategory");
    const statementsTextarea = document.getElementById("categoryStatements");
    const refreshButton = document.getElementById("refreshCategories");
    const loadButton = document.getElementById("loadCategory");
    const saveButton = document.getElementById("saveCategory");
    const addToOriginalButton = document.getElementById("addToOriginalCategory");
    const restoreButton = document.getElementById("restoreCategories");
    const statusEl = document.getElementById("adminStatus");

    if (!categorySelect || !statementsTextarea || !refreshButton || !loadButton || !saveButton || !addToOriginalButton || !restoreButton || !statusEl) {
        return;
    }

    function setStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.classList.toggle("error", isError);
    }

    function getSelectedCategory() {
        return String(categorySelect.value || "").toLowerCase();
    }

    function updateTextAreaFromSelectedCategory() {
        const category = getSelectedCategory();
        const statements = getEffectiveCategoryStatements(category);
        statementsTextarea.value = statements.join("\n");
    }

    function populateCategoryOptions() {
        const categories = Object.keys(promptAdminCache).sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = "";

        function getCategoryLabel(category) {
            if (category === "intro") return "introduction";
            return category;
        }

        categories.forEach((category) => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = getCategoryLabel(category);
            categorySelect.appendChild(option);
        });
    }

    async function fetchAllPrompts() {
        setStatus("Loading categories...");

        try {
            const response = await fetch(apiUrl("/api/prompts"));

            if (!response.ok) {
                throw new Error(`Failed with status ${response.status}`);
            }

            const payload = await response.json();
            promptAdminCache = payload && typeof payload === "object" ? payload : {};
            promptAdminOriginalCache = clonePromptMap(promptAdminCache);

            populateCategoryOptions();
            updateTextAreaFromSelectedCategory();
            setStatus("Categories loaded.");
        } catch (error) {
            setStatus("Could not load categories. Ensure the backend is running.", true);
        }
    }

    async function saveSelectedCategory() {
        const category = getSelectedCategory();

        if (!category) {
            setStatus("Select a category before saving.", true);
            return;
        }

        const statements = statementsTextarea.value
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        setStatus("Saving to database...");

        try {
            const response = await fetch(apiUrl(`/api/prompts/${encodeURIComponent(category)}`), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ statements })
            });

            if (!response.ok) {
                throw new Error(`Failed with status ${response.status}`);
            }

            promptAdminCache[category] = statements;
            promptAdminDraftCache[category] = [...statements];
            setStatus(`Saved ${statements.length} statement(s) for '${category}'.`);
        } catch (error) {
            setStatus("Save failed. Check backend and database connection.", true);
        }
    }

    function syncSelectedCategoryDraftToCache() {
        const category = getSelectedCategory();

        if (!category) {
            return;
        }

        const statements = statementsTextarea.value
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        promptAdminDraftCache[category] = statements;
        promptAdminCache[category] = statements;
    }

    function addDraftToOriginalCategoryTemporarily() {
        const category = getSelectedCategory();

        if (!category) {
            setStatus("Select a category before adding to original.", true);
            return;
        }

        const originalStatements = Array.isArray(promptAdminOriginalCache[category])
            ? promptAdminOriginalCache[category]
            : [];

        const addedStatements = statementsTextarea.value
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        const mergedStatements = [...originalStatements, ...addedStatements];

        promptAdminCache[category] = mergedStatements;
        promptAdminDraftCache[category] = [...mergedStatements];
        statementsTextarea.value = mergedStatements.join("\n");

        setStatus("Temporarily merged with original category. This resets on refresh/reload unless you Save.");
    }

    async function restoreAllCategories() {
        const shouldRestore = window.confirm("Restore all categories to the original seeded statements? This will overwrite current category data.");

        if (!shouldRestore) {
            return;
        }

        setStatus("Restoring original categories...");

        try {
            const response = await fetch(apiUrl("/api/prompts/restore"), {
                method: "POST"
            });

            if (!response.ok) {
                throw new Error(`Failed with status ${response.status}`);
            }

            await fetchAllPrompts();
            setStatus("All categories were restored to original. Unsaved local draft text is still available with Load.");
        } catch (error) {
            setStatus("Restore failed. Check backend and database connection.", true);
        }
    }

    refreshButton.addEventListener("click", fetchAllPrompts);
    loadButton.addEventListener("click", updateTextAreaFromSelectedCategory);
    saveButton.addEventListener("click", saveSelectedCategory);
    addToOriginalButton.addEventListener("click", addDraftToOriginalCategoryTemporarily);
    restoreButton.addEventListener("click", restoreAllCategories);
    statementsTextarea.addEventListener("input", syncSelectedCategoryDraftToCache);

    fetchAllPrompts();
}

let evalOutlineEnabled = false;

function appendToOutliner(category, statements) {
    const entries = document.getElementById("outlinerEntries");
    if (!entries) return;
    const block = document.createElement("div");
    block.className = "outliner-block";
    const heading = document.createElement("h4");
    heading.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    block.appendChild(heading);
    statements.forEach((stmt) => {
        const p = document.createElement("p");
        p.textContent = stmt;
        block.appendChild(p);
    });
    entries.appendChild(block);
}

function buildOutlinerLines() {
    const entries = document.getElementById("outlinerEntries");

    if (!entries) {
        return [];
    }

    const blocks = Array.from(entries.querySelectorAll(".outliner-block"));
    const lines = [];

    blocks.forEach((block) => {
        const heading = block.querySelector("h4")?.textContent?.trim();
        const statements = Array.from(block.querySelectorAll("p"))
            .map((p) => p.textContent?.trim() || "")
            .filter((text) => text.length > 0);

        if (heading) {
            lines.push(heading);
        }

        statements.forEach((statement) => {
            lines.push(`- ${statement}`);
        });

        lines.push("");
    });

    return lines;
}

function getOutlinerExportMeta() {
    const includeSpeakerNameEl = document.getElementById("includeSpeakerName");
    const speakerNameInputEl = document.getElementById("speakerNameInput");

    const includeSpeakerName = Boolean(includeSpeakerNameEl?.checked);
    const speakerName = String(speakerNameInputEl?.value || "").trim();

    return {
        includeSpeakerName,
        speakerName
    };
}

function buildOutlinerTitle() {
    const { includeSpeakerName, speakerName } = getOutlinerExportMeta();

    if (includeSpeakerName && speakerName) {
        return `Evaluation Outline - ${speakerName}`;
    }

    return "Evaluation Outline";
}

function buildOutlinerBody() {
    const lines = buildOutlinerLines();
    const { includeSpeakerName, speakerName } = getOutlinerExportMeta();
    const bodyLines = [];

    if (includeSpeakerName && speakerName) {
        bodyLines.push(`Speaker: ${speakerName}`);
        bodyLines.push("");
    }

    bodyLines.push(...lines);
    return bodyLines;
}

async function copyOutlinerToClipboard() {
    const bodyLines = buildOutlinerBody();

    if (!bodyLines.length) {
        alert("No outline content to copy yet.");
        return;
    }

    try {
        await navigator.clipboard.writeText(bodyLines.join("\n"));
        alert("Evaluation outliner copied to clipboard.");
    } catch (error) {
        alert("Unable to copy automatically. Your browser may block clipboard access.");
    }
}

async function copyOutlinerTextSilently(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_error) {
        return false;
    }
}

function printOutliner() {
    const bodyLines = buildOutlinerBody();
    const title = buildOutlinerTitle();

    if (!bodyLines.length) {
        alert("No outline content to print yet.");
        return;
    }

    const safeText = bodyLines.join("\n").replace(/[&<>]/g, (char) => {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char];
    });

    const printWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!printWindow) {
        alert("Unable to open print window. Please allow pop-ups for this site.");
        return;
    }

    const printableHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
    <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1e2a35; }
    h1 { margin: 0 0 8px; }
    .date { margin: 0 0 16px; color: #4b5a66; }
    pre { white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
    <h1>${title}</h1>
  <p class="date">Generated ${new Date().toLocaleString()}</p>
  <pre>${safeText}</pre>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function emailOutliner() {
    const bodyLines = buildOutlinerBody();
    const title = buildOutlinerTitle();

    if (!bodyLines.length) {
        alert("No outline content to email yet.");
        return;
    }

    const subject = `${title} - ${new Date().toLocaleDateString()}`;
    const body = bodyLines.join("\r\n");
    const mailtoUrl = `mailto:${encodeURIComponent(DEFAULT_EMAIL_RECIPIENT)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(DEFAULT_EMAIL_RECIPIENT)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    copyOutlinerTextSilently(body).finally(() => {
        const gmailWindow = window.open(gmailUrl, "_blank", "noopener,noreferrer");

        if (!gmailWindow) {
            window.location.href = mailtoUrl;
        }
    });
}

function initializeEvalOutliner() {
    const generateBtn = document.getElementById("generateOutlineBtn");
    const outlinerPanel = document.getElementById("eval-outliner");
    const clearBtn = document.getElementById("clearOutlinerBtn");
    const copyBtn = document.getElementById("copyOutlinerBtn");
    const printBtn = document.getElementById("printOutlinerBtn");
    const emailBtn = document.getElementById("emailOutlinerBtn");

    if (!generateBtn || !outlinerPanel || !clearBtn || !copyBtn || !printBtn || !emailBtn) return;

    generateBtn.addEventListener("click", () => {
        evalOutlineEnabled = true;
        outlinerPanel.hidden = false;
        generateBtn.textContent = "Outline Active";
        generateBtn.disabled = true;
    });

    clearBtn.addEventListener("click", () => {
        document.getElementById("outlinerEntries").innerHTML = "";
        evalOutlineEnabled = false;
        outlinerPanel.hidden = true;
        generateBtn.textContent = "Generate Evaluation Outline";
        generateBtn.disabled = false;
    });

    copyBtn.addEventListener("click", copyOutlinerToClipboard);
    printBtn.addEventListener("click", printOutliner);
    emailBtn.addEventListener("click", emailOutliner);
}

async function showPromptSequence(category) {
    try {
        const effectiveStatements = getEffectiveCategoryStatements(category);
        const localStatements = effectiveStatements.length ? effectiveStatements : null;

        if (localStatements) {
            if (!localStatements.length) {
                alert(`No prompts found for '${category}'.`);
                return;
            }

            if (evalOutlineEnabled) {
                appendToOutliner(category, localStatements);
            } else {
                localStatements.forEach((statement) => alert(statement));
            }

            return;
        }

        const response = await fetch(apiUrl(`/api/prompts/${encodeURIComponent(category)}`));

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const statements = Array.isArray(payload.statements) ? payload.statements : [];

        if (!statements.length) {
            alert(`No prompts found for '${category}'.`);
            return;
        }

        if (evalOutlineEnabled) {
            appendToOutliner(category, statements);
        } else {
            statements.forEach((statement) => alert(statement));
        }
    } catch (error) {
        alert("Unable to load prompt statements from the backend. Make sure the API server is running.");
    }
}

function showAlertOpening() {
    showPromptSequence("opening");
}

function showAlertIntro() {
    showPromptSequence("intro");
}

function showAlertBody() {
    showPromptSequence("body");
}

function showAlertStage() {
    showPromptSequence("stage");
}

function showAlertEye() {
    showPromptSequence("eye");
}

function showAlertGestures() {
    showPromptSequence("gestures");
}

function showAlertStories() {
    showPromptSequence("stories");
}

function showAlertProps() {
    showPromptSequence("props");
}

function showAlertVocalVariety() {
    showPromptSequence("vocalvariety");
}

function showAlertVolume() {
    showPromptSequence("volume");
}

function showAlertPitch() {
    showPromptSequence("pitch");
}

function showAlertEmphasis() {
    showPromptSequence("emphasis");
}

function showAlertPause() {
    showPromptSequence("pause");
}

function showAlertPace() {
    showPromptSequence("pace");
}

function showAlertEmotion() {
    showPromptSequence("emotion");
}

function showAlertClose() {
    showPromptSequence("close");
}

function showAlertSuggestion() {
    showPromptSequence("suggestion");
}

function showAlertSummary() {
    showPromptSequence("summary");
}

window.showAlertOpening = showAlertOpening;
window.showAlertIntro = showAlertIntro;
window.showAlertBody = showAlertBody;
window.showAlertStage = showAlertStage;
window.showAlertEye = showAlertEye;
window.showAlertGestures = showAlertGestures;
window.showAlertStories = showAlertStories;
window.showAlertProps = showAlertProps;
window.showAlertVocalVariety = showAlertVocalVariety;
window.showAlertVolume = showAlertVolume;
window.showAlertPitch = showAlertPitch;
window.showAlertEmphasis = showAlertEmphasis;
window.showAlertPause = showAlertPause;
window.showAlertPace = showAlertPace;
window.showAlertEmotion = showAlertEmotion;
window.showAlertClose = showAlertClose;
window.showAlertSuggestion = showAlertSuggestion;
window.showAlertSummary = showAlertSummary;