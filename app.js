// ReceiptRadar - State Management & Logic

// State
let expenses = [];
let apiKey = "";
let chartInstance = null;
let currentChartType = "doughnut"; // 'doughnut' or 'bar'
let selectedFile = null;

// Category Configs with specific premium colors matching the glassmorphic dark theme
const categoryConfig = {
  "Groceries": { color: "rgba(16, 185, 129, 0.85)", border: "rgb(16, 185, 129)" }, // Emerald
  "Dining Out": { color: "rgba(245, 158, 11, 0.85)", border: "rgb(245, 158, 11)" }, // Amber
  "Utilities": { color: "rgba(6, 182, 212, 0.85)", border: "rgb(6, 182, 212)" }, // Cyan
  "Entertainment": { color: "rgba(217, 70, 239, 0.85)", border: "rgb(217, 70, 239)" }, // Fuchsia
  "Transport": { color: "rgba(59, 130, 246, 0.85)", border: "rgb(59, 130, 246)" }, // Blue
  "Shopping": { color: "rgba(244, 63, 94, 0.85)", border: "rgb(244, 63, 94)" }, // Rose
  "Other": { color: "rgba(100, 116, 139, 0.85)", border: "rgb(100, 116, 139)" } // Slate
};

// Initial Sample Data (used if localStorage is empty)
const sampleExpenses = [];

// Document Elements
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const filePreviewBar = document.getElementById("file-preview-bar");
const previewFilename = document.getElementById("preview-filename");
const cancelUploadBtn = document.getElementById("cancel-upload");
const globalLoader = document.getElementById("global-loader");
const expenseTableBody = document.getElementById("expense-log-table-body");
const tableEmptyState = document.getElementById("table-empty-state");
const chartEmptyState = document.getElementById("chart-empty-state");
const searchFilter = document.getElementById("search-filter");
const categoryFilter = document.getElementById("category-filter");
const clearAllDataBtn = document.getElementById("clear-all-data-btn");

// Stat Elements
const statTotalSpend = document.getElementById("stat-total-spend");
const statScans = document.getElementById("stat-scans");
const statTopCategory = document.getElementById("stat-top-category");
const statAvgSpend = document.getElementById("stat-avg-spend");

// Modal Elements
const openManualModalBtn = document.getElementById("open-add-manual-modal");
const closeManualModalBtn = document.getElementById("close-manual-modal");
const manualModal = document.getElementById("manual-add-modal");
const manualForm = document.getElementById("manual-add-form");

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  // Load API Key from .env first, fallback to localStorage
  await loadApiKey();

  // Load Expenses
  const storedExpenses = localStorage.getItem("rr_expenses");
  if (storedExpenses) {
    try {
      expenses = JSON.parse(storedExpenses);
    } catch (e) {
      console.error("Error parsing stored expenses", e);
      expenses = [];
    }
  } else {
    // Fresh launch, start with empty list
    expenses = [];
    saveExpenses();
  }

  // Setup Event Listeners
  setupEventListeners();

  // Initial Render
  updateDashboard();
});

// --- API Key Loading ---
async function loadApiKey() {
  try {
    const response = await fetch('.env');
    if (response.ok) {
      const text = await response.text();
      // Match GEMINI_API_KEY=xyz, API_KEY=xyz or VITE_GEMINI_API_KEY=xyz
      const match = text.match(/(?:GEMINI_API_KEY|API_KEY|VITE_GEMINI_API_KEY)\s*=\s*([^\r\n]*)/i);
      if (match && match[1]) {
        apiKey = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (apiKey) {
          console.log("Gemini API Key successfully loaded from .env");
          return;
        }
      }
    }
  } catch (e) {
    console.warn("Could not fetch .env file, checking localStorage next.", e);
  }

  // Fallback to localStorage
  apiKey = localStorage.getItem("rr_api_key") || "";
  if (apiKey) {
    console.log("Gemini API Key loaded from localStorage fallback");
  }
}

// --- Helper Functions ---

function saveExpenses() {
  localStorage.setItem("rr_expenses", JSON.stringify(expenses));
}

function showNotification(message, type = "success") {
  const banner = document.getElementById("notification-banner");
  const card = document.getElementById("notification-card");
  const iconDiv = document.getElementById("notification-icon");
  const msgDiv = document.getElementById("notification-message");

  // Reset border colors
  card.className = "bg-white/95 border text-[#13261f] px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 backdrop-blur-md";
  
  if (type === "success") {
    card.classList.add("border-emerald-600/30");
    iconDiv.innerHTML = `<svg class="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  } else if (type === "error") {
    card.classList.add("border-rose-600/30");
    iconDiv.innerHTML = `<svg class="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
  } else {
    card.classList.add("border-[#13261f]/20");
    iconDiv.innerHTML = `<svg class="h-5 w-5 text-[#13261f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  }

  msgDiv.textContent = message;
  
  // Slide down & fade in
  banner.classList.remove("translate-y-[-100px]", "opacity-0");
  banner.classList.add("translate-y-0", "opacity-100");

  setTimeout(() => {
    // Hide
    banner.classList.remove("translate-y-0", "opacity-100");
    banner.classList.add("translate-y-[-100px]", "opacity-0");
  }, 4000);
}

// --- UI / Event Bindings ---

function setupEventListeners() {
  // Dropzone Events
  dropzone.addEventListener("click", () => fileInput.click());
  
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-slate-800");
    dropzone.classList.add("border-purple-500", "bg-purple-950/20");
  });

  ["dragleave", "dragend"].forEach(type => {
    dropzone.addEventListener(type, () => {
      dropzone.classList.remove("border-purple-500", "bg-purple-950/20");
      dropzone.classList.add("border-slate-800");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-purple-500", "bg-purple-950/20");
    dropzone.classList.add("border-slate-800");

    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  cancelUploadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = "";
    filePreviewBar.classList.add("hidden");
    dropzone.classList.remove("hidden");
  });

  // Search and Filters
  searchFilter.addEventListener("input", renderExpensesTable);
  categoryFilter.addEventListener("change", renderExpensesTable);

  // Clear data
  clearAllDataBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all scanned and entered expenses?")) {
      expenses = [];
      saveExpenses();
      updateDashboard();
      showNotification("All expenses cleared.", "info");
    }
  });

  // Modal Handlers
  openManualModalBtn.addEventListener("click", () => {
    // Pre-populate current date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("manual-date").value = today;
    manualModal.classList.remove("hidden");
  });

  closeManualModalBtn.addEventListener("click", () => {
    manualModal.classList.add("hidden");
    manualForm.reset();
  });

  manualForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const vendor = document.getElementById("manual-vendor").value.trim();
    const amount = parseFloat(document.getElementById("manual-amount").value);
    const date = document.getElementById("manual-date").value;
    const category = document.getElementById("manual-category").value;

    if (!vendor || isNaN(amount) || !date || !category) {
      showNotification("Please fill in all manual fields.", "error");
      return;
    }

    const newExpense = {
      id: "manual-" + Date.now(),
      date,
      vendor,
      amount,
      category
    };

    expenses.unshift(newExpense);
    saveExpenses();
    updateDashboard();
    
    manualModal.classList.add("hidden");
    manualForm.reset();
    showNotification("Expense added manually!");
  });
}

// --- Ingestion ---

function handleFileSelection(file) {
  if (!file.type.startsWith("image/")) {
    showNotification("Only image files are supported.", "error");
    return;
  }

  selectedFile = file;
  previewFilename.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  filePreviewBar.classList.remove("hidden");
  
  // Proactively process with Gemini
  processReceiptWithGemini(file);
}

function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

async function processReceiptWithGemini(file) {
  if (!apiKey) {
    showNotification("Gemini API Key is missing. Please add it to your .env file (GEMINI_API_KEY=your_key) and reload.", "error");
    return;
  }

  // Show Loading Spinner
  globalLoader.classList.remove("hidden");

  try {
    const base64DataUrl = await getBase64(file);
    const base64Data = base64DataUrl.split(',')[1];
    const mimeType = file.type;

    // Build Payload following the exact instructions and Gemini schema conventions
    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Extract transaction date, merchant/vendor name, total transaction amount, and fit it into the most accurate category."
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            date: { 
              type: "STRING", 
              description: "ISO format YYYY-MM-DD. Fallback to current year 2026 if missing." 
            },
            vendor: { 
              type: "STRING", 
              description: "The name of the store or merchant." 
            },
            amount: { 
              type: "NUMBER", 
              description: "The total transaction amount as a float." 
            },
            category: { 
              type: "STRING", 
              enum: ["Groceries", "Dining Out", "Utilities", "Entertainment", "Transport", "Shopping", "Other"],
              description: "Categorize the receipt into the best matching option from this list."
            }
          },
          required: ["date", "vendor", "amount", "category"]
        }
      }
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || "HTTP Error connecting to Gemini API.");
    }

    const data = await response.json();
    
    // Parse the JSON text response from candidate block
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("Unable to read text response from Gemini API.");
    }

    const parsedResult = JSON.parse(candidateText.trim());
    
    // Validate required fields
    if (!parsedResult.date || !parsedResult.vendor || parsedResult.amount === undefined || !parsedResult.category) {
      throw new Error("API response did not contain all required receipt fields.");
    }

    // Success - add parsed object to state
    const newExpense = {
      id: "scan-" + Date.now(),
      date: parsedResult.date,
      vendor: parsedResult.vendor,
      amount: parseFloat(parsedResult.amount),
      category: parsedResult.category
    };

    expenses.unshift(newExpense);
    saveExpenses();
    updateDashboard();

    // Reset upload UI
    selectedFile = null;
    fileInput.value = "";
    filePreviewBar.classList.add("hidden");
    dropzone.classList.remove("hidden");

    showNotification("Receipt scanned and parsed successfully!");
  } catch (error) {
    console.error("Gemini API Error:", error);
    showNotification(`Failed to scan receipt: ${error.message}`, "error");
  } finally {
    globalLoader.classList.add("hidden");
  }
}

// --- Dashboard Orchestration ---

function updateDashboard() {
  renderKPIs();
  renderExpensesTable();
  renderCharts();
}

function renderKPIs() {
  if (expenses.length === 0) {
    statTotalSpend.textContent = "$0.00";
    statScans.textContent = "0";
    statTopCategory.textContent = "N/A";
    statAvgSpend.textContent = "$0.00";
    return;
  }

  // Total spent
  const total = expenses.reduce((acc, curr) => acc + curr.amount, 0);
  statTotalSpend.textContent = `$${total.toFixed(2)}`;

  // Scans count
  const scanCount = expenses.filter(e => e.id.toString().startsWith("scan-")).length;
  statScans.textContent = scanCount.toString();

  // Average Spend
  const avg = total / expenses.length;
  statAvgSpend.textContent = `$${avg.toFixed(2)}`;

  // Top Category
  const categoryTotals = {};
  expenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  let topCat = "N/A";
  let maxSpend = -1;
  Object.keys(categoryTotals).forEach(cat => {
    if (categoryTotals[cat] > maxSpend) {
      maxSpend = categoryTotals[cat];
      topCat = cat;
    }
  });
  statTopCategory.textContent = topCat;
}

// --- Dynamic Table Render & Interactivity ---

function renderExpensesTable() {
  const query = searchFilter.value.toLowerCase().trim();
  const selectedCat = categoryFilter.value;

  // Filter list
  const filtered = expenses.filter(e => {
    const matchesQuery = e.vendor.toLowerCase().includes(query);
    const matchesCat = (selectedCat === "All" || e.category === selectedCat);
    return matchesQuery && matchesCat;
  });

  // Toggle empty states
  if (filtered.length === 0) {
    expenseTableBody.innerHTML = "";
    tableEmptyState.classList.remove("hidden");
    return;
  }
  tableEmptyState.classList.add("hidden");

  // Construct table body
  expenseTableBody.innerHTML = "";
  
  filtered.forEach((expense) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-white/50 transition-colors border-b border-[#13261f]/10 relative group";

    // Date Cell (inline date picker input)
    const tdDate = document.createElement("td");
    tdDate.className = "px-4 py-3";
    tdDate.innerHTML = `
      <input 
        type="date" 
        value="${expense.date}" 
        class="bg-transparent text-[#13261f] w-full focus:outline-none focus:border-b focus:border-[#13261f]/30 p-0 border-0 focus:ring-0 text-xs font-mono"
      >
    `;
    tdDate.querySelector("input").addEventListener("change", (e) => {
      updateExpenseField(expense.id, "date", e.target.value);
    });

    // Vendor Cell (inline text input)
    const tdVendor = document.createElement("td");
    tdVendor.className = "px-4 py-3 font-semibold text-[#13261f]";
    tdVendor.innerHTML = `
      <input 
        type="text" 
        value="${escapeHtml(expense.vendor)}" 
        class="bg-transparent text-[#13261f] w-full focus:outline-none focus:border-b focus:border-[#13261f]/30 p-0 border-0 focus:ring-0 text-xs"
      >
    `;
    tdVendor.querySelector("input").addEventListener("change", (e) => {
      const val = e.target.value.trim();
      if (val) {
        updateExpenseField(expense.id, "vendor", val);
      } else {
        e.target.value = expense.vendor; // revert
      }
    });

    // Category Cell (select dropdown)
    const tdCat = document.createElement("td");
    tdCat.className = "px-4 py-3";
    
    // Select element populated dynamically with options
    const select = document.createElement("select");
    select.className = "bg-white/50 border border-slate-200 text-xs text-[#13261f] rounded px-1.5 py-0.5 focus:outline-none focus:border-[#13261f]/30 cursor-pointer";
    
    Object.keys(categoryConfig).forEach(catName => {
      const option = document.createElement("option");
      option.value = catName;
      option.textContent = catName;
      option.className = "bg-white text-[#13261f]";
      if (catName === expense.category) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    
    select.addEventListener("change", (e) => {
      updateExpenseField(expense.id, "category", e.target.value);
    });
    tdCat.appendChild(select);

    // Amount Cell (inline number input)
    const tdAmount = document.createElement("td");
    tdAmount.className = "px-4 py-3 text-right";
    tdAmount.innerHTML = `
      <div class="flex items-center justify-end gap-1">
        <span class="text-[#13261f]/60 text-xs">$</span>
        <input 
          type="number" 
          step="0.01" 
          value="${expense.amount.toFixed(2)}" 
          class="bg-transparent text-[#13261f] text-right focus:outline-none focus:border-b focus:border-[#13261f]/30 p-0 border-0 focus:ring-0 text-xs font-mono w-20"
        >
      </div>
    `;
    tdAmount.querySelector("input").addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val >= 0) {
        updateExpenseField(expense.id, "amount", val);
      } else {
        e.target.value = expense.amount.toFixed(2); // revert
      }
    });

    // Delete Action Cell
    const tdDelete = document.createElement("td");
    tdDelete.className = "px-4 py-3 text-center w-12";
    tdDelete.innerHTML = `
      <button class="text-slate-600 hover:text-rose-500 focus:outline-none transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 p-1">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    `;
    tdDelete.querySelector("button").addEventListener("click", () => {
      deleteExpense(expense.id);
    });

    tr.appendChild(tdDate);
    tr.appendChild(tdVendor);
    tr.appendChild(tdCat);
    tr.appendChild(tdAmount);
    tr.appendChild(tdDelete);

    expenseTableBody.appendChild(tr);
  });
}

function updateExpenseField(id, field, value) {
  const expIdx = expenses.findIndex(e => e.id === id);
  if (expIdx > -1) {
    expenses[expIdx][field] = value;
    saveExpenses();
    
    // Live update KPIs, visuals
    renderKPIs();
    renderCharts();
  }
}

function deleteExpense(id) {
  const index = expenses.findIndex(e => e.id === id);
  if (index > -1) {
    expenses.splice(index, 1);
    saveExpenses();
    updateDashboard();
    showNotification("Expense deleted.");
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Visualizations Panel ---

function changeChartType(type) {
  currentChartType = type;
  
  const dButton = document.getElementById("chart-type-doughnut");
  const bButton = document.getElementById("chart-type-bar");

  if (type === "doughnut") {
    dButton.className = "text-[10px] font-bold px-2.5 py-1 rounded bg-[#13261f] text-white transition-all focus:outline-none cursor-pointer";
    bButton.className = "text-[10px] font-bold px-2.5 py-1 rounded text-[#4c665a] hover:text-[#13261f] transition-all focus:outline-none cursor-pointer";
  } else {
    bButton.className = "text-[10px] font-bold px-2.5 py-1 rounded bg-[#13261f] text-white transition-all focus:outline-none cursor-pointer";
    dButton.className = "text-[10px] font-bold px-2.5 py-1 rounded text-[#4c665a] hover:text-[#13261f] transition-all focus:outline-none cursor-pointer";
  }

  renderCharts();
}

// Global hook for html onclicks
window.changeChartType = changeChartType;

function renderCharts() {
  // Aggregate expenses by category
  const aggregation = {};
  Object.keys(categoryConfig).forEach(cat => {
    aggregation[cat] = 0;
  });

  expenses.forEach(e => {
    if (aggregation[e.category] !== undefined) {
      aggregation[e.category] += e.amount;
    } else {
      aggregation["Other"] += e.amount;
    }
  });

  const categories = Object.keys(aggregation);
  const dataValues = categories.map(cat => aggregation[cat]);
  const totalSum = dataValues.reduce((a, b) => a + b, 0);

  // Manage UI state if data is fully empty
  if (totalSum === 0) {
    chartEmptyState.classList.remove("hidden");
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }
  chartEmptyState.classList.add("hidden");

  // Colors mapping
  const bgColors = categories.map(cat => categoryConfig[cat].color);
  const borderColors = categories.map(cat => categoryConfig[cat].border);

  // Destroy previous instances to avoid memory leaks or layout overlapping
  if (chartInstance) {
    chartInstance.destroy();
  }

  const ctx = document.getElementById("categoryChart").getContext("2d");

  // Custom Chart Config based on selected type
  const isDoughnut = currentChartType === "doughnut";
  
  const config = {
    type: currentChartType,
    data: {
      labels: categories,
      datasets: [{
        label: "Spend Amount ($)",
        data: dataValues,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        hoverOffset: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: isDoughnut ? "right" : "top",
          labels: {
            color: "rgba(19, 38, 31, 0.8)",
            font: {
              family: "Inter",
              size: 10
            },
            boxWidth: 10,
            padding: 10
          }
        },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          borderColor: "rgba(19, 38, 31, 0.2)",
          borderWidth: 1,
          titleColor: "#13261f",
          bodyColor: "#13261f",
          bodyFont: {
            family: "Inter",
            weight: "bold"
          },
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : 0;
              return ` $${val.toFixed(2)} (${pct}%)`;
            }
          }
        }
      },
      scales: isDoughnut ? {} : {
        x: {
          grid: {
            color: "rgba(19, 38, 31, 0.08)"
          },
          ticks: {
            color: "rgba(19, 38, 31, 0.7)",
            font: { size: 10 }
          }
        },
        y: {
          grid: {
            color: "rgba(19, 38, 31, 0.08)"
          },
          ticks: {
            color: "rgba(19, 38, 31, 0.7)",
            font: { size: 10 },
            callback: function(value) {
              return "$" + value;
            }
          }
        }
      }
    }
  };

  chartInstance = new Chart(ctx, config);
}
