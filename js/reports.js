// =========================================================
// MONTHLY REPORTS (reports.html)
// =========================================================

import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import { showToast, formatCurrency, formatDate, initials, initMobileSidebar, escapeHtml } from "./common.js";

wireLogoutButtons();
initMobileSidebar();

let CURRENT_USER = null;
let PROFILE = null;
let CURRENT_REPORT = null;

const monthSelect = document.getElementById("month-select");
const yearSelect = document.getElementById("year-select");
const generateBtn = document.getElementById("generate-report");
const resultsWrap = document.getElementById("report-results");
const placeholderEl = document.getElementById("report-placeholder");

(async function init() {
  const { user, profile } = await requireAuth();
  CURRENT_USER = user;
  PROFILE = profile;
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);

  const now = new Date();
  monthSelect.value = String(now.getMonth() + 1);
  const currentYear = now.getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = currentYear;
})();

generateBtn.addEventListener("click", generateReport);

async function generateReport() {
  const month = Number(monthSelect.value);
  const year = Number(yearSelect.value);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  generateBtn.disabled = true;
  generateBtn.querySelector(".spinner")?.classList.add("active");

  try {
    const [incomeSnap, expenseSnap, borrowedSnap, repaymentSnap] = await Promise.all([
      getDocs(collection(db, "users", CURRENT_USER.uid, "income")),
      getDocs(collection(db, "users", CURRENT_USER.uid, "expenses")),
      getDocs(collection(db, "users", CURRENT_USER.uid, "borrowed")),
      getDocs(collection(db, "users", CURRENT_USER.uid, "repayments"))
    ]);

    const inMonth = (dateStr) => dateStr && dateStr.startsWith(monthKey);

    const income = incomeSnap.docs.map(d => d.data()).filter(x => inMonth(x.date));
    const expenses = expenseSnap.docs.map(d => d.data()).filter(x => inMonth(x.date));
    const borrowed = borrowedSnap.docs.map(d => d.data()).filter(x => inMonth(x.borrowDate));
    const repayments = repaymentSnap.docs.map(d => d.data()).filter(x => inMonth(x.repaymentDate));

    const totalIncome = income.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalExpense = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalBorrowed = borrowed.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalRepayment = repayments.reduce((s, x) => s + Number(x.repaymentAmount || 0), 0);

    const allBorrowed = borrowedSnap.docs.map(d => d.data());
    const outstandingBorrowed = allBorrowed.reduce((s, x) => s + Number(x.remainingAmount ?? x.amount), 0);

    const netBalance = totalIncome + totalBorrowed - totalExpense - totalRepayment;

    const incomeBySource = groupSum(income, "source");
    const expenseByCategory = groupSum(expenses, "category");

    const largestExpense = expenses.reduce((max, e) => (Number(e.amount) > (max ? Number(max.amount) : -1) ? e : max), null);
    const topCategoryEntry = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0];

    CURRENT_REPORT = {
      monthLabel: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      totalIncome, totalExpense, totalBorrowed, totalRepayment, outstandingBorrowed, netBalance,
      largestExpense, topCategory: topCategoryEntry ? topCategoryEntry[0] : "—",
      transactionCount: income.length + expenses.length + borrowed.length + repayments.length,
      incomeBySource, expenseByCategory,
      income, expenses, borrowed, repayments
    };

    renderReport(CURRENT_REPORT);
    placeholderEl.style.display = "none";
    resultsWrap.style.display = "block";
  } catch (err) {
    console.error(err);
    showToast("Failed to generate report.", "error");
  } finally {
    generateBtn.disabled = false;
    generateBtn.querySelector(".spinner")?.classList.remove("active");
  }
}

function groupSum(records, field) {
  const map = {};
  records.forEach(r => { const key = r[field] || "Other"; map[key] = (map[key] || 0) + Number(r.amount ?? r.repaymentAmount ?? 0); });
  return map;
}

function renderReport(r) {
  document.getElementById("report-month-label").textContent = r.monthLabel;
  document.getElementById("rep-income").textContent = formatCurrency(r.totalIncome);
  document.getElementById("rep-expense").textContent = formatCurrency(r.totalExpense);
  document.getElementById("rep-borrowed").textContent = formatCurrency(r.totalBorrowed);
  document.getElementById("rep-repayment").textContent = formatCurrency(r.totalRepayment);
  document.getElementById("rep-outstanding").textContent = formatCurrency(r.outstandingBorrowed);
  document.getElementById("rep-balance").textContent = formatCurrency(r.netBalance);
  document.getElementById("rep-largest-expense").textContent = r.largestExpense ? `${formatCurrency(r.largestExpense.amount)} — ${escapeHtml(r.largestExpense.reason || "")}` : "—";
  document.getElementById("rep-top-category").textContent = r.topCategory;
  document.getElementById("rep-txn-count").textContent = r.transactionCount;

  document.getElementById("income-breakdown").innerHTML = Object.keys(r.incomeBySource).length
    ? Object.entries(r.incomeBySource).map(([k, v]) => `<div class="reason-box diff-row"><span>${escapeHtml(k)}</span><span>${formatCurrency(v)}</span></div>`).join("")
    : `<p class="cell-muted">No income this month.</p>`;

  document.getElementById("expense-breakdown").innerHTML = Object.keys(r.expenseByCategory).length
    ? Object.entries(r.expenseByCategory).map(([k, v]) => `<div class="reason-box diff-row"><span>${escapeHtml(k)}</span><span>${formatCurrency(v)}</span></div>`).join("")
    : `<p class="cell-muted">No expenses this month.</p>`;
}

/* ---------------- CSV Export ---------------- */

document.getElementById("download-csv").addEventListener("click", () => {
  if (!CURRENT_REPORT) return showToast("Generate a report first.", "info");
  const r = CURRENT_REPORT;
  let rows = [["Smart Family Finance Manager — Monthly Report"], [r.monthLabel], [],
    ["Metric", "Value"],
    ["Total Income", r.totalIncome], ["Total Expenses", r.totalExpense],
    ["Total Borrowed", r.totalBorrowed], ["Total Repayment", r.totalRepayment],
    ["Outstanding Borrowed", r.outstandingBorrowed], ["Net Balance", r.netBalance],
    ["Largest Expense", r.largestExpense ? r.largestExpense.amount : 0],
    ["Top Expense Category", r.topCategory], ["Number of Transactions", r.transactionCount],
    [], ["Type", "Amount", "Category/Source", "Reason", "Date"]
  ];
  r.income.forEach(x => rows.push(["Income", x.amount, x.source, x.description || "", x.date]));
  r.expenses.forEach(x => rows.push(["Expense", x.amount, x.category, x.reason || "", x.date]));
  r.borrowed.forEach(x => rows.push(["Borrowed", x.amount, x.borrowedFrom, x.reason || "", x.borrowDate]));
  r.repayments.forEach(x => rows.push(["Repayment", x.repaymentAmount, "", x.notes || "", x.repaymentDate]));

  const csv = rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(csv, `finance-report-${r.monthLabel.replace(" ", "-")}.csv`, "text/csv");
  showToast("CSV report downloaded.", "success");
});

/* ---------------- PDF Export ---------------- */

document.getElementById("download-pdf").addEventListener("click", () => {
  if (!CURRENT_REPORT) return showToast("Generate a report first.", "info");
  const r = CURRENT_REPORT;
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();

  docPdf.setFontSize(16);
  docPdf.setTextColor(124, 92, 255);
  docPdf.text("Smart Family Finance Manager", 14, 18);
  docPdf.setFontSize(11);
  docPdf.setTextColor(60, 60, 60);
  docPdf.text(`Monthly Report — ${r.monthLabel}`, 14, 26);
  docPdf.setFontSize(9);
  docPdf.setTextColor(130, 130, 130);
  docPdf.text(`Generated on ${new Date().toLocaleString()}`, 14, 32);

  let y = 44;
  docPdf.setFontSize(12);
  docPdf.setTextColor(20, 20, 20);
  docPdf.text("Summary", 14, y); y += 8;
  docPdf.setFontSize(10);
  const summaryRows = [
    ["Total Income", formatCurrency(r.totalIncome)],
    ["Total Expenses", formatCurrency(r.totalExpense)],
    ["Total Borrowed", formatCurrency(r.totalBorrowed)],
    ["Total Repayment", formatCurrency(r.totalRepayment)],
    ["Outstanding Borrowed", formatCurrency(r.outstandingBorrowed)],
    ["Net Balance", formatCurrency(r.netBalance)],
    ["Largest Expense", r.largestExpense ? formatCurrency(r.largestExpense.amount) : "—"],
    ["Top Expense Category", r.topCategory],
    ["Number of Transactions", String(r.transactionCount)]
  ];
  summaryRows.forEach(([k, v]) => { docPdf.text(k, 14, y); docPdf.text(String(v), 100, y); y += 6; });

  y += 6;
  docPdf.setFontSize(12);
  docPdf.text("Transactions", 14, y); y += 8;
  docPdf.setFontSize(8);
  const all = [
    ...r.income.map(x => ["INCOME", x.date, formatCurrency(x.amount), x.source, x.description || ""]),
    ...r.expenses.map(x => ["EXPENSE", x.date, formatCurrency(x.amount), x.category, x.reason || ""]),
    ...r.borrowed.map(x => ["BORROWED", x.borrowDate, formatCurrency(x.amount), x.borrowedFrom, x.reason || ""]),
    ...r.repayments.map(x => ["REPAYMENT", x.repaymentDate, formatCurrency(x.repaymentAmount), "", x.notes || ""])
  ];
  all.forEach(row => {
    if (y > 280) { docPdf.addPage(); y = 20; }
    docPdf.text(row.join("  |  ").slice(0, 110), 14, y);
    y += 5;
  });

  docPdf.save(`finance-report-${r.monthLabel.replace(" ", "-")}.pdf`);
  showToast("PDF report downloaded.", "success");
});

/* ---------------- Excel Export ---------------- */

document.getElementById("download-excel").addEventListener("click", () => {
  if (!CURRENT_REPORT) return showToast("Generate a report first.", "info");
  const r = CURRENT_REPORT;
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Smart Family Finance Manager — Monthly Report"], [r.monthLabel], [],
    ["Total Income", r.totalIncome], ["Total Expenses", r.totalExpense],
    ["Total Borrowed", r.totalBorrowed], ["Total Repayment", r.totalRepayment],
    ["Outstanding Borrowed", r.outstandingBorrowed], ["Net Balance", r.netBalance],
    ["Largest Expense", r.largestExpense ? r.largestExpense.amount : 0],
    ["Top Expense Category", r.topCategory], ["Number of Transactions", r.transactionCount]
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.income), "Income");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.expenses), "Expenses");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.borrowed), "Borrowed");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.repayments), "Repayments");

  XLSX.writeFile(wb, `finance-report-${r.monthLabel.replace(" ", "-")}.xlsx`);
  showToast("Excel report downloaded.", "success");
});

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
