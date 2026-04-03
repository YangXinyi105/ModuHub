const API_BASE = "/api";
const DEFAULT_PLACEHOLDER_IMAGE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23d1d5db'/><g fill='%239ca3af'><rect x='120' y='100' width='160' height='100' rx='12'/><circle cx='165' cy='138' r='18'/><path d='M140 185l35-32 28 24 27-20 30 28z'/></g></svg>";

let currentUser = null;
let selectedMarket = null;
let shoppingCart = JSON.parse(localStorage.getItem("shoppingCart") || "[]");
let currentModule = null;
let reviewComposerOpen = false;
let pendingItemImage = "";
let serverCache = {
    users: [],
    marketItems: [],
    requests: [],
    modules: []
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function apiFetch(path, options = {}) {
    const config = {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    };

    const response = await fetch(`${API_BASE}${path}`, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

function syncLocalMirror() {
    localStorage.setItem("registeredUsers", JSON.stringify(serverCache.users));
    localStorage.setItem("marketItems", JSON.stringify(serverCache.marketItems));
    localStorage.setItem("requests", JSON.stringify(serverCache.requests));
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read image file."));
        reader.readAsDataURL(file);
    });
}

function getModuleReviewsContainer() {
    const section = document.getElementById("senior-insights-section");
    return section ? section.nextElementSibling : null;
}

function renderReviewComposer() {
    if (!reviewComposerOpen) {
        return "";
    }

    return `
        <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Add Your Review</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input id="module-review-year" type="text" placeholder="Took in 2026" class="md:col-span-1 px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-main">
                <select id="module-review-rating" class="md:col-span-1 px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-main">
                    <option value="5">5 - Excellent</option>
                    <option value="4">4 - Good</option>
                    <option value="3" selected>3 - Average</option>
                    <option value="2">2 - Tough</option>
                    <option value="1">1 - Very Tough</option>
                </select>
                <textarea id="module-review-content" rows="3" placeholder="Share tips, exam style, attendance rules, or what helped you most..." class="md:col-span-2 px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-main"></textarea>
            </div>
            <div class="mt-4 flex justify-end">
                <button onclick="submitModuleReview()" class="bg-brand-accent text-white px-5 py-2.5 rounded-xl font-bold hover:bg-orange-600 transition">Submit Review</button>
            </div>
        </div>
    `;
}

function toggleReviewComposer(forceOpen = null) {
    reviewComposerOpen = forceOpen === null ? !reviewComposerOpen : forceOpen;
    if (currentModule) {
        renderModuleReviews(currentModule);
    }
}

async function handleItemImageChange(event) {
    const file = event.target.files?.[0];
    const preview = document.getElementById("item-image-preview");

    if (!file) {
        pendingItemImage = "";
        if (preview) {
            preview.src = "";
            preview.classList.add("hidden");
        }
        return;
    }

    try {
        pendingItemImage = await readFileAsDataUrl(file);
        if (preview) {
            preview.src = pendingItemImage;
            preview.classList.remove("hidden");
        }
    } catch (error) {
        pendingItemImage = "";
        if (preview) {
            preview.src = "";
            preview.classList.add("hidden");
        }
        alert(error.message);
    }
}

function renderModuleAiSection(module) {
    const container = document.getElementById("ai-insights-section");
    if (!container || !module) {
        return;
    }

    if (module.hasAiInsights) {
        const assessment = module.assessment.map(item => `
            <div class="flex justify-between text-xs font-bold text-gray-600 mb-1 relative z-10"><span>${escapeHtml(item.label)}</span> <span>${item.value}%</span></div>
            <div class="w-full bg-blue-100 h-2 rounded-full mb-4 relative z-10"><div class="${escapeHtml(item.color)} h-2 rounded-full" style="width: ${item.value}%"></div></div>
        `).join("");

        container.innerHTML = `
            <div class="ai-gradient p-6 rounded-2xl border border-blue-200 shadow-sm relative overflow-hidden">
                <i class="fa-solid fa-robot absolute -right-4 -bottom-4 text-7xl text-blue-500 opacity-10"></i>
                <div class="flex items-center text-blue-700 font-bold mb-4">
                    <i class="fa-solid fa-wand-magic-sparkles mr-2"></i> AI Syllabus Synthesis: ${escapeHtml(module.name)}
                </div>
                <h3 class="font-bold text-gray-800 mb-4 border-l-4 border-brand-main pl-3 relative z-10">Assessment Structure</h3>
                ${assessment}
            </div>
            <div class="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                <h3 class="font-bold text-gray-800 mb-3 border-l-4 border-brand-main pl-3">Module Requirements</h3>

                <ul class="space-y-4 text-sm text-slate-700">
                 ${(module.requirements || []).map((req, index) => {
                    const icons = ["fa-book text-brand-main", "fa-triangle-exclamation text-orange-600", "fa-pen-to-square text-brand-main"];
                 return `<li class="flex items-start">
                     <i class="fa-solid ${icons[index % icons.length]} mr-2 mt-1"></i> 
                    <span>${escapeHtml(req)}</span>
                    </li>`;
                    }).join("")}
                 </ul>
                
            </div>
        `;
        return;
    }
   container.innerHTML = `
        <div class="lg:col-span-2 bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center transition-all duration-300">
            <i class="fa-solid fa-comments text-4xl text-gray-300 mb-4"></i>
            <h3 class="text-xl font-bold text-gray-700 mb-2">No AI Summary Yet</h3>
            <p class="text-gray-500 mb-6">Our AI engine can read all the senior reviews below and synthesize the core survival rules for this module.</p>
            
            <button id="ai-generate-btn" onclick="generateInsightsForThisCourse()" class="bg-brand-main text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-brand-dark transition-all transform hover:-translate-y-1">
                <i class="fa-solid fa-wand-magic-sparkles mr-2"></i> Synthesize Reviews with AI
            </button>
        </div>
    `;
}

function renderModuleReviews(module) {
    const reviewsContainer = getModuleReviewsContainer();
    const insightsHeader = document.getElementById("senior-insights-section");
    if (!reviewsContainer || !insightsHeader || !module) {
        return;
    }

    const countBadge = insightsHeader.querySelector(".text-sm.font-medium.text-gray-500");
    const ratingBadge = insightsHeader.querySelector(".text-yellow-500.font-bold");
    const controls = insightsHeader.querySelector(".flex.items-center.space-x-4");
    const heading = insightsHeader.querySelector("h2");
    if (heading) {
        heading.textContent = module.hasAiInsights ? "Senior Insights" : `${module.name} Reviews`;
    }
    if (countBadge) {
        countBadge.textContent = `${module.reviews.length} Review${module.reviews.length === 1 ? "" : "s"}`;
    }
    if (ratingBadge) {
        ratingBadge.innerHTML = module.reviews.length
            ? `<i class="fa-solid fa-star"></i> ${escapeHtml(module.rating || Number((module.reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / module.reviews.length).toFixed(1)))} / 5 (${escapeHtml(module.difficulty || "Mixed")})`
            : `<i class="fa-regular fa-star"></i> No rating yet`;
    }
    if (controls) {
        controls.innerHTML = `
            <button onclick="toggleReviewComposer(true)" class="bg-brand-accent text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-600 transition shadow-sm">
                <i class="fa-solid fa-pen mr-1"></i> Add Review
            </button>
            <span class="text-yellow-500 font-bold bg-yellow-50 px-3 py-1 rounded-lg">${ratingBadge ? ratingBadge.innerHTML : '<i class="fa-regular fa-star"></i> No rating yet'}</span>
        `;
    }

    const reviewsHtml = module.reviews.length
        ? module.reviews.map((review, index) => `
            <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition relative">
                ${index === 0 ? '<div class="absolute top-0 right-0 bg-red-50 text-red-500 text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl"><i class="fa-solid fa-fire mr-1"></i>HOT</div>' : ''}
                <div class="flex justify-between items-start mb-4 ${index === 0 ? 'mt-2' : ''}">
                    <div class="flex items-center cursor-pointer group" onclick="showUserProfile('${escapeHtml(review.authorName)}', '${escapeHtml(review.authorInitial)}', '${escapeHtml(review.authorSchool)}', '${escapeHtml(review.authorMajor || "Not Set")}', '${escapeHtml(review.authorGender)}', '${escapeHtml(review.authorGrade)}', '${escapeHtml(review.authorDorm)}', '0', '${escapeHtml(review.likes)}')">
                        <div class="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mr-3 group-hover:ring-4 ring-blue-100 transition duration-300">${escapeHtml(review.authorInitial)}</div>
                        <div>
                            <span class="font-bold text-gray-900 group-hover:text-brand-main transition">${escapeHtml(review.authorName)}</span>
                            <p class="text-xs text-gray-400">${escapeHtml(review.authorGrade)} | Took in ${escapeHtml(review.takenYear || "Unknown")}</p>
                        </div>
                    </div>
                    <button onclick="handleLike(this)" class="text-gray-400 hover:text-brand-accent transition flex items-center space-x-1 mt-1">
                        <i class="fa-solid fa-thumbs-up"></i>
                        <span class="font-bold text-sm">${escapeHtml(review.likes)}</span>
                    </button>
                </div>
                <p class="text-gray-700 text-sm italic leading-relaxed">"${escapeHtml(review.content)}"</p>
            </div>
        `).join("")
        : `
            <div class="bg-white p-8 rounded-2xl border border-dashed border-gray-300 text-center md:col-span-2">
                <i class="fa-regular fa-comments text-4xl text-gray-300 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700 mb-2">No Reviews Yet</h3>
                <p class="text-gray-500">Be the first student to share practical advice for this module.</p>
            </div>
        `;

    reviewsContainer.className = `mb-12 ${module.reviews.length ? "grid grid-cols-1 md:grid-cols-2 gap-6" : ""}`;
    reviewsContainer.innerHTML = renderReviewComposer() + reviewsHtml;
}

function renderModulePage(module) {
    currentModule = module;
    reviewComposerOpen = false;
    const aiTab = document.getElementById("ai-insights-tab");
    const reviewsTab = document.getElementById("reviews-tab");
    const marketTab = document.getElementById("module-market-tab");
    if (aiTab) {
        aiTab.classList.add("text-brand-main", "font-bold", "border-b-4", "border-brand-main");
        aiTab.classList.remove("text-gray-500", "font-medium");
    }
    if (reviewsTab) {
        reviewsTab.classList.remove("text-brand-main", "font-bold", "border-b-4", "border-brand-main");
        reviewsTab.classList.add("text-gray-500", "font-medium");
    }
    if (marketTab) {
        marketTab.classList.remove("text-brand-main", "font-bold", "border-b-4", "border-brand-main");
        marketTab.classList.add("text-gray-500", "font-medium");
    }
    renderModuleAiSection(module);
    renderModuleReviews(module);
    renderModuleMarketItems(module.courseKey || "");
}

function applyCurrentUserUI() {
    const signInBtn = document.getElementById("signInBtn");
    const userAvatar = document.getElementById("userAvatar");
    const postBtn = document.getElementById("postBtn");

    if (!signInBtn || !userAvatar || !postBtn) {
        return;
    }

    if (currentUser) {
        signInBtn.style.display = "none";
        userAvatar.style.display = "flex";
        postBtn.style.display = "block";
        userAvatar.innerText = currentUser.initial || currentUser.name?.charAt(0)?.toUpperCase() || "?";
    } else {
        signInBtn.style.display = "block";
        userAvatar.style.display = "none";
        postBtn.style.display = "none";
    }
}

function openCurrentUserProfile() {
    const profile = window.currentUser || currentUser || JSON.parse(localStorage.getItem("currentUser") || "null");
    if (!profile) {
        toggleAuthModal("login");
        return;
    }

    showUserProfile(
        profile.name || "",
        profile.initial || profile.name?.charAt(0)?.toUpperCase() || "?",
        profile.school || "Not Set",
        profile.major || "Not Set",
        profile.gender || "Not Set",
        profile.grade || "Not Set",
        profile.dorm || "Not Set",
        profile.items || profile.postedItems || "0",
        profile.likes || "0"
    );
}

function checkLoginStatus() {
    // 1. 从 LocalStorage 加载登录状态
    const savedUser = JSON.parse(localStorage.getItem("currentUser") || "null");
    
    // 2. 获取必要的UI元素
    const signInBtn = document.getElementById("signInBtn");
    const userAvatar = document.getElementById("userAvatar");
    const myRequestsNav = document.getElementById("nav-requests");
    const postBtn = document.getElementById("postBtn");

    if (savedUser) {
        // ========== 🟢 用户【已登录】状态 ==========
        // 挂载到全局变量，确保其他函数能访问
        currentUser = savedUser;
        window.currentUser = savedUser;
        
        // 同步到 serverCache
        if (serverCache.users && serverCache.users.length > 0) {
            const cachedUser = serverCache.users.find(user => user.id === savedUser.id);
            if (cachedUser) {
                currentUser = cachedUser;
                window.currentUser = cachedUser;
            }
        }

        // UI更新
        if (signInBtn) signInBtn.style.display = 'none';
        
        if (userAvatar) {
            userAvatar.style.display = 'flex';
            userAvatar.innerText = savedUser.initial || savedUser.name?.charAt(0)?.toUpperCase() || "?";
        }
        
        if (myRequestsNav) myRequestsNav.classList.remove('hidden');
        if (postBtn) postBtn.style.display = 'block';
        
    } else {
        // ========== 🔴 用户【未登录】状态 ==========
        currentUser = null;
        window.currentUser = null;

        // 显示登录按钮
        if (signInBtn) signInBtn.style.display = 'block';
        
        // 隐藏用户相关UI
        if (userAvatar) userAvatar.style.display = 'none';
        if (myRequestsNav) myRequestsNav.classList.add('hidden');
        if (postBtn) postBtn.style.display = 'none';
    }
}

async function loadBootstrap() {
    const data = await apiFetch("/bootstrap");
    serverCache = {
        users: data.users || [],
        marketItems: data.marketItems || [],
        requests: data.requests || [],
        modules: data.modules || []
    };
    syncLocalMirror();
}

function formatDateLabel(isoString) {
    if (!isoString) {
        return "Just now";
    }

    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        return "Just now";
    }

    return date.toLocaleDateString();
}

function formatRelativeDate(isoString) {
    if (!isoString) {
        return "Just now";
    }

    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) {
        return "Just now";
    }
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
        return "Yesterday";
    }
    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

    return formatDateLabel(isoString);
}

function toggleAuthModal(type = "login") {
    const modal = document.getElementById("auth-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    switchAuthTab(type);
}

function closeAuthModal() {
    const modal = document.getElementById("auth-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");

    const fields = [
        "login-id",
        "login-password",
        "register-name",
        "register-major",
        "register-password",
        "register-confirm-password",
        "register-dorm"
    ];

    fields.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = "";
        }
    });

    const gender = document.getElementById("register-gender");
    const grade = document.getElementById("register-grade");
    if (gender) gender.value = "Male";
    if (grade) grade.value = "Year 1";
}

function switchAuthTab(tab) {
    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    if (tab === "login") {
        loginTab.classList.add("text-brand-accent", "border-b-2", "border-brand-accent");
        loginTab.classList.remove("text-gray-400");
        registerTab.classList.add("text-gray-400");
        registerTab.classList.remove("text-brand-accent", "border-b-2", "border-brand-accent");
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");
        return;
    }

    registerTab.classList.add("text-brand-accent", "border-b-2", "border-brand-accent");
    registerTab.classList.remove("text-gray-400");
    loginTab.classList.add("text-gray-400");
    loginTab.classList.remove("text-brand-accent", "border-b-2", "border-brand-accent");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
}

async function handleRegister() {
    const payload = {
        name: document.getElementById("register-name").value.trim(),
        schoolKey: document.getElementById("register-school").value,
        major: document.getElementById("register-major").value.trim(),
        gender: document.getElementById("register-gender").value,
        grade: document.getElementById("register-grade").value,
        dorm: document.getElementById("register-dorm").value.trim(),
        password: document.getElementById("register-password").value.trim(),
        confirmPassword: document.getElementById("register-confirm-password").value.trim()
    };

    if (!payload.name || !payload.major || !payload.password || !payload.confirmPassword) {
        alert("Please fill in all required fields!");
        return;
    }

    if (payload.password !== payload.confirmPassword) {
        alert("Passwords do not match! Please try again.");
        return;
    }

    if (payload.password.length < 6) {
        alert("Password must be at least 6 characters long!");
        return;
    }

    try {
        const data = await apiFetch("/auth/register", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        serverCache.users.push(data.user);
        syncLocalMirror();
        alert(`Registration successful! Your unique ID is: ${data.user.id}\nDormitory: ${data.user.dorm}\nPlease save this ID for login.`);
        switchAuthTab("login");
    } catch (error) {
        alert(error.message);
    }
}

async function handleLogin() {
    const userId = document.getElementById("login-id").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!userId || !password) {
        alert("Please enter both ID and password!");
        return;
    }

    try {
        const data = await apiFetch("/auth/login", {
            method: "POST",
            body: JSON.stringify({ userId, password })
        });

        // 确保用户信息完整存储
        const fullUserInfo = {
            ...data.user,
            // 从serverCache获取完整用户信息
            ...(serverCache.users.find(u => u.id === data.user.id) || {})
        };

        // 保存到全局变量
        currentUser = fullUserInfo;
        window.currentUser = fullUserInfo;
        
        // 保存到localStorage
        localStorage.setItem("currentUser", JSON.stringify(fullUserInfo));
        
        // 同步到serverCache
        if (!serverCache.users.find(u => u.id === fullUserInfo.id)) {
            serverCache.users.push(fullUserInfo);
        }
        
        // 刷新缓存
        syncLocalMirror();
        
        // 更新UI
        checkLoginStatus();
        
        // 关闭登录模态框
        closeAuthModal();
        
        // 刷新相关视图
        renderMyRequests();
        renderMarketItems();
        
        alert(`Welcome back, ${fullUserInfo.name}!`);
    } catch (error) {
        alert(error.message);
    }
}

function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("currentUser");
        currentUser = null;
        window.currentUser = null;
        
        // 重置购物车
        shoppingCart = [];
        saveCart();
        updateCartCount();
        
        // 更新UI
        checkLoginStatus();
        
        // 重置视图
        showView("home-view");
        
        alert("You have been logged out successfully.");
    }
}

function handleLike(button) {
    const likeCount = button.querySelector("span");
    if (!likeCount) {
        return;
    }

    let count = parseInt(likeCount.innerText, 10) || 0;
    const isLiked = button.classList.contains("text-brand-accent");

    if (isLiked) {
        count = Math.max(0, count - 1);
        button.classList.remove("text-brand-accent");
        button.classList.add("text-gray-400");
    } else {
        count += 1;
        button.classList.remove("text-gray-400");
        button.classList.add("text-brand-accent");
    }

    likeCount.innerText = String(count);
}

function showView(viewId) {
    const views = ["home-view", "module-hub-view", "general-market-view", "my-requests-view", "all-requests-view"];

    views.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add("hidden");
            element.classList.remove("block");
        }
    });

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove("hidden");
        targetView.classList.add("block");
    }

    if (viewId === "module-hub-view") {
        document.getElementById("module-content").classList.remove("hidden");
        document.getElementById("module-content").classList.add("block");
        document.getElementById("no-results-message").classList.add("hidden");
        document.getElementById("no-results-message").classList.remove("block");
    }

    const navMap = {
        "module-hub-view": "nav-module",
        "general-market-view": "nav-market",
        "my-requests-view": "nav-requests",
        "all-requests-view": "nav-all-requests"
    };

    Object.values(navMap).forEach((id) => {
        const navItem = document.getElementById(id);
        if (navItem) {
            navItem.classList.remove("text-brand-accent", "border-b-2", "border-brand-accent");
            navItem.classList.add("text-gray-200");
        }
    });

    const activeNav = document.getElementById(navMap[viewId]);
    if (activeNav) {
        activeNav.classList.remove("text-gray-200");
        activeNav.classList.add("text-brand-accent", "border-b-2", "border-brand-accent");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function performModuleSearch(query, buttonId) {
    if (!query) {
        alert("Please enter a module code or module name first.");
        return;
    }

    const button = document.getElementById(buttonId);
    let originalText = "Search";
    if (button) {
        originalText = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
        button.classList.add("opacity-80", "cursor-not-allowed");
    }

    try {
        // ==========================================
        // 🔮 新增：前置模糊搜索魔法
        // ==========================================
        const lowerQuery = query.toLowerCase().trim();
        let exactSearchCode = query; // 默认使用用户输入的值

        // 在我们刚进网页时加载的本地课程列表 (serverCache.modules) 里进行模糊匹配
        if (serverCache.modules && serverCache.modules.length > 0) {
            const matchedModule = serverCache.modules.find(m => 
                (m.code && m.code.toLowerCase().includes(lowerQuery)) || 
                (m.name && m.name.toLowerCase().includes(lowerQuery)) || 
                (m.aliases && m.aliases.some(alias => alias.toLowerCase().includes(lowerQuery)))
            );

            // 如果匹配到了（比如输入 math 匹配到了 MATH101），就自动转换成标准代码
            if (matchedModule) {
                exactSearchCode = matchedModule.code;
            }
        }
        // ==========================================

        // 用转换后的精准代码去请求后端
        const data = await apiFetch(`/modules/search?q=${encodeURIComponent(exactSearchCode)}`);

        showView("module-hub-view");

        if (data.module) {
            localStorage.setItem("lastSearchedCourseCode", exactSearchCode);
            document.getElementById("module-content").classList.remove("hidden");
            document.getElementById("module-content").classList.add("block");
            document.getElementById("no-results-message").classList.add("hidden");
            document.getElementById("no-results-message").classList.remove("block");
            renderModulePage(data.module);
        } else {
            document.getElementById("module-content").classList.add("hidden");
            document.getElementById("module-content").classList.remove("block");
            document.getElementById("no-results-message").classList.remove("hidden");
            document.getElementById("no-results-message").classList.add("block");
        }
    } catch (error) {
        alert(error.message);
    } finally {
        if (button) {
            button.innerHTML = originalText;
            button.classList.remove("opacity-80", "cursor-not-allowed");
        }
    }
}

function simulateSearch() {
    const query = document.getElementById("searchInput")?.value.trim() || "";
    performModuleSearch(query, "searchBtn");
}

function searchModule() {
    const query = document.getElementById("moduleSearchInput")?.value.trim() || "";
    performModuleSearch(query, "moduleSearchBtn");
}

function scrollToSection(targetId, activeTabId) {
    showView("module-hub-view");

    ["ai-insights-tab", "reviews-tab", "module-market-tab"].forEach((tabId) => {
        const tab = document.getElementById(tabId);
        if (!tab) {
            return;
        }

        if (tabId === activeTabId) {
            tab.classList.add("text-brand-main", "font-bold", "border-b-4", "border-brand-main");
            tab.classList.remove("text-gray-500", "font-medium");
        } else {
            tab.classList.remove("text-brand-main", "font-bold", "border-b-4", "border-brand-main");
            tab.classList.add("text-gray-500", "font-medium");
        }
    });

    const targetElement = document.getElementById(targetId);
    if (targetElement) {
        window.scrollTo({
            top: targetElement.offsetTop - 80,
            behavior: "smooth"
        });
    }
}

function renderMarketItems() {
    const container = document.querySelector("#general-market-view .max-w-7xl.mx-auto.px-4.mt-8.grid");
    if (!container) {
        return;
    }

    const items = serverCache.marketItems.filter((item) => item.market === "general");
    container.innerHTML = items.map((item) => `
        <div onclick="showProductDetails(this)" class="market-item cursor-pointer bg-white rounded-xl border border-gray-100 overflow-hidden hover-lift group relative"
            data-name="${escapeHtml(item.title)}"
            data-image="${escapeHtml(item.image)}"
            data-title="${escapeHtml(item.title)}"
            data-price="${escapeHtml(item.price)}"
            data-seller="${escapeHtml(item.seller)}"
            data-seller-dorm="${escapeHtml(item.sellerDorm || "Not Set")}"
            data-date="${escapeHtml(formatRelativeDate(item.postedDate))}"
            data-description="${escapeHtml(item.description)}">
            
            ${window.currentUser && item.seller === window.currentUser.name ? `
            <button onclick="event.stopPropagation(); unlistMarketItem('${item.id}')" class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md z-10 hover:bg-red-600" title="Unlist Item">
                <i class="fa-solid fa-trash"></i>
            </button>
            ` : ''}
            
            <img src="${escapeHtml(item.image)}" class="w-full h-40 object-cover" alt="${escapeHtml(item.title)}">
            <div class="p-4">
                <h4 class="font-bold text-sm truncate-2-lines group-hover:text-brand-main transition">${escapeHtml(item.title)}</h4>
                <p class="text-brand-accent font-black mt-2">$${escapeHtml(item.price)}</p>
                <div class="mt-3 text-[10px] text-gray-400">User: ${escapeHtml(item.seller)} · ${escapeHtml(formatRelativeDate(item.postedDate))}</div>
            </div>
        </div>
    `).join("");
}

function renderModuleMarketItems(courseCode = "") {
    const container = document.querySelector("#module-market-section").nextElementSibling;
    if (!container) {
        return;
    }

    const keyword = courseCode.toLowerCase();
    const sourceItems = currentModule?.marketItems?.length
        ? currentModule.marketItems
        : serverCache.marketItems.filter((item) => item.market === "module");
    const items = sourceItems.filter((item) => {
        if (!keyword) {
            return true;
        }
        const itemCourse = (item.courseCode || "").toLowerCase();
        return itemCourse.includes(keyword) || keyword.includes(itemCourse);
    });

    container.innerHTML = items.length ? items.map((item) => {
        if (Number(item.price) === 0) {
            return `
                <div class="bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden shadow-sm relative hover-lift">
                    <span class="absolute top-0 right-0 bg-yellow-400 text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase shadow-sm">Digital Resource</span>
                    <div class="h-40 flex flex-col items-center justify-center text-blue-300">
                        <i class="fa-solid fa-file-pdf text-5xl mb-2"></i>
                    </div>
                    <div class="p-4">
                        <h4 class="font-bold text-sm">${escapeHtml(item.title)}</h4>
                        <p class="text-xs text-gray-400 mt-1">${escapeHtml(item.description)}</p>
                        <div class="flex justify-between items-center mt-4">
                            <span class="text-brand-accent font-black text-lg">FREE</span>
                            <button onclick="alert('Download link can be added later.')" class="bg-blue-100 text-blue-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-200 transition">Download</button>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div onclick="showProductDetails(this)" class="market-item cursor-pointer bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover-lift group relative"
                ${window.currentUser && item.sellerId === window.currentUser.id ? `
                <button onclick="event.stopPropagation(); unlistMarketItem('${item.id}')" class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-md z-10 hover:bg-red-600" title="Unlist Item">
                    <i class="fa-solid fa-trash"></i>
                </button>
                ` : ''}
                data-name="${escapeHtml(item.title)}"
                data-image="${escapeHtml(item.image)}"
                data-title="${escapeHtml(item.title)}"
                data-price="${escapeHtml(item.price)}"
                data-seller="${escapeHtml(item.seller)}"
                data-seller-dorm="${escapeHtml(item.sellerDorm || "Not Set")}"
                data-date="${escapeHtml(formatRelativeDate(item.postedDate))}"
                data-description="${escapeHtml(item.description)}">
                <img src="${escapeHtml(item.image)}" class="w-full h-40 object-cover" alt="${escapeHtml(item.title)}">
                <div class="p-4">
                    <h4 class="font-bold text-sm">${escapeHtml(item.title)}</h4>
                    <p class="text-xs text-gray-400 mt-1">${escapeHtml(item.description)}</p>
                    <div class="flex justify-between items-center mt-4">
                        <span class="text-brand-accent font-black text-lg">$${escapeHtml(item.price)}</span>
                        <button onclick="event.stopPropagation(); alert('Campus meet-up recommended for safety!')" class="bg-brand-main text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-brand-dark transition">Contact</button>
                    </div>
                </div>
            </div>
        `;
    }).join("") : `
        <div class="md:col-span-3 bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center">
            <i class="fa-solid fa-store text-4xl text-gray-300 mb-4"></i>
            <h3 class="text-xl font-bold text-gray-700 mb-2">No Module Market Items Yet</h3>
            <p class="text-gray-500">Students can still post textbooks, notes, and tools for this course.</p>
        </div>
    `;
}

function filterMarketItems() {
    const query = document.getElementById("marketSearchInput")?.value.toLowerCase().trim() || "";
    document.querySelectorAll(".market-item").forEach((item) => {
        const name = (item.getAttribute("data-name") || "").toLowerCase();
        item.style.display = !query || name.includes(query) ? "block" : "none";
    });
}

function showProductDetails(element) {
    const title = element.getAttribute("data-title");
    const price = element.getAttribute("data-price");
    const image = element.getAttribute("data-image");
    const seller = element.getAttribute("data-seller");
    const description = element.getAttribute("data-description");
    const date = element.getAttribute("data-date");
    const dorm = element.getAttribute("data-seller-dorm") || "Not Set";

    document.getElementById("product-title").innerText = title;
    document.getElementById("product-price").innerText = `$${price}`;
    document.getElementById("product-image").src = image;
    document.getElementById("seller-name").innerText = seller;
    document.getElementById("product-date").innerText = date;
    document.getElementById("product-description").innerText = description;
    document.getElementById("dorm-info").innerText = dorm;

    window.currentProduct = {
        title,
        price: Number(price),
        image,
        seller,
        dorm,
        description
    };

    const modal = document.getElementById("product-detail-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeProductModal() {
    const modal = document.getElementById("product-detail-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

function saveCart() {
    localStorage.setItem("shoppingCart", JSON.stringify(shoppingCart));
}

function addToCart() {
    if (!window.currentProduct) {
        return;
    }

    const existingItem = shoppingCart.find((item) => item.title === window.currentProduct.title);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        shoppingCart.push({
            ...window.currentProduct,
            quantity: 1
        });
    }

    saveCart();
    updateCartCount();
    closeProductModal();
    alert(`"${window.currentProduct.title}" has been added to your cart!`);
}

function updateCartCount() {
    const cartCount = document.getElementById("cart-count");
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = String(totalItems);
}

function showCart() {
    updateCartDisplay();
    const modal = document.getElementById("cart-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeCartModal() {
    const modal = document.getElementById("cart-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

function updateCartDisplay() {
    const cartItems = document.getElementById("cart-items");
    const emptyCart = document.getElementById("empty-cart");
    const cartTotal = document.getElementById("cart-total");

    if (shoppingCart.length === 0) {
        cartItems.innerHTML = "";
        emptyCart.classList.remove("hidden");
        cartTotal.textContent = "$0.00";
        return;
    }

    emptyCart.classList.add("hidden");

    let totalPrice = 0;
    cartItems.innerHTML = shoppingCart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        totalPrice += itemTotal;

        return `
            <div class="flex items-center space-x-4 bg-gray-50 p-4 rounded-lg">
                <img src="${escapeHtml(item.image)}" class="w-16 h-16 object-cover rounded-lg" alt="${escapeHtml(item.title)}">
                <div class="flex-grow">
                    <h4 class="font-bold text-gray-900">${escapeHtml(item.title)}</h4>
                    <p class="text-sm text-gray-600">Seller: ${escapeHtml(item.seller)}</p>
                    <p class="text-brand-accent font-bold">$${escapeHtml(item.price)}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="updateQuantity(${index}, -1)" class="bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 transition">-</button>
                    <span class="font-bold w-8 text-center">${item.quantity}</span>
                    <button onclick="updateQuantity(${index}, 1)" class="bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 transition">+</button>
                </div>
                <div class="text-right min-w-[80px]">
                    <p class="font-bold text-gray-900">$${itemTotal.toFixed(2)}</p>
                    <button onclick="removeFromCart(${index})" class="text-red-500 text-sm hover:text-red-700 mt-1">Remove</button>
                </div>
            </div>
        `;
    }).join("");

    cartTotal.textContent = `$${totalPrice.toFixed(2)}`;
}

function updateQuantity(index, change) {
    shoppingCart[index].quantity += change;
    if (shoppingCart[index].quantity <= 0) {
        shoppingCart.splice(index, 1);
    }
    saveCart();
    updateCartCount();
    updateCartDisplay();
}

function removeFromCart(index) {
    shoppingCart.splice(index, 1);
    saveCart();
    updateCartCount();
    updateCartDisplay();
}

function updateSellerInfoDisplay() {
    const sellersList = document.getElementById("sellers-list");
    if (!sellersList) {
        return;
    }

    const uniqueSellers = [...new Set(shoppingCart.map((item) => item.seller))];
    sellersList.innerHTML = uniqueSellers.map((seller) => {
        const sellerItems = shoppingCart.filter((item) => item.seller === seller);
        const dorm = sellerItems[0]?.dorm || "Not Set";

        return `
            <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div class="space-y-2">
                    <div class="flex items-center">
                        <i class="fa-solid fa-user text-gray-400 mr-2 w-5"></i>
                        <span class="text-gray-700 font-medium">${escapeHtml(seller)}</span>
                    </div>
                    <div class="flex items-center">
                        <i class="fa-solid fa-building text-blue-500 mr-2 w-5"></i>
                        <span class="text-blue-600 font-medium">${escapeHtml(dorm)}</span>
                    </div>
                    <div class="flex items-center">
                        <i class="fa-solid fa-shopping-bag text-green-500 mr-2 w-5"></i>
                        <span class="text-gray-600 text-sm">${sellerItems.length} items</span>
                    </div>
                </div>
                <button onclick="contactSeller('${escapeHtml(seller)}')" class="w-full mt-4 bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 transition shadow-md flex items-center justify-center space-x-2">
                    <i class="fa-solid fa-comment-dots"></i>
                    <span>Contact Seller</span>
                </button>
            </div>
        `;
    }).join("");
}

function contactSeller(specificSeller = null) {
    if (shoppingCart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const sellers = specificSeller
        ? [specificSeller]
        : [...new Set(shoppingCart.map((item) => item.seller))];

    const message = sellers.map((seller, index) => {
        const items = shoppingCart.filter((item) => item.seller === seller);
        const dorm = items[0]?.dorm || "Not Set";
        return `${index + 1}. ${seller}\n   Dormitory: ${dorm}\n   Items: ${items.map((item) => item.title).join(", ")}`;
    }).join("\n\n");

    alert(`Seller Contact Information:\n\n${message}\n\nPlease reach out to the seller(s) directly to arrange the transaction.`);
}

function checkout() {
    if (shoppingCart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;
    const total = document.getElementById("cart-total").textContent;

    if (paymentMethod === "online") {
        const confirmed = confirm(`Total amount: ${total}\n\nYou will be redirected to online payment.\nDo you want to proceed?`);
        if (!confirmed) {
            return;
        }

        shoppingCart = [];
        saveCart();
        updateCartCount();
        closeCartModal();
        alert("Payment successful!");
        return;
    }

    updateSellerInfoDisplay();
    contactSeller();
}

function openPostModal() {
    // 检查登录状态
    if (!window.currentUser) {
        alert("Please login first to post items.");
        toggleAuthModal("login");
        return;
    }
    
    closePostRequestModal();
    document.getElementById("post-modal").classList.remove("hidden");
    document.getElementById("post-modal").classList.add("flex");
    selectedMarket = null;
    resetPostForm();
}

function closePostModal() {
    document.getElementById("post-modal").classList.add("hidden");
    document.getElementById("post-modal").classList.remove("flex");
}

function selectMarket(market) {
    selectedMarket = market;

    document.getElementById("module-market-btn").classList.remove("border-brand-main", "text-brand-main");
    document.getElementById("general-market-btn").classList.remove("border-brand-main", "text-brand-main");

    if (market === "module") {
        document.getElementById("module-market-btn").classList.add("border-brand-main", "text-brand-main");
        document.getElementById("course-code-section").classList.remove("hidden");
    } else {
        document.getElementById("general-market-btn").classList.add("border-brand-main", "text-brand-main");
        document.getElementById("course-code-section").classList.add("hidden");
    }
}

function resetPostForm() {
    document.getElementById("module-market-btn").classList.remove("border-brand-main", "text-brand-main");
    document.getElementById("general-market-btn").classList.remove("border-brand-main", "text-brand-main");
    document.getElementById("course-code-section").classList.add("hidden");
    document.getElementById("course-code").value = "";
    document.getElementById("item-title").value = "";
    document.getElementById("item-description").value = "";
    document.getElementById("item-price").value = "";
    document.getElementById("item-image").value = "";
    pendingItemImage = "";
    const preview = document.getElementById("item-image-preview");
    if (preview) {
        preview.src = "";
        preview.classList.add("hidden");
    }
}

async function postItem() {
    if (!window.currentUser) {
        alert("Your session has expired. Please login again.");
        toggleAuthModal("login");
        return;
    }

    if (!selectedMarket) {
        alert("Please select a market to post the item.");
        return;
    }

    const title = document.getElementById("item-title").value.trim();
    const description = document.getElementById("item-description").value.trim();
    const price = document.getElementById("item-price").value.trim();
    const courseCode = selectedMarket === "module" ? document.getElementById("course-code").value.trim() : "";

    if (!title || !description || !price) {
        alert("Please fill in all required fields.");
        return;
    }

    if (selectedMarket === "module" && !courseCode) {
        alert("Please enter course code or name for Module Market.");
        return;
    }

    try {
        const data = await apiFetch("/market-items", {
            method: "POST",
            body: JSON.stringify({
                title,
                description,
                price: Number(price),
                market: selectedMarket,
                courseCode,
                sellerId: window.currentUser.id,
                image: pendingItemImage || DEFAULT_PLACEHOLDER_IMAGE,
                postedDate: new Date().toISOString()
            })
        });

        serverCache.marketItems.unshift(data.item);
        syncLocalMirror();
        closePostModal();
        alert("Item posted successfully!");

        if (selectedMarket === "module") {
            localStorage.setItem("lastSearchedCourseCode", courseCode);
            showView("module-hub-view");
            renderModuleMarketItems(courseCode);
        } else {
            renderMarketItems();
            showView("general-market-view");
        }
    } catch (error) {
        alert(error.message);
    }
}

function openPostRequestModal() {
    // 检查登录状态
    if (!window.currentUser) {
        alert("Please login first to post requests.");
        toggleAuthModal("login");
        return;
    }
    
    closePostModal();
    document.getElementById("post-request-modal").classList.remove("hidden");
    document.getElementById("post-request-modal").classList.add("flex");
    resetRequestForm();
}

function closePostRequestModal() {
    document.getElementById("post-request-modal").classList.add("hidden");
    document.getElementById("post-request-modal").classList.remove("flex");
}

function resetRequestForm() {
    document.getElementById("request-title").value = "";
    document.getElementById("request-description").value = "";
}

async function postRequest() {
    // 双重检查登录状态
    if (!window.currentUser) {
        alert("Your session has expired. Please login again.");
        toggleAuthModal("login");
        return;
    }

    const title = document.getElementById("request-title").value.trim();
    const description = document.getElementById("request-description").value.trim();

    if (!title || !description) {
        alert("Please fill in all required fields.");
        return;
    }

    try {
        const data = await apiFetch("/requests", {
            method: "POST",
            body: JSON.stringify({
                title,
                description,
                requesterId: window.currentUser.id
            })
        });

        serverCache.requests.unshift(data.request);
        syncLocalMirror();
        closePostRequestModal();
        renderMyRequests();
        renderAllRequests();
        showView("my-requests-view");
        alert("Request posted successfully!");
    } catch (error) {
        alert(error.message);
    }
}

async function submitModuleReview() {
    if (!window.currentUser) {
        alert("Please login first to add a review.");
        toggleAuthModal("login");
        return;
    }

    if (!currentModule) {
        alert("Please search for a module first.");
        return;
    }

    const content = document.getElementById("module-review-content")?.value.trim() || "";
    const rating = document.getElementById("module-review-rating")?.value || "3";
    const takenYear = document.getElementById("module-review-year")?.value.trim() || "2026";

    if (!content) {
        alert("Please write a short review before submitting.");
        return;
    }

    try {
        const data = await apiFetch("/module-reviews", {
            method: "POST",
            body: JSON.stringify({
                courseKey: currentModule.courseKey,
                courseLabel: currentModule.name,
                content,
                rating,
                takenYear,
                authorId: window.currentUser.id,
                createdAt: new Date().toISOString()
            })
        });

        currentModule = data.module;
        renderModulePage(currentModule);
        alert("Review posted successfully!");
    } catch (error) {
        alert(error.message);
    }
}

function renderAllRequests() {
    const container = document.getElementById("all-requests-container");
    if (!container) return;

    const requests = serverCache.requests;

    container.innerHTML = requests.length ? requests.map((request) => {
        const isOwnRequest = window.currentUser && request.requesterId === window.currentUser.id;

        return `
        <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center hover:border-brand-main transition">
            <div>
                <div class="flex items-center space-x-2 mb-2">
                    <span class="bg-blue-100 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded">WANTED</span>
                    <span class="text-gray-400 text-xs">By: ${escapeHtml(request.requester)} · Posted: ${escapeHtml(formatDateLabel(request.postedDate))}</span>
                </div>
                <h3 class="font-bold text-lg text-gray-900">${escapeHtml(request.title)}</h3>
                <p class="text-sm text-gray-500 mt-1">${escapeHtml(request.description)}</p>
            </div>
            <div class="text-right flex flex-col items-end">
                <p class="text-brand-main font-bold mb-3">${request.responses || 0} Response${(request.responses || 0) === 1 ? "" : "s"}</p>
                ${isOwnRequest 
                    ? `<span class="bg-gray-100 text-gray-400 px-4 py-2 rounded-lg text-xs font-bold">Your Request</span>`
                    : `<button onclick="respondToRequest('${escapeHtml(request.id)}')" class="bg-brand-main text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-brand-dark transition shadow-md flex items-center"><i class="fa-solid fa-reply mr-2"></i> Respond</button>`
                }
            </div>
        </div>
        `;
    }).join("") : `
        <div class="bg-white p-8 rounded-2xl border border-dashed border-gray-300 text-center">
            <i class="fa-solid fa-clipboard-list text-4xl text-gray-300 mb-4"></i>
            <h3 class="text-xl font-bold text-gray-700 mb-2">No Community Requests</h3>
            <p class="text-gray-500">Check back later to see if anyone needs help.</p>
        </div>
    `;
}

async function respondToRequest(requestId) {
    // 1. 去本地仓库拿取当前登录的真实用户信息
    const userStr = localStorage.getItem("currentUser");
    if (!userStr) {
        alert("Please sign in first to respond to requests.");
        toggleAuthModal("login");
        return;
    }
    
    // 把字符串转成对象，这里面就是你的 Ninglu Shi 的数据
    const loggedInUser = JSON.parse(userStr);

    // 2. 在本地缓存中找到这个具体的请求
    const request = serverCache.requests.find((r) => r.id === requestId);
    if (!request) {
        alert("Error: Request not found.");
        return;
    }

    // 3. 真实逻辑防呆：不能响应自己的请求
    // 看看请求的主人是不是当前登录用户的 name 或 id
    if (request.requester === loggedInUser.name || request.requesterId === loggedInUser.id) {
        alert("You cannot respond to your own request!");
        return;
    }

    // 4. 去用户库里揪出这个发帖人的真实信息 (宿舍)
    let requesterDorm = "Dorm info not provided";
    let requesterName = request.requester || "the buyer";
    
    if (serverCache.users) {
        const targetUser = serverCache.users.find(u => u.name === request.requester || u.id === request.requesterId);
        if (targetUser) {
            requesterName = targetUser.name;
            requesterDorm = targetUser.dorm || "Off-campus";
        }
    }

    // 5. 弹出一个真实的确认框
    const confirmMessage = `Do you want to offer your item for:\n"${request.title}"?\n\nIf you click OK, we will share their dorm location with you.`;
    if (!confirm(confirmMessage)) {
        return; // 用户点了取消
    }

    // 6. 核心动作：更新响应人数，并展示联系方式
    try {
        request.responses = (request.responses || 0) + 1;
        
        // 弹出真实的联系方式
        alert(`✅ Success!\n\nContact Info for ${requesterName}:\n📍 Location: ${requesterDorm}\n\nPlease go to their dorm or contact them via campus network to complete the trade.`);
        
        // 刷新列表，让 Response 数量变成 +1 后的样子
        if (typeof renderAllRequests === 'function') {
            renderAllRequests();
        }

    } catch (error) {
        alert("Failed to send response: " + error.message);
    }
}

function renderMyRequests() {
    const container = document.querySelector("#my-requests-view .space-y-4");
    if (!container) {
        return;
    }

    const requests = window.currentUser
        ? serverCache.requests.filter((request) => request.requesterId === window.currentUser.id)
        : serverCache.requests;

    container.innerHTML = requests.map((request) => `
        <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center hover:border-brand-main transition">
            <div>
                <div class="flex items-center space-x-2 mb-2">
                    <span class="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded">${escapeHtml(request.status || "ACTIVE")}</span>
                    <span class="text-gray-400 text-xs">Posted: ${escapeHtml(formatDateLabel(request.postedDate))}</span>
                </div>
                <h3 class="font-bold text-lg text-gray-900">${escapeHtml(request.title)}</h3>
                <p class="text-sm text-gray-500 mt-1">${escapeHtml(request.description)}</p>
            </div>
            <div class="text-right">
                <p class="text-brand-main font-bold">${request.responses} Response${request.responses === 1 ? "" : "s"}</p>
                ${window.currentUser && request.requesterId === window.currentUser.id ? `<button onclick="withdrawRequest('${escapeHtml(request.id)}')" class="text-xs text-gray-400 hover:text-red-500 mt-4 underline">Withdraw Request</button>` : ""}
            </div>
        </div>
    `).join("");
}

async function withdrawRequest(requestId) {
    if (!window.currentUser) {
        alert("Please login first.");
        toggleAuthModal("login");
        return;
    }

    if (!confirm("Are you sure you want to withdraw this request?")) {
        return;
    }

    try {
        await apiFetch(`/requests/${encodeURIComponent(requestId)}?requesterId=${encodeURIComponent(window.currentUser.id)}`, {
            method: "DELETE"
        });

        serverCache.requests = serverCache.requests.filter((request) => request.id !== requestId);
        syncLocalMirror();
        renderMyRequests();
        alert("Request withdrawn successfully!");
    } catch (error) {
        alert(error.message);
    }
}

async function unlistMarketItem(itemId) {
    if (!window.currentUser) {
        alert("Please login first to unlist items.");
        toggleAuthModal("login");
        return;
    }
    
    if (!confirm("Are you sure you want to unlist this item? It will be permanently removed from the market.")) {
        return;
    }

    try {
        await apiFetch(`/market-items/${encodeURIComponent(itemId)}?sellerId=${encodeURIComponent(window.currentUser.id)}`, {
            method: "DELETE"
        });

        // 更新本地缓存
        serverCache.marketItems = serverCache.marketItems.filter(item => item.id !== itemId);
        syncLocalMirror();
        
        // 重新渲染市场视图
        renderMarketItems();
        if (currentModule) {
            renderModuleMarketItems(currentModule.courseKey);
        }
        
        alert("Item unlisted successfully!");
    } catch (error) {
        alert(error.message);
    }
}

function updateUserPostedItems() {
    syncLocalMirror();
}

// 会话超时检查
function checkSessionTimeout() {
    const lastActivity = localStorage.getItem("lastActivity");
    if (lastActivity) {
        const idleTime = Date.now() - parseInt(lastActivity);
        const timeoutDuration = 60 * 60 * 1000; // 1小时超时
        
        if (idleTime > timeoutDuration) {
            logout();
            alert("Your session has expired due to inactivity. Please login again.");
        }
    }
    
    // 更新最后活动时间
    localStorage.setItem("lastActivity", Date.now());
}

// 初始化
document.addEventListener("DOMContentLoaded", async function (){
    // 添加会话活动监听
    document.addEventListener("click", checkSessionTimeout);
    document.addEventListener("keypress", checkSessionTimeout);
    
    // 初始化最后活动时间
    if (!localStorage.getItem("lastActivity")) {
        localStorage.setItem("lastActivity", Date.now());
    }
    
    // 监听搜索框的回车键
    const mainSearchInput = document.getElementById("searchInput");
    if (mainSearchInput) {
        mainSearchInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                simulateSearch();
            }
        });
    }

    const moduleSearchInput = document.getElementById("moduleSearchInput");
    if (moduleSearchInput) {
        moduleSearchInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                searchModule();
            }
        });
    }
    
    const registerBtn = document.getElementById("registerBtn");
    if (registerBtn) {
        registerBtn.addEventListener("click", handleRegister);
    }

    const postBtn = document.getElementById("postBtn");
    if (postBtn) {
        postBtn.addEventListener("click", function () {
            if (!window.currentUser) {
                alert("Please login first to post.");
                toggleAuthModal("login");
                return;
            }
            
            openPostModal();
        });
    }

    // 初始化加载
    try {
        await loadBootstrap();
        // 首先检查登录状态
        checkLoginStatus();
        
        // 然后加载其他数据
        renderMarketItems();
        renderMyRequests();
        renderAllRequests();

        const lastSearchedCourseCode = localStorage.getItem("lastSearchedCourseCode");
        if (lastSearchedCourseCode) {
            const data = await apiFetch(`/modules/search?q=${encodeURIComponent(lastSearchedCourseCode)}`);
            if (data.module) {
                renderModulePage(data.module);
            }
        }
    } catch (error) {
        console.error("Initialization error:", error);
        alert("Failed to load backend data. Start the local server and refresh.");
    }

    updateCartCount();
});

// ==========================================
// 🤖 正式功能：前端一键召唤 DeepSeek AI
// ==========================================
async function generateInsightsForThisCourse() {
    // 1. 确保当前有选中的课程
    if (!currentModule) return;

    // 2. UX 细节：让按钮变成“加载中”的状态
    const btn = document.getElementById("ai-generate-btn");
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> AI is thinking... (approx 5s)';
        btn.disabled = true; // 禁用按钮，防止狂点
        btn.classList.add("opacity-70", "cursor-not-allowed");
    }

    try {
        // 3. 原封不动地把你之前在控制台敲的代码搬过来！
        const response = await fetch('/api/generate-ai-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                courseCode: currentModule.courseKey, 
                courseName: currentModule.name 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 4. 成功拿到 AI 的数据后，更新当前页面的内存数据
            currentModule.hasAiInsights = true;
            currentModule.assessment = data.insights.assessment;
            currentModule.requirements = data.insights.requirements;
            
            // 5. 见证奇迹：重新渲染这一块区域！灰色框瞬间变成彩色进度条！
            renderModuleAiSection(currentModule);
        } else {
            alert("AI generation failed: " + (data.message || "Unknown error"));
        }
    } catch (error) {
        alert("Network error connecting to AI: " + error.message);
    } finally {
        // 如果生成失败，把按钮恢复原样
        if (btn && !currentModule.hasAiInsights) {
            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i> Generate AI Insights Now';
            btn.disabled = false;
            btn.classList.remove("opacity-70", "cursor-not-allowed");
        }
    }
}
