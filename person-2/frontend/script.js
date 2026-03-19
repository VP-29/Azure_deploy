const executionTimeText = document.getElementById("execution-time");
const refreshBtn = document.getElementById("refreshBtn");
const dietFilter = document.getElementById("dietFilter");

let barChart;
let lineChart;
let pieChart;

// --- CONFIGURATION ---
// Replace this with your actual Azure Function URL once deployed
const API_URL = "https://diet-analysis-fn7174.azurewebsites.net/api/analyze_diet";

async function fetchData() {
    try {
        executionTimeText.textContent = "Loading data from Azure...";
        
        // For Phase 2 it is switched to the API call
        const response = await fetch(API_URL); 
        const result = await response.json();
        
        const data = result.analysis.averages_by_diet;
        const execTime = result.metadata.execution_time_sec;

        loadDashboard(data, execTime);
    } catch (error) {
        console.error("Error fetching data:", error);
        executionTimeText.textContent = "Error: Could not connect to Azure Function.";
    }
}

// Maps the dictionary from function_app.py to Chart.js format
function buildChartData(data, filter = "all") {
    let labels = Object.keys(data);
    
    // Apply filter
    if (filter !== "all") {
        labels = labels.filter(l => l.toLowerCase() === filter.toLowerCase());
    }

    return {
        labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
        calories: labels.map(l => data[l]["Fat(g)"] * 9 + data[l]["Protein(g)"] * 4 + data[l]["Carbs(g)"] * 4), // Approx calories
        protein: labels.map(l => data[l]["Protein(g)"]),
        carbs: labels.map(l => data[l]["Carbs(g)"])
    };
}

function renderCharts(data, filter = "all") {
    const chartData = buildChartData(data, filter);

    if (barChart) barChart.destroy();
    if (lineChart) lineChart.destroy();
    if (pieChart) pieChart.destroy();

    const ctxBar = document.getElementById("barChart").getContext("2d");
    barChart = new Chart(ctxBar, {
        type: "bar",
        data: {
            labels: chartData.labels,
            datasets: [{
                label: "Estimated Calories",
                data: chartData.calories,
                backgroundColor: "rgba(37, 99, 235, 0.6)",
                borderColor: "rgba(37, 99, 235, 1)",
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxLine = document.getElementById("lineChart").getContext("2d");
    lineChart = new Chart(ctxLine, {
        type: "line",
        data: {
            labels: chartData.labels,
            datasets: [{
                label: "Average Protein (g)",
                data: chartData.protein,
                borderColor: "#10b981",
                fill: false,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxPie = document.getElementById("pieChart").getContext("2d");
    pieChart = new Chart(ctxPie, {
        type: "pie",
        data: {
            labels: chartData.labels,
            datasets: [{
                label: "Carb Distribution",
                data: chartData.carbs,
                backgroundColor: [
                    "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"
                ]
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function loadDashboard(data, execTime) {
    executionTimeText.textContent = `Azure Function Execution Time: ${execTime}s`;
    renderCharts(data, dietFilter.value);
    
    // Store data globally for filtering without re-fetching
    window.lastFetchedData = data;
}

dietFilter.addEventListener("change", () => {
    if (window.lastFetchedData) {
        renderCharts(window.lastFetchedData, dietFilter.value);
    }
});

refreshBtn.addEventListener("click", () => {
    fetchData();
});

// Initial Load
fetchData();
