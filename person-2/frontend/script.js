import {
  loginUser,
  registerUser,
  logoutUser,
  getStoredUser,
  getToken,
  googleLogin,
  GOOGLE_CLIENT_ID
} from './auth.js';

const AZURE_INSIGHTS_URL =
  'https://diet-analysis-fn7174.azurewebsites.net/api/analyze_diet';

let currentPage = 1;
const itemsPerPage = 4;
let dietOptionsLoaded = false;

let barChartInstance = null;
let pieChartInstance = null;
let scatterChartInstance = null;

const authView = document.getElementById('authView');
const dashboardView = document.getElementById('dashboardView');
const welcomeUser = document.getElementById('welcomeUser');

const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginPanel = document.getElementById('loginPanel');
const registerPanel = document.getElementById('registerPanel');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');

const registerName = document.getElementById('registerName');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerConfirmPassword = document.getElementById('registerConfirmPassword');

const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');

const searchInput = document.getElementById('searchInput');
const dietFilter = document.getElementById('dietFilter');
const recipeList = document.getElementById('recipeList');
const resultsInfo = document.getElementById('resultsInfo');
const pagination = document.getElementById('pagination');
const emptyState = document.getElementById('emptyState');
const apiMessage = document.getElementById('apiMessage');
const executionInfo = document.getElementById('executionInfo');

const insightsBtn = document.getElementById('insightsBtn');
const recipesBtn = document.getElementById('recipesBtn');
const clustersBtn = document.getElementById('clustersBtn');

function switchTab(tab) {
  const isLogin = tab === 'login';
  loginTab.classList.toggle('active', isLogin);
  registerTab.classList.toggle('active', !isLogin);
  loginPanel.classList.toggle('hidden', !isLogin);
  registerPanel.classList.toggle('hidden', isLogin);
}

function setButtonLoading(button, loading, originalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? 'Please wait...' : originalText;
}

function showAuth() {
  dashboardView.classList.add('hidden');
  authView.classList.remove('hidden');
}

function showDashboard() {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
}

async function verifyUser() {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch('http://localhost:5000/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      logoutUser();
      return null;
    }

    const data = await response.json();
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    console.error('Verify user error:', error);
    logoutUser();
    return null;
  }
}

function openDashboard(user) {
  const name = user?.name || getStoredUser()?.name || 'User';
  welcomeUser.textContent = `Welcome, ${name}`;
  showDashboard();

  if (!dietOptionsLoaded) {
    populateDietOptions();
    dietOptionsLoaded = true;
  }

  currentPage = 1;
  renderRecipes();
  renderChartsFromAzure();
}

function populateDietOptions() {
  const existingOptions = Array.from(dietFilter.options).map((option) => option.value);
  const diets = [...new Set(recipes.map((recipe) => recipe.diet))].sort();

  diets.forEach((diet) => {
    if (!existingOptions.includes(diet)) {
      const option = document.createElement('option');
      option.value = diet;
      option.textContent = diet;
      dietFilter.appendChild(option);
    }
  });
}

function getFilteredRecipes() {
  const keyword = searchInput.value.trim().toLowerCase();
  const selectedDiet = dietFilter.value;

  return recipes.filter((recipe) => {
    const matchesDiet = selectedDiet === 'All' || recipe.diet === selectedDiet;
    const haystack = `${recipe.name} ${recipe.diet} ${recipe.keyword} ${recipe.description}`.toLowerCase();
    const matchesKeyword = haystack.includes(keyword);
    return matchesDiet && matchesKeyword;
  });
}

function renderRecipes() {
  const filtered = getFilteredRecipes();
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = filtered.slice(start, start + itemsPerPage);

  recipeList.innerHTML = '';
  emptyState.classList.toggle('hidden', filtered.length !== 0);

  if (filtered.length === 0) {
    resultsInfo.textContent = 'Showing 0 results';
  } else {
    resultsInfo.textContent = `Showing ${start + 1}-${Math.min(start + itemsPerPage, filtered.length)} of ${filtered.length} results`;
  }

  pageItems.forEach((recipe) => {
    const card = document.createElement('div');
    card.className = 'card recipe-card';
    card.innerHTML = `
      <span class="meta">${recipe.diet}</span>
      <h4>${recipe.name}</h4>
      <p>${recipe.description}</p>
      <p><strong>Calories:</strong> ${recipe.calories}</p>
      <p><strong>Protein:</strong> ${recipe.protein}</p>
    `;
    recipeList.appendChild(card);
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  pagination.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.textContent = 'Previous';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => {
    currentPage -= 1;
    renderRecipes();
  });
  pagination.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i += 1) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = `${i}`;
    pageBtn.addEventListener('click', () => {
      currentPage = i;
      renderRecipes();
    });
    pagination.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.textContent = 'Next';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    currentPage += 1;
    renderRecipes();
  });
  pagination.appendChild(nextBtn);
}

async function fetchAzureInsights() {
  const response = await fetch(AZURE_INSIGHTS_URL);
  if (!response.ok) {
    throw new Error(`Azure API failed with status ${response.status}`);
  }
  return response.json();
}

function extractMetric(obj, possibleKeys) {
  for (const key of possibleKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const value = Number(obj[key]);
      if (!Number.isNaN(value)) return value;
    }
  }
  return 0;
}

function destroyCharts() {
  if (barChartInstance) barChartInstance.destroy();
  if (pieChartInstance) pieChartInstance.destroy();
  if (scatterChartInstance) scatterChartInstance.destroy();
}

async function renderChartsFromAzure() {
  if (typeof Chart === 'undefined') return;

  const barCtx = document.getElementById('barChart');
  const pieCtx = document.getElementById('pieChart');
  const scatterCtx = document.getElementById('scatterChart');

  if (!barCtx || !pieCtx || !scatterCtx) return;

  try {
    executionInfo.textContent = 'Loading Azure insights...';

    const apiData = await fetchAzureInsights();
    const averages = apiData?.analysis?.averages_by_diet || {};
    const highestProteinDiet = apiData?.analysis?.highest_protein_diet || 'N/A';
    const execTime = apiData?.metadata?.execution_time_sec ?? 'N/A';

    const labels = Object.keys(averages);

    if (!labels.length) {
      executionInfo.textContent = 'Azure insights loaded, but no diet data was returned.';
      return;
    }

    const protein = labels.map((diet) =>
      extractMetric(averages[diet], [
        'Protein(g)',
        'protein',
        'avg_protein',
        'average_protein'
      ])
    );

    const carbs = labels.map((diet) =>
      extractMetric(averages[diet], [
        'Carbs(g)',
        'carbs',
        'carbohydrates',
        'avg_carbs',
        'average_carbs'
      ])
    );

    const fats = labels.map((diet) =>
      extractMetric(averages[diet], [
        'Fat(g)',
        'fat',
        'fats',
        'avg_fat',
        'average_fat'
      ])
    );

    destroyCharts();

    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Average Protein (g)',
            data: protein
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

    pieChartInstance = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            label: 'Average Fat (g)',
            data: fats
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    scatterChartInstance = new Chart(scatterCtx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Protein vs Carbs',
            data: labels.map((diet, index) => ({
              x: carbs[index],
              y: protein[index],
              label: diet
            }))
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Average Carbs (g)'
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Average Protein (g)'
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const point = context.raw;
                return `${point.label}: carbs ${point.x.toFixed(1)}, protein ${point.y.toFixed(1)}`;
              }
            }
          }
        }
      }
    });

    executionInfo.innerHTML = `
      <div>
        <strong>Azure Function Connected</strong><br />
        API Endpoint Loaded Successfully.<br />
        Execution Time: ${execTime} sec<br />
        Highest Protein Diet: ${highestProteinDiet}
      </div>
    `;

  } catch (error) {
    console.error('Azure insights error:', error);
    executionInfo.textContent = 'Could not load Azure insights. Check CORS or endpoint availability.';
    apiMessage.textContent = `Azure insights failed: ${error.message}`;
  }
}

async function handleLogin() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  setButtonLoading(loginBtn, true, 'Login');

  try {
    const user = await loginUser(email, password);
    openDashboard(user);
    loginPassword.value = '';
  } catch (error) {
    console.error('Login error:', error);
    alert(error.message || 'Login failed.');
  } finally {
    setButtonLoading(loginBtn, false, 'Login');
  }
}

async function handleRegister() {
  const name = registerName.value.trim();
  const email = registerEmail.value.trim();
  const password = registerPassword.value.trim();
  const confirmPassword = registerConfirmPassword.value.trim();

  if (!name || !email || !password || !confirmPassword) {
    alert('Please fill in all registration fields.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  if (password.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }

  setButtonLoading(registerBtn, true, 'Register');

  try {
    const user = await registerUser(name, email, password);
    openDashboard(user);

    registerName.value = '';
    registerEmail.value = '';
    registerPassword.value = '';
    registerConfirmPassword.value = '';
  } catch (error) {
    console.error('Register error:', error);
    alert(error.message || 'Registration failed.');
  } finally {
    setButtonLoading(registerBtn, false, 'Register');
  }
}

function handleLogout() {
  logoutUser();
  showAuth();
}

function handleApiButtons() {
  insightsBtn?.addEventListener('click', async () => {
    apiMessage.textContent = 'Loading Azure nutritional insights...';
    await renderChartsFromAzure();
    if (!apiMessage.textContent.includes('failed')) {
      apiMessage.textContent = 'Azure Function data loaded into charts successfully.';
    }
  });

  recipesBtn?.addEventListener('click', () => {
    apiMessage.textContent = 'Recipe search, filtering, and pagination are currently running on frontend demo data.';
  });

  clustersBtn?.addEventListener('click', () => {
    apiMessage.textContent = 'Cluster endpoint is not connected yet in this frontend version.';
  });
}

function initializeGoogleSignIn() {
  if (!window.google || !document.getElementById('googleSignInContainer')) return;

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      try {
        const user = await googleLogin(response.credential);
        openDashboard(user);
      } catch (error) {
        console.error('Google login error:', error);
        alert(error.message || 'Google login failed.');
      }
    }
  });

  window.google.accounts.id.renderButton(
    document.getElementById('googleSignInContainer'),
    {
      theme: 'outline',
      size: 'large',
      width: 260
    }
  );
}

function bindEvents() {
  loginTab?.addEventListener('click', () => switchTab('login'));
  registerTab?.addEventListener('click', () => switchTab('register'));

  loginBtn?.addEventListener('click', handleLogin);
  registerBtn?.addEventListener('click', handleRegister);
  logoutBtn?.addEventListener('click', handleLogout);

  searchInput?.addEventListener('input', () => {
    currentPage = 1;
    renderRecipes();
  });

  dietFilter?.addEventListener('change', () => {
    currentPage = 1;
    renderRecipes();
  });

  loginPassword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleLogin();
  });

  registerConfirmPassword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleRegister();
  });

  handleApiButtons();
}

async function startApp() {
  bindEvents();
  switchTab('login');

  const user = await verifyUser();

  if (user) {
    openDashboard(user);
  } else {
    showAuth();
  }

  setTimeout(() => {
    initializeGoogleSignIn();
  }, 200);
}

startApp();