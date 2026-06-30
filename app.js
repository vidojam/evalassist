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
    const statusEl = document.getElementById("adminStatus");

    if (!categorySelect || !statementsTextarea || !refreshButton || !loadButton || !saveButton || !statusEl) {
        return;
    }

    let promptsCache = {};

    function setStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.classList.toggle("error", isError);
    }

    function getSelectedCategory() {
        return String(categorySelect.value || "").toLowerCase();
    }

    function updateTextAreaFromSelectedCategory() {
        const category = getSelectedCategory();
        const statements = Array.isArray(promptsCache[category]) ? promptsCache[category] : [];
        statementsTextarea.value = statements.join("\n");
    }

    function populateCategoryOptions() {
        const categories = Object.keys(promptsCache).sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = "";

        categories.forEach((category) => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
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
            promptsCache = payload && typeof payload === "object" ? payload : {};

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

            promptsCache[category] = statements;
            setStatus(`Saved ${statements.length} statement(s) for '${category}'.`);
        } catch (error) {
            setStatus("Save failed. Check backend and database connection.", true);
        }
    }

    refreshButton.addEventListener("click", fetchAllPrompts);
    loadButton.addEventListener("click", updateTextAreaFromSelectedCategory);
    saveButton.addEventListener("click", saveSelectedCategory);

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

function initializeEvalOutliner() {
    const generateBtn = document.getElementById("generateOutlineBtn");
    const outlinerPanel = document.getElementById("eval-outliner");
    const clearBtn = document.getElementById("clearOutlinerBtn");

    if (!generateBtn || !outlinerPanel || !clearBtn) return;

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
}

async function showPromptSequence(category) {
    try {
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