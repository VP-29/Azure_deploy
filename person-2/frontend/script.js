import {
  loginUser,
  registerUser,
  logoutUser,
  getStoredUser,
  getToken,
  googleLogin,
  GOOGLE_CLIENT_ID
} from './auth.js';

const AZURE_BASE_URL = 'http://localhost:7071/api';
const AZURE_INSIGHTS_URL = `${AZURE_BASE_URL}/get_dashboard_data`;
const AZURE_RECIPES_URL = `${AZURE_BASE_URL}/search_recipes`;

const STATE_KEY = 'nutrition_dashboard_state';
const APP_INIT_KEY = 'nutrition_app_initialized';

let currentPage = 1;
const itemsPerPage = 4;
let dietOptionsLoaded = false;
let dashboardInitialized = false;
let eventsBound = false;

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

function getDefaultState() {
  return {
    currentPage: 1,
    search: '',
    diet: 'All'
  };
}

function saveDashboardState() {
  try {
    const state = {
      currentPage,
      search: searchInput?.value ?? '',
      diet: dietFilter?.value ?? 'All'
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Could not save dashboard state:', error);
  }
}

function loadDashboardState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return getDefaultState();

    const parsed = JSON.parse(raw);
    return {
      currentPage: Number(parsed.currentPage) > 0 ? Number(parsed.currentPage) : 1,
      search: typeof parsed.search === 'string' ? parsed.search : '',
      diet: typeof parsed.diet === 'string' ? parsed.diet : 'All'
    };
  } catch (error) {
    console.error('Could not load dashboard state:', error);
    return getDefaultState();
  }
}

function applySavedStateToInputs() {
  const state = loadDashboardState();

  currentPage = state.currentPage;

  if (searchInput) {
    searchInput.value = state.search;
  }

  if (dietFilter) {
    dietFilter.value = state.diet;
  }
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  loginTab?.classList.toggle('active', isLogin);
  registerTab?.classList.toggle('active', !isLogin);
  loginPanel?.classList.toggle('hidden', !isLogin);
  registerPanel?.classList.toggle('hidden', isLogin);
}

function setButtonLoading(button, loading, originalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? 'Please wait...' : originalText;
}

function showAuth() {
  dashboardView?.classList.add('hidden');
  authView?.classList.remove('hidden');
}

function showDashboard() {
  authView?.classList.add('hidden');
  dashboardView?.classList.remove('hidden');
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
      sessionStorage.removeItem(STATE_KEY);
      return null;
    }

    const data = await response.json();
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    console.error('Verify user error:', error);
    logoutUser();
    sessionStorage.removeItem(STATE_KEY);
    return null;
  }
}

async function openDashboard(user, forceRefresh = false) {
  const name = user?.name || getStoredUser()?.name || 'User';

  if (welcomeUser) {
    welcomeUser.textContent = `Welcome, ${name}`;
  }

  showDashboard();

  if (!dietOptionsLoaded) {
    await populateDietOptions();
    dietOptionsLoaded = true;
  }

  applySavedStateToInputs();

  if (dashboardInitialized && !forceRefresh) {
    return;
  }

  dashboardInitialized = true;

  if (!currentPage || currentPage < 1) {
    currentPage = 1;
  }
}

async function fetchAvailableDietOptions() {
  try {
    const res = await fetch(AZURE_INSIGHTS_URL);
    if (!res.ok) {
      throw new Error(`Insights API failed with status ${res.status}`);
    }

    const data = await res.json();
    const averages = data?.analysis?.averages_by_diet || {};

    return Object.keys(averages).sort();
  } catch (error) {
    console.error('Failed to fetch diet options:', error);
    return [];
  }
}

async function populateDietOptions() {
  if (!dietFilter) return;

  const savedState = loadDashboardState();
  const existingOptions = Array.from(dietFilter.options).map((option) =>
    option.value.toLowerCase()
  );

  const diets = await fetchAvailableDietOptions();

  diets.forEach((diet) => {
    if (!existingOptions.includes(diet.toLowerCase())) {
      const option = document.createElement('option');
      option.value = diet;
      option.textContent = diet;
      dietFilter.appendChild(option);
    }
  });

  const optionExists = Array.from(dietFilter.options).some(
    (option) => option.value === savedState.diet
  );

  dietFilter.value = optionExists ? savedState.diet : 'All';
}

async function fetchRecipesFromApi() {
  const keyword = encodeURIComponent(searchInput?.value.trim() || '');
  const selectedDiet = dietFilter?.value || 'All';
  const diet = selectedDiet === 'All' ? '' : encodeURIComponent(selectedDiet);
  const page = currentPage;

  const url = `${AZURE_RECIPES_URL}?q=${keyword}&diet=${diet}&page=${page}&limit=${itemsPerPage}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Recipe API failed with status ${res.status}`);
  }

  return res.json();
}

function renderPagination(totalPages) {
  if (!pagination) return;

  pagination.innerHTML = '';

  const safeTotalPages = Math.max(1, totalPages);
  const maxVisiblePages = 7;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'page-btn';
  prevBtn.textContent = 'Previous';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    if (currentPage > 1) {
      currentPage -= 1;
      saveDashboardState();
      await renderRecipes();
    }
  });
  pagination.appendChild(prevBtn);

  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = startPage + maxVisiblePages - 1;

  if (endPage > safeTotalPages) {
    endPage = safeTotalPages;
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    const firstBtn = document.createElement('button');
    firstBtn.type = 'button';
    firstBtn.className = `page-btn ${currentPage === 1 ? 'active' : ''}`;
    firstBtn.textContent = '1';
    firstBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      currentPage = 1;
      saveDashboardState();
      await renderRecipes();
    });
    pagination.appendChild(firstBtn);

    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.className = 'page-dots';
      dots.textContent = '...';
      pagination.appendChild(dots);
    }
  }

  for (let i = startPage; i <= endPage; i += 1) {
    const pageBtn = document.createElement('button');
    pageBtn.type = 'button';
    pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = `${i}`;
    pageBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      currentPage = i;
      saveDashboardState();
      await renderRecipes();
    });
    pagination.appendChild(pageBtn);
  }

  if (endPage < safeTotalPages) {
    if (endPage < safeTotalPages - 1) {
      const dots = document.createElement('span');
      dots.className = 'page-dots';
      dots.textContent = '...';
      pagination.appendChild(dots);
    }

    const lastBtn = document.createElement('button');
    lastBtn.type = 'button';
    lastBtn.className = `page-btn ${currentPage === safeTotalPages ? 'active' : ''}`;
    lastBtn.textContent = `${safeTotalPages}`;
    lastBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      currentPage = safeTotalPages;
      saveDashboardState();
      await renderRecipes();
    });
    pagination.appendChild(lastBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'page-btn';
  nextBtn.textContent = 'Next';
  nextBtn.disabled = currentPage === safeTotalPages;
  nextBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    if (currentPage < safeTotalPages) {
      currentPage += 1;
      saveDashboardState();
      await renderRecipes();
    }
  });
  pagination.appendChild(nextBtn);
}

async function renderRecipes() {
  if (!recipeList || !resultsInfo || !emptyState) return;

  try {
    saveDashboardState();

    const data = await fetchRecipesFromApi();
    const results = Array.isArray(data?.results) ? data.results : [];
    const paginationData = data?.pagination || {};
    const totalItems = Number(paginationData.total_items || 0);
    const totalPages = Number(paginationData.total_pages || 1);
    const current = Number(paginationData.current_page || currentPage);
    const limit = Number(paginationData.limit || itemsPerPage);

    currentPage = current;
    saveDashboardState();

    recipeList.innerHTML = '';
    emptyState.classList.toggle('hidden', results.length !== 0);

    if (results.length === 0) {
      resultsInfo.textContent = 'Showing 0 results';
      renderPagination(1);
      return;
    }

    const start = (current - 1) * limit + 1;
    const end = Math.min(start + results.length - 1, totalItems);
    resultsInfo.textContent = `Showing ${start}-${end} of ${totalItems} results`;

    results.forEach((recipe) => {
      const card = document.createElement('div');
      card.className = 'card recipe-card';

      const recipeName = recipe.Recipe_name || 'Unnamed Recipe';
      const recipeDiet = recipe.Diet_type || 'Unknown Diet';
      const recipeCuisine = recipe.Cuisine_type || 'Unknown Cuisine';
      const protein = recipe['Protein(g)'] ?? 'N/A';
      const carbs = recipe['Carbs(g)'] ?? 'N/A';
      const fat = recipe['Fat(g)'] ?? 'N/A';

      card.innerHTML = `
        <span class="meta">${recipeDiet}</span>
        <h4>${recipeName}</h4>
        <p>${recipeCuisine}</p>
        <p><strong>Protein:</strong> ${protein}g</p>
        <p><strong>Carbs:</strong> ${carbs}g</p>
        <p><strong>Fat:</strong> ${fat}g</p>
      `;

      recipeList.appendChild(card);
    });

    renderPagination(totalPages);
  } catch (error) {
    console.error('Recipe render error:', error);
    recipeList.innerHTML = '';
    emptyState.classList.remove('hidden');
    resultsInfo.textContent = 'Could not load recipes.';
    if (pagination) pagination.innerHTML = '';
    if (apiMessage) apiMessage.textContent = `Recipe API failed: ${error.message}`;
  }
}

async function fetchAzureInsights() {
  const response = await fetch(AZURE_INSIGHTS_URL);
  if (!response.ok) {
    throw new Error(`Azure API failed with status ${response.status}`);
  }
  return response.json();
}

function destroyCharts() {
  if (barChartInstance) {
    barChartInstance.destroy();
    barChartInstance = null;
  }
  if (pieChartInstance) {
    pieChartInstance.destroy();
    pieChartInstance = null;
  }
  if (scatterChartInstance) {
    scatterChartInstance.destroy();
    scatterChartInstance = null;
  }
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
    const recipeDistribution = apiData?.analysis?.recipe_distribution || {};
    const execTime = apiData?.execution_time_sec ?? 'N/A';
    const lastUpdated = apiData?.last_updated || 'N/A';

    const labels = Object.keys(averages);

    if (!labels.length) {
      executionInfo.textContent = 'Azure insights loaded, but no diet data was returned.';
      return;
    }

    const protein = labels.map((diet) =>
      Number(averages[diet]?.['Protein(g)'] ?? 0)
    );

    const carbs = labels.map((diet) =>
      Number(averages[diet]?.['Carbs(g)'] ?? 0)
    );

    const pieValues = labels.map((diet) =>
      Number(recipeDistribution[diet] || 0)
    );

    destroyCharts();

    const maxProtein = Math.max(...protein, 0);

    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Average Protein',
            data: protein
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: maxProtein > 0 ? maxProtein * 1.15 : 100,
            title: {
              display: true,
              text: 'Average Protein (g)'
            }
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
            label: 'Recipe Distribution',
            data: pieValues
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
            label: 'Carbs vs Protein',
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
        Last Updated: ${lastUpdated}<br />
        Execution Time: ${execTime} sec
      </div>
    `;
  } catch (error) {
    console.error('Azure insights error:', error);
    executionInfo.textContent = 'Could not load Azure insights. Check CORS or endpoint availability.';
    apiMessage.textContent = `Azure insights failed: ${error.message}`;
  }
}

async function handleLogin() {
  const email = loginEmail?.value.trim();
  const password = loginPassword?.value.trim();

  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  setButtonLoading(loginBtn, true, 'Login');

  try {
    const user = await loginUser(email, password);
    dashboardInitialized = false;
    await openDashboard(user, true);

    if (loginPassword) {
      loginPassword.value = '';
    }
  } catch (error) {
    console.error('Login error:', error);
    alert(error.message || 'Login failed.');
  } finally {
    setButtonLoading(loginBtn, false, 'Login');
  }
}

async function handleRegister() {
  const name = registerName?.value.trim();
  const email = registerEmail?.value.trim();
  const password = registerPassword?.value.trim();
  const confirmPassword = registerConfirmPassword?.value.trim();

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
    dashboardInitialized = false;
    await openDashboard(user, true);

    if (registerName) registerName.value = '';
    if (registerEmail) registerEmail.value = '';
    if (registerPassword) registerPassword.value = '';
    if (registerConfirmPassword) registerConfirmPassword.value = '';
  } catch (error) {
    console.error('Register error:', error);
    alert(error.message || 'Registration failed.');
  } finally {
    setButtonLoading(registerBtn, false, 'Register');
  }
}

function handleLogout() {
  logoutUser();
  sessionStorage.removeItem(STATE_KEY);
  dashboardInitialized = false;
  currentPage = 1;
  showAuth();
}

function handleApiButtons() {
  insightsBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    apiMessage.textContent = 'Loading Azure nutritional insights...';
    await renderChartsFromAzure();

    if (!apiMessage.textContent.includes('failed')) {
      apiMessage.textContent = 'Azure Function data loaded into charts successfully.';
    }
  });

  recipesBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    apiMessage.textContent = 'Loading recipes from Azure API...';

    saveDashboardState();
    await renderRecipes();

    if (!apiMessage.textContent.includes('failed')) {
      apiMessage.textContent = 'Recipe search, filter, and pagination are now using the Azure API.';
    }
  });
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  loginTab?.addEventListener('click', () => switchTab('login'));
  registerTab?.addEventListener('click', () => switchTab('register'));

  loginBtn?.addEventListener('click', handleLogin);
  registerBtn?.addEventListener('click', handleRegister);
  logoutBtn?.addEventListener('click', handleLogout);

  let searchDebounce;

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      currentPage = 1;
      saveDashboardState();
      await renderRecipes();
    }, 300);
  });

  dietFilter?.addEventListener('change', async () => {
    currentPage = 1;
    saveDashboardState();
    await renderRecipes();
  });

  loginPassword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLogin();
    }
  });

  registerConfirmPassword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleRegister();
    }
  });

  handleApiButtons();
}

function initializeGoogleSignIn() {
  const googleContainer = document.getElementById('googleSignInContainer');
  if (!window.google || !googleContainer) return;

  googleContainer.innerHTML = '';

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      try {
        const user = await googleLogin(response.credential);
        dashboardInitialized = false;
        await openDashboard(user, true);
      } catch (error) {
        console.error('Google login error:', error);
        alert(error.message || 'Google login failed.');
      }
    }
  });

  window.google.accounts.id.renderButton(googleContainer, {
    theme: 'outline',
    size: 'large',
    width: 260
  });
}

async function startApp() {
  if (window[APP_INIT_KEY]) {
    console.log('App already initialized, skipping duplicate start.');
    return;
  }

  window[APP_INIT_KEY] = true;

  bindEvents();
  switchTab('login');

  const user = await verifyUser();

  if (user) {
    await openDashboard(user, true);
  } else {
    showAuth();
  }

  setTimeout(() => {
    initializeGoogleSignIn();
  }, 200);
}

startApp();