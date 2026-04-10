import { logoutUser, getStoredUser, getToken } from './auth.js';
import { renderLogin } from './login.js';

let executionTimeText;
let refreshBtn;
let dietFilter;

let barChart;
let lineChart;
let pieChart;

const API_URL = 'https://diet-analysis-fn7174.azurewebsites.net/api/analyze_diet';

export async function renderDashboard() {
  const app = document.getElementById('app');
  const user = getStoredUser();
  const token = getToken();

  if (!user || !token) {
    renderLogin();
    return;
  }

  app.innerHTML = `
    <div class="page dashboard-page">
      <header class="top-bar">
        <div>
          <h1>Diet Analytics Dashboard</h1>
          <p id="execution-time">Loading...</p>
        </div>

        <div class="user-section">
          <span class="user-name">${user.name || user.email || 'User'}</span>
          <button id="logoutBtn" class="secondary-btn">Logout</button>
        </div>
      </header>

      <section class="controls">
        <label for="dietFilter">Filter by Diet Type:</label>
        <select id="dietFilter">
          <option value="all">All</option>
          <option value="keto">Keto</option>
          <option value="vegan">Vegan</option>
          <option value="paleo">Paleo</option>
          <option value="dash">Dash</option>
          <option value="mediterranean">Mediterranean</option>
        </select>

        <button id="refreshBtn" class="primary-btn">Refresh Data</button>
      </section>

      <section class="charts-grid">
        <div class="chart-card">
          <h3>Estimated Calories by Diet</h3>
          <div class="chart-wrapper">
            <canvas id="barChart"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <h3>Average Protein by Diet</h3>
          <div class="chart-wrapper">
            <canvas id="lineChart"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <h3>Carb Distribution by Diet</h3>
          <div class="chart-wrapper">
            <canvas id="pieChart"></canvas>
          </div>
        </div>
      </section>
    </div>
  `;

  executionTimeText = document.getElementById('execution-time');
  refreshBtn = document.getElementById('refreshBtn');
  dietFilter = document.getElementById('dietFilter');

  document.getElementById('logoutBtn').addEventListener('click', () => {
    logoutUser();
    renderLogin();
  });

  dietFilter.addEventListener('change', () => {
    if (window.lastFetchedData) {
      renderCharts(window.lastFetchedData, dietFilter.value);
    }
  });

  refreshBtn.addEventListener('click', () => {
    fetchData();
  });

  fetchData();
}

async function fetchData() {
  try {
    executionTimeText.textContent = 'Loading data from Azure...';

    const response = await fetch(API_URL);
    const result = await response.json();

    const data = result.analysis.averages_by_diet;
    const execTime = result.metadata.execution_time_sec;

    loadDashboard(data, execTime);
  } catch (error) {
    console.error('Error fetching data:', error);
    executionTimeText.textContent = 'Error: Could not connect to Azure Function.';
  }
}

function buildChartData(data, filter = 'all') {
  let labels = Object.keys(data);

  if (filter !== 'all') {
    labels = labels.filter((l) => l.toLowerCase() === filter.toLowerCase());
  }

  return {
    labels: labels.map((l) => l.charAt(0).toUpperCase() + l.slice(1)),
    calories: labels.map(
      (l) => data[l]['Fat(g)'] * 9 + data[l]['Protein(g)'] * 4 + data[l]['Carbs(g)'] * 4
    ),
    protein: labels.map((l) => data[l]['Protein(g)']),
    carbs: labels.map((l) => data[l]['Carbs(g)']),
  };
}

function renderCharts(data, filter = 'all') {
  const chartData = buildChartData(data, filter);

  if (barChart) barChart.destroy();
  if (lineChart) lineChart.destroy();
  if (pieChart) pieChart.destroy();

  const ctxBar = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Estimated Calories',
          data: chartData.calories,
          backgroundColor: 'rgba(37, 99, 235, 0.6)',
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  const ctxLine = document.getElementById('lineChart').getContext('2d');
  lineChart = new Chart(ctxLine, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Average Protein (g)',
          data: chartData.protein,
          borderColor: '#10b981',
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  const ctxPie = document.getElementById('pieChart').getContext('2d');
  pieChart = new Chart(ctxPie, {
    type: 'pie',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Carb Distribution',
          data: chartData.carbs,
          backgroundColor: ['#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function loadDashboard(data, execTime) {
  executionTimeText.textContent = `Azure Function Execution Time: ${execTime}s`;
  renderCharts(data, dietFilter.value);
  window.lastFetchedData = data;
}