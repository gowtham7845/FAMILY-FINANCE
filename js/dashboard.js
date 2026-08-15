// =========================================================
// DASHBOARD LOGIC (dashboard.html)
// =========================================================

import { db } from "./firebase-config.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { requireAuth, wireLogoutButtons } from "./guard.js";
import { formatCurrency, initials, initMobileSidebar } from "./common.js";

wireLogoutButtons();
initMobileSidebar();

const CATEGORY_COLORS = {
  Food: "#fb923c", Education: "#60a5fa", Transport: "#a78bfa", Shopping: "#f472b6",
  Medical: "#fb7185", Bills: "#facc15", Entertainment: "#22d3ee", Other: "#9aa3c7"
};

let charts = {};

(async function init() {
  const { user, profile } = await requireAuth();

  document.getElementById("welcome-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-name").textContent = profile?.fullName || user.email;
  document.getElementById("sidebar-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = initials(profile?.fullName || user.email);

  const [incomeSnap, expenseSnap, borrowedSnap, repaymentSnap] = await Promise.all([
    getDocs(collection(db, "users", user.uid, "income")),
    getDocs(collection(db, "users", user.uid, "expenses")),
    getDocs(collection(db, "users", user.uid, "borrowed")),
    getDocs(collection(db, "users", user.uid, "repayments"))
  ]);

  const income = incomeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const expenses = expenseSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const borrowed = borrowedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const repayments = repaymentSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const totalIncome = income.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalExpense = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalBorrowed = borrowed.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalRepayment = repayments.reduce((s, x) => s + Number(x.amount || 0), 0);
  const outstandingBorrowed = borrowed.reduce((s, x) => s + Number(x.remainingAmount ?? (x.amount - (x.totalRepaid || 0))), 0);
  const availableBalance = totalIncome + totalBorrowed - totalExpense - totalRepayment;

  setStat("stat-income", totalIncome);
  setStat("stat-expense", totalExpense);
  setStat("stat-borrowed", totalBorrowed);
  setStat("stat-repayment", totalRepayment);
  setStat("stat-balance", availableBalance);
  setStat("stat-outstanding", outstandingBorrowed);

  renderIncomeExpenseChart(income, expenses);
  renderBorrowedRepaymentChart(borrowed, repayments);
  renderMonthlySpendingChart(expenses);
  renderCategoryChart(expenses);
})();

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = formatCurrency(value);
}

function lastNMonthsLabels(n) {
  const labels = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short" }) });
  }
  return labels;
}

function sumByMonth(records, months) {
  const map = {};
  months.forEach(m => map[m.key] = 0);
  records.forEach(r => {
    if (!r.date) return;
    const key = r.date.slice(0, 7);
    if (key in map) map[key] += Number(r.amount || 0);
  });
  return months.map(m => map[m.key]);
}

function renderIncomeExpenseChart(income, expenses) {
  const canvas = document.getElementById("chart-income-expense");
  const empty = document.getElementById("empty-income-expense");
  if (!income.length && !expenses.length) { canvas.style.display = "none"; empty.style.display = "block"; return; }

  const months = lastNMonthsLabels(6);
  const incomeData = sumByMonth(income, months);
  const expenseData = sumByMonth(expenses, months);

  charts.ie = new Chart(canvas, {
    type: "bar",
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: "Income", data: incomeData, backgroundColor: "#34d399", borderRadius: 6 },
        { label: "Expenses", data: expenseData, backgroundColor: "#fb7185", borderRadius: 6 }
      ]
    },
    options: chartOptions(true)
  });
}

function renderBorrowedRepaymentChart(borrowed, repayments) {
  const canvas = document.getElementById("chart-borrowed-repayment");
  const empty = document.getElementById("empty-borrowed-repayment");
  if (!borrowed.length && !repayments.length) { canvas.style.display = "none"; empty.style.display = "block"; return; }

  const months = lastNMonthsLabels(6);
  const borrowedData = sumByMonth(borrowed.map(b => ({ date: b.borrowDate, amount: b.amount })), months);
  const repaymentData = sumByMonth(repayments.map(r => ({ date: r.repaymentDate, amount: r.repaymentAmount })), months);

  charts.br = new Chart(canvas, {
    type: "line",
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: "Borrowed", data: borrowedData, borderColor: "#fb923c", backgroundColor: "rgba(251,146,60,0.15)", tension: 0.35, fill: true },
        { label: "Repayment", data: repaymentData, borderColor: "#60a5fa", backgroundColor: "rgba(96,165,250,0.15)", tension: 0.35, fill: true }
      ]
    },
    options: chartOptions(true)
  });
}

function renderMonthlySpendingChart(expenses) {
  const canvas = document.getElementById("chart-monthly-spending");
  const empty = document.getElementById("empty-monthly-spending");
  if (!expenses.length) { canvas.style.display = "none"; empty.style.display = "block"; return; }

  const months = lastNMonthsLabels(6);
  const data = sumByMonth(expenses, months);

  charts.ms = new Chart(canvas, {
    type: "line",
    data: {
      labels: months.map(m => m.label),
      datasets: [{ label: "Spending", data, borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,0.15)", tension: 0.35, fill: true, pointBackgroundColor: "#a78bfa" }]
    },
    options: chartOptions(false)
  });
}

function renderCategoryChart(expenses) {
  const canvas = document.getElementById("chart-category");
  const empty = document.getElementById("empty-category");
  if (!expenses.length) { canvas.style.display = "none"; empty.style.display = "block"; return; }

  const byCat = {};
  expenses.forEach(e => { const c = e.category || "Other"; byCat[c] = (byCat[c] || 0) + Number(e.amount || 0); });
  const labels = Object.keys(byCat);
  const data = labels.map(l => byCat[l]);
  const colors = labels.map(l => CATEGORY_COLORS[l] || "#9aa3c7");

  charts.cat = new Chart(canvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#9aa3c7", boxWidth: 12, padding: 12, font: { size: 11 } } } }
    }
  });
}

function chartOptions(showLegend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: showLegend, position: "bottom", labels: { color: "#9aa3c7", boxWidth: 12, padding: 14, font: { size: 11 } } }
    },
    scales: {
      x: { ticks: { color: "#626a8c", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
      y: { ticks: { color: "#626a8c", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } }
    }
  };
}
