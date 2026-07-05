// ReceiptRadar — Local JWT Authentication & SQLite REST API Orchestrator

// --- 1. Authentication State Management ---
let token = localStorage.getItem('auth_token') || null;
let currentUser = null;

// Parse client-side base64 JWT payload to check expiry & extract user metadata
function parseJwt(t) {
  try {
    const base64Url = t.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// ── Authentication Protection Route Guard ──
function checkAuth() {
  const isLoginPage = window.location.pathname.includes("login.html");

  if (token) {
    const payload = parseJwt(token);
    
    if (payload && payload.exp * 1000 > Date.now()) {
      currentUser = payload;
      
      if (isLoginPage) {
        window.location.href = "index.html";
        return;
      }

      const navUserText = document.getElementById("nav-user-name");
      if (navUserText) {
        navUserText.textContent = currentUser.name;
      }

      fetchCategories().then(fetchTransactions);
    } else {
      handleLogoutSilently();
    }
  } else {
    currentUser = null;
    if (!isLoginPage) {
      window.location.href = "login.html";
    }
  }
}

function handleLogoutSilently() {
  localStorage.removeItem('auth_token');
  token = null;
  currentUser = null;
  const isLoginPage = window.location.pathname.includes("login.html");
  if (!isLoginPage) {
    window.location.href = "login.html";
  }
}

// ── Auth Actions (Exposed to buttons / forms) ──
async function handleSignUp(name, email, password) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Sign-up failed.');
  }

  // Cache token locally and redirect to dashboard
  localStorage.setItem('auth_token', data.token);
  token = data.token;
  currentUser = data.user;
  window.location.href = "index.html";
}

async function handleSignIn(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Login failed.');
  }

  // Cache token locally and redirect to dashboard
  localStorage.setItem('auth_token', data.token);
  token = data.token;
  currentUser = data.user;
  window.location.href = "index.html";
}

function handleLogout() {
  localStorage.removeItem('auth_token');
  token = null;
  currentUser = null;
  window.location.href = "login.html";
}

// Bind to window for HTML event attributes
window.handleSignUp = handleSignUp;
window.handleSignIn = handleSignIn;
window.handleLogout = handleLogout;


// --- 2. State & Configurations ---
let transactions = []; // Main array syncing transaction list
let chartInstance = null;
let monthlyChartInstance = null;
let currentChartType = "doughnut"; // 'doughnut' or 'bar'
let selectedFile = null;

const globalLoader = document.getElementById("global-loader");
const expenseTableBody = document.getElementById("expense-log-table-body");
const tableEmptyState = document.getElementById("table-empty-state");
const chartEmptyState = document.getElementById("chart-empty-state");
const searchFilter = document.getElementById("search-filter");
const categoryFilter = document.getElementById("category-filter");
const statTopCategory = document.getElementById("stat-top-category");

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const filePreviewBar = document.getElementById("file-preview-bar");
const previewFilename = document.getElementById("preview-filename");
const cancelUploadBtn = document.getElementById("cancel-upload");

let VALID_CATEGORIES = [];
let categoryConfig = {};

const categoryColors = {
  "Food & Dining": "rgba(16, 185, 129, 0.85)|rgb(16, 185, 129)",
  "Entertainment": "rgba(217, 70, 239, 0.85)|rgb(217, 70, 239)",
  "Travel": "rgba(59, 130, 246, 0.85)|rgb(59, 130, 246)",
  "Shopping": "rgba(244, 63, 94, 0.85)|rgb(244, 63, 94)",
  "Investment": "rgba(245, 158, 11, 0.85)|rgb(245, 158, 11)",
  "Salary / Wages": "rgba(6, 182, 212, 0.85)|rgb(6, 182, 212)",
  "Other": "rgba(100, 116, 139, 0.85)|rgb(100, 116, 139)"
};

async function fetchCategories() {
  const response = await fetch('/api/categories', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch categories');
  const categories = await response.json();
  VALID_CATEGORIES = categories.map(c => c.name);
  categoryConfig = {};
  categories.forEach(c => {
    const [color, border] = categoryColors[c.name]?.split('|') || ["rgba(100, 116, 139, 0.85)", "rgb(100, 116, 139)"];
    categoryConfig[c.name] = { color, border };
  });
  populateCategoryDropdowns(categories);
  renderExpensesTable();
}

function populateCategoryDropdowns(categories) {
  const income = categories.filter(c => c.type === 'income');
  const expense = categories.filter(c => c.type === 'expense');

  const populate = (selectId, categories) => {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name === 'All Categories' ? 'All' : c.name;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  };

  populate('category-filter', [{ name: 'All Categories', type: null }, ...categories]);
  populate('manual-category', categories);
  populate('review-category', categories);
}
const clearAllDataBtn = document.getElementById("clear-all-data-btn");

// Stat Elements
const statTotalIncome = document.getElementById("stat-total-income");
const statTotalExpense = document.getElementById("stat-total-expense");
const statNetBalance = document.getElementById("stat-net-balance");
const statScans = document.getElementById("stat-scans");
const statAvgExpense = document.getElementById("stat-avg-expense");

// Manual Add Modal Elements
const openManualModalBtn = document.getElementById("open-add-manual-modal");
const closeManualModalBtn = document.getElementById("close-manual-modal");
const manualModal = document.getElementById("manual-add-modal");
const manualForm = document.getElementById("manual-add-form");


// --- 4. Database operations via JWT Bearer protected API ---

async function fetchTransactions() {
  if (!token) return;
  try {
    const response = await fetch('/api/transactions', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        handleLogoutSilently();
        return;
      }
      throw new Error('Could not sync transaction logs.');
    }

    const data = await response.json();
    transactions = data.map(t => ({
      ...t,
      date: t.date || t.transaction_date,
      vendor: t.vendor || t.description
    }));
    updateDashboard();
  } catch (error) {
    console.error(error);
    showNotification('Error syncing logs with database.', 'error');
  }
}

async function addTransaction({ category, amount, vendor, date, metadata = null }) {
  const response = await fetch('/api/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      category,
      amount,
      description: vendor, // maps vendor name into the description column
      transaction_date: date,
      metadata
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to add transaction.');
  }

  // Refresh reactive dashboard values
  await fetchTransactions();
}

async function updateTransactionField(docId, field, value) {
  const body = {};
  if (field === "date") {
    body.transaction_date = value;
  } else if (field === "vendor") {
    body.description = value;
  } else if (field === "amount") {
    body.amount = parseFloat(value);
  } else {
    body[field] = value;
  }

  try {
    const response = await fetch(`/api/transactions/${docId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update transaction.');
    }

    await fetchTransactions();
    showNotification("Transaction updated successfully!");
  } catch (error) {
    console.error("Error updating transaction:", error);
    showNotification("Failed to update transaction.", "error");
  }
}

async function deleteTransaction(docId) {
  try {
    const response = await fetch(`/api/transactions/${docId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete transaction.');
    }

    await fetchTransactions();
    showNotification("Transaction deleted.");
  } catch (error) {
    console.error("Error deleting transaction:", error);
    showNotification("Failed to delete transaction.", "error");
  }
}

async function clearAllUserTransactions() {
  try {
    const response = await fetch('/api/transactions', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to clear database.');
    }

    await fetchTransactions();
    showNotification("All transaction entries cleared.", "info");
  } catch (error) {
    console.error("Error clearing database:", error);
    showNotification("Failed to clear entries.", "error");
  }
}


// --- 5. AI Receipt Scanner Flow (Authenticated Server proxy) ---
async function processReceiptWithGemini(file) {
  globalLoader.classList.remove("hidden");

  try {
    const base64DataUrl = await getBase64(file);
    const base64Data = base64DataUrl.split(",")[1];
    const mimeType = file.type;

    const response = await fetch("/api/scan-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ imageBase64: base64Data, mimeType })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "HTTP Error contacting server.");
    }

    const parsedResult = await response.json();

    // Reset upload UI elements early
    selectedFile = null;
    if (fileInput) fileInput.value = "";
    if (filePreviewBar) filePreviewBar.classList.add("hidden");
    if (dropzone) dropzone.classList.remove("hidden");

    // Open Review & Edit verification modal instead of auto-saving to DB
    openReviewModal(parsedResult);

  } catch (error) {
    console.error("Gemini API processing failed:", error);
    showNotification(`Failed to scan receipt: ${error.message}`, "error");
  } finally {
    globalLoader.classList.add("hidden");
  }
}

// Review & Edit Modal Handlers
function openReviewModal(parsed) {
  const modal = document.getElementById("review-modal");
  const dateInput = document.getElementById("review-date");
  const vendorInput = document.getElementById("review-vendor");
  const amountInput = document.getElementById("review-amount");
  const catSelect = document.getElementById("review-category");

  if (!modal) return;

  // Pre-fill inputs with extracted Gemini data
  dateInput.value = parsed.date || new Date().toISOString().split("T")[0];
  vendorInput.value = parsed.vendor || "";
  amountInput.value = parseFloat(parsed.amount || 0).toFixed(2);

  // Category validation with fallback logic
  const matchedCategory = VALID_CATEGORIES.includes(parsed.category)
    ? parsed.category
    : "Other";
  catSelect.value = matchedCategory;

  modal.classList.remove("hidden");
}

function handleReviewCancel() {
  const modal = document.getElementById("review-modal");
  if (modal) modal.classList.add("hidden");
  showNotification("Receipt scan verification cancelled.", "info");
}

async function handleReviewConfirm() {
  const date = document.getElementById("review-date").value;
  const vendor = document.getElementById("review-vendor").value.trim();
  const rawAmt = document.getElementById("review-amount").value;
  const category = document.getElementById("review-category").value;

  if (!date || !vendor || !rawAmt || !category) {
    showNotification("Please fill in all manual fields in the review window.", "error");
    return;
  }

  // Safely enforce 2-decimal formatting structure
  const cleanAmount = parseFloat(parseFloat(rawAmt).toFixed(2));

  try {
    await addTransaction({
      category: category,
      amount: cleanAmount,
      vendor: vendor,
      date: date,
      metadata: { source: "receipt-scan" }
    });
    
    const modal = document.getElementById("review-modal");
    if (modal) modal.classList.add("hidden");
    showNotification("Transaction verified and logged successfully!");
  } catch (error) {
    console.error("Failed to add verified transaction:", error);
    showNotification("Failed to save transaction.", "error");
  }
}

window.handleReviewCancel = handleReviewCancel;
window.handleReviewConfirm = handleReviewConfirm;


// --- 6. UI Rendering & Interactions ---
function updateDashboard() {
  if (!expenseTableBody) return; // safety check if we are on login.html
  renderKPIs();
  renderExpensesTable();
  renderCharts();
}

function formatDateToDMY(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function renderKPIs() {
  const expenses = transactions.filter((t) => t.type === "expense");
  const incomes = transactions.filter((t) => t.type === "income");
  const scanCount = transactions.filter((e) => e.metadata && e.metadata.source === "receipt-scan").length;

  statScans.textContent = scanCount.toString();

  const totalIncome = incomes.reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpense = expenses.reduce((acc, curr) => acc + curr.amount, 0);
  const netBalance = totalIncome - totalExpense;

  if (statTotalIncome) statTotalIncome.textContent = `฿${totalIncome.toFixed(2)}`;
  if (statTotalExpense) statTotalExpense.textContent = `฿${totalExpense.toFixed(2)}`;

  // Net Balance with dynamic color class
  if (statNetBalance) {
    statNetBalance.textContent = `฿${Math.abs(netBalance).toFixed(2)}`;
    if (netBalance >= 0) {
      statNetBalance.className = "heading-font text-2xl sm:text-3xl font-extrabold text-emerald-600";
    } else {
      statNetBalance.className = "heading-font text-2xl sm:text-3xl font-extrabold text-rose-600";
    }
  }

  // Average Expense: denominator is count of expense transactions only
  if (expenses.length === 0) {
    if (statTopCategory) statTopCategory.textContent = "N/A";
    if (statAvgExpense) statAvgExpense.textContent = "฿0.00";
    return;
  }

  const avg = totalExpense / expenses.length;
  if (statAvgExpense) statAvgExpense.textContent = `฿${avg.toFixed(2)}`;

  // Find Top Category (expenses only)
  const categoryTotals = {};
  expenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  let topCat = "N/A";
  let maxSpend = -1;
  Object.keys(categoryTotals).forEach((cat) => {
    if (categoryTotals[cat] > maxSpend) {
      maxSpend = categoryTotals[cat];
      topCat = cat;
    }
  });
  if (statTopCategory) statTopCategory.textContent = topCat;
}

function renderExpensesTable() {
  const queryVal = searchFilter.value.toLowerCase().trim();
  const selectedCat = categoryFilter.value;

  const filtered = transactions.filter((e) => {
    const matchesQuery = e.vendor.toLowerCase().includes(queryVal);
    const matchesCat = (selectedCat === "All" || e.category === selectedCat);
    return matchesQuery && matchesCat;
  });

  if (filtered.length === 0) {
    expenseTableBody.innerHTML = "";
    tableEmptyState.classList.remove("hidden");
    return;
  }
  tableEmptyState.classList.add("hidden");
  expenseTableBody.innerHTML = "";

  filtered.forEach((expense) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-white/50 transition-colors border-b border-[#13261f]/10 relative group";

    // Date picker field (displays DD/MM/YYYY, double click to edit via HTML date picker)
    const tdDate = document.createElement("td");
    tdDate.className = "px-4 py-3 font-mono text-xs text-[#13261f]";
    const formattedDate = formatDateToDMY(expense.date);
    tdDate.innerHTML = `
      <span class="date-display cursor-pointer hover:underline" title="Double click to edit">${formattedDate}</span>
      <input 
        type="date" 
        value="${expense.date}" 
        class="date-input hidden bg-transparent text-[#13261f] w-full focus:outline-none focus:border-b focus:border-[#13261f]/30 p-0 border-0 focus:ring-0 text-xs font-mono"
      >
    `;
    
    const displaySpan = tdDate.querySelector(".date-display");
    const dateInput = tdDate.querySelector(".date-input");
    
    displaySpan.addEventListener("dblclick", () => {
      displaySpan.classList.add("hidden");
      dateInput.classList.remove("hidden");
      dateInput.focus();
    });
    
    dateInput.addEventListener("change", async (e) => {
      let val = e.target.value;
      if (val) {
        // Enforce YYYY-MM-DD format
        if (val.includes("/") && val.split("/").length === 3) {
          const parts = val.split("/");
          const day = parts[0].padStart(2, "0");
          const month = parts[1].padStart(2, "0");
          const year = parts[2];
          val = `${year}-${month}-${day}`;
        }
        await updateTransactionField(expense.id, "date", val);
      } else {
        dateInput.value = expense.date;
        displaySpan.classList.remove("hidden");
        dateInput.classList.add("hidden");
      }
    });
    
    dateInput.addEventListener("blur", () => {
      setTimeout(() => {
        displaySpan.classList.remove("hidden");
        dateInput.classList.add("hidden");
      }, 200);
    });

    // Vendor text field
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
        updateTransactionField(expense.id, "vendor", val);
      } else {
        e.target.value = expense.vendor; // revert
      }
    });

    // Category select dropdown
    const tdCat = document.createElement("td");
    tdCat.className = "px-4 py-3";
    const select = document.createElement("select");
    select.className = "bg-white/50 border border-slate-200 text-xs text-[#13261f] rounded px-1.5 py-0.5 focus:outline-none focus:border-[#13261f]/30 cursor-pointer";

    VALID_CATEGORIES.forEach((catName) => {
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
      updateTransactionField(expense.id, "category", e.target.value);
    });
    tdCat.appendChild(select);

    // Amount field with Thai Baht symbol and type-based text styling
    const amountColorClass = expense.type === 'income' ? 'text-emerald-600 font-bold' : 'text-rose-600';
    const tdAmount = document.createElement("td");
    tdAmount.className = `px-4 py-3 text-right ${amountColorClass}`;
    tdAmount.innerHTML = `
      <div class="flex items-center justify-end gap-1">
        <span class="text-xs">฿</span>
        <input 
          type="number" 
          step="0.01" 
          value="${expense.amount.toFixed(2)}" 
          class="bg-transparent text-right focus:outline-none focus:border-b focus:border-[#13261f]/30 p-0 border-0 focus:ring-0 text-xs font-mono w-20 ${amountColorClass}"
        >
      </div>
    `;
    tdAmount.querySelector("input").addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val >= 0) {
        updateTransactionField(expense.id, "amount", val);
      } else {
        e.target.value = expense.amount.toFixed(2); // revert
      }
    });

    // Delete Action Button
    const tdDelete = document.createElement("td");
    tdDelete.className = "px-4 py-3 text-center w-12";
    tdDelete.innerHTML = `
      <button class="text-slate-600 hover:text-rose-500 focus:outline-none transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 cursor-pointer">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    `;
    tdDelete.querySelector("button").addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this log entry?")) {
        deleteTransaction(expense.id);
      }
    });

    tr.appendChild(tdDate);
    tr.appendChild(tdVendor);
    tr.appendChild(tdCat);
    tr.appendChild(tdAmount);
    tr.appendChild(tdDelete);
    expenseTableBody.appendChild(tr);
  });
}

function renderCharts() {
  // --- 1. Category Spending Breakdown Chart (Expenses Only) ---
  const aggregation = {};
  const expensesOnly = transactions.filter((t) => t.type === "expense");

  expensesOnly.forEach((e) => {
    aggregation[e.category] = (aggregation[e.category] || 0) + e.amount;
  });

  const categories = Object.keys(aggregation);
  const dataValues = categories.map((cat) => aggregation[cat]);
  const totalSum = dataValues.reduce((a, b) => a + b, 0);

  if (totalSum === 0) {
    chartEmptyState.classList.remove("hidden");
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  } else {
    chartEmptyState.classList.add("hidden");

    const bgColors = categories.map((cat) => categoryConfig[cat]?.color || "rgba(100, 116, 139, 0.85)");
    const borderColors = categories.map((cat) => categoryConfig[cat]?.border || "rgb(100, 116, 139)");

    if (chartInstance) {
      chartInstance.destroy();
    }

    const ctx = document.getElementById("categoryChart").getContext("2d");
    const isDoughnut = currentChartType === "doughnut";

    chartInstance = new Chart(ctx, {
      type: currentChartType,
      data: {
        labels: categories,
        datasets: [{
          label: "Spend Amount (฿)",
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
              label: function (context) {
                const val = context.raw || 0;
                const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : 0;
                return ` ฿${val.toFixed(2)} (${pct}%)`;
              }
            }
          }
        },
        scales: isDoughnut ? {} : {
          x: {
            grid: { color: "rgba(19, 38, 31, 0.08)" },
            ticks: {
              color: "rgba(19, 38, 31, 0.7)",
              font: { size: 10 }
            }
          },
          y: {
            grid: { color: "rgba(19, 38, 31, 0.08)" },
            ticks: {
              color: "rgba(19, 38, 31, 0.7)",
              font: { size: 10 },
              callback: function (value) {
                return "฿" + value;
              }
            }
          }
        }
      }
    });
  }

  // --- 2. Monthly Breakdown Grouped Bar Chart (2026 Current Year) ---
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const incomeData = Array(12).fill(0);
  const expenseData = Array(12).fill(0);

  let currentYearDataCount = 0;

  transactions.forEach((e) => {
    // Filter to only include records where the transaction date is in 2026
    if (e.date && e.date.startsWith("2026-")) {
      const parts = e.date.split("-");
      const monthIndex = parseInt(parts[1], 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        if (e.type === "income") {
          incomeData[monthIndex] += e.amount;
        } else {
          expenseData[monthIndex] += e.amount;
        }
        currentYearDataCount++;
      }
    }
  });

  const monthlyEmptyState = document.getElementById("monthly-chart-empty-state");
  if (currentYearDataCount === 0) {
    if (monthlyEmptyState) monthlyEmptyState.classList.remove("hidden");
    if (monthlyChartInstance) {
      monthlyChartInstance.destroy();
      monthlyChartInstance = null;
    }
  } else {
    if (monthlyEmptyState) monthlyEmptyState.classList.add("hidden");

    if (monthlyChartInstance) {
      monthlyChartInstance.destroy();
    }

    const mctx = document.getElementById("monthlyChart").getContext("2d");
    monthlyChartInstance = new Chart(mctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Income (฿)",
            data: incomeData,
            backgroundColor: "#10b981", // Green
            borderColor: "#059669",
            borderWidth: 1
          },
          {
            label: "Expense (฿)",
            data: expenseData,
            backgroundColor: "#f43f5e", // Red
            borderColor: "#e11d48",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              color: "rgba(19, 38, 31, 0.8)",
              font: {
                family: "Inter",
                size: 10
              }
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
              label: function (context) {
                const val = context.raw || 0;
                return ` ฿${val.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(19, 38, 31, 0.08)" },
            ticks: {
              color: "rgba(19, 38, 31, 0.7)",
              font: { size: 10 }
            }
          },
          y: {
            grid: { color: "rgba(19, 38, 31, 0.08)" },
            ticks: {
              color: "rgba(19, 38, 31, 0.7)",
              font: { size: 10 },
              callback: function (value) {
                return "฿" + value;
              }
            }
          }
        }
      }
    });
  }
}

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

window.changeChartType = changeChartType;


// --- 7. Document Event Listeners & Ingestion Setup ---
document.addEventListener("DOMContentLoaded", () => {
  // Always trigger the route guard verification
  checkAuth();

  if (!dropzone) return; // safety checks (only run on index.html, skip on login.html)

  // Dropzone drag/drop listeners
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-slate-800");
    dropzone.classList.add("border-purple-500", "bg-purple-950/20");
  });

  ["dragleave", "dragend"].forEach((type) => {
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

  // Search & Filter listeners
  searchFilter.addEventListener("input", renderExpensesTable);
  categoryFilter.addEventListener("change", renderExpensesTable);

  // Clear Sandbox Data Database call
  clearAllDataBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all transaction entries permanently?")) {
      clearAllUserTransactions();
    }
  });

  // Manual modal control trigger bindings
  openManualModalBtn.addEventListener("click", () => {
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("manual-date").value = today;
    manualModal.classList.remove("hidden");
  });

  closeManualModalBtn.addEventListener("click", () => {
    manualModal.classList.add("hidden");
    manualForm.reset();
  });

  manualForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const vendor = document.getElementById("manual-vendor").value.trim();
    const amount = parseFloat(document.getElementById("manual-amount").value);
    const date = document.getElementById("manual-date").value;
    const category = document.getElementById("manual-category").value;

    if (!vendor || isNaN(amount) || !date || !category) {
      showNotification("Please fill in all manual fields.", "error");
      return;
    }

    try {
      await addTransaction({
        category,
        amount,
        vendor,
        date
      });
      manualModal.classList.add("hidden");
      manualForm.reset();
      showNotification("Manual transaction logged!");
    } catch (err) {
      console.error(err);
      showNotification("Failed to add transaction.", "error");
    }
  });
});

// File input handlers
function handleFileSelection(file) {
  if (!file.type.startsWith("image/")) {
    showNotification("Only receipt image files are supported.", "error");
    return;
  }
  selectedFile = file;
  previewFilename.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  filePreviewBar.classList.remove("hidden");
  processReceiptWithGemini(file);
}

function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
  });
}


// --- 8. UI Notification Display Block ---
function showNotification(message, type = "success") {
  const banner = document.getElementById("notification-banner");
  const card = document.getElementById("notification-card");
  const iconDiv = document.getElementById("notification-icon");
  const msgDiv = document.getElementById("notification-message");

  if (!banner || !card || !iconDiv || !msgDiv) return;

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
  banner.classList.remove("translate-y-[-100px]", "opacity-0");
  banner.classList.add("translate-y-0", "opacity-100");

  setTimeout(() => {
    banner.classList.remove("translate-y-0", "opacity-100");
    banner.classList.add("translate-y-[-100px]", "opacity-0");
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
