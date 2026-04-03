const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const DEFAULT_PLACEHOLDER_IMAGE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23d1d5db'/><g fill='%239ca3af'><rect x='120' y='100' width='160' height='100' rx='12'/><circle cx='165' cy='138' r='18'/><path d='M140 185l35-32 28 24 27-20 30 28z'/></g></svg>";

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function ensureDatabase() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
        // 如果文件不存在，初始化一个基础结构
        const initialDb = { users: [], marketItems: [], requests: [], modules: [], moduleReviews: [] };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2));
    }
}

function readDb() {
    ensureDatabase();
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function json(res, statusCode, payload) {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
}

function notFound(res) {
    json(res, 404, { message: "Not found." });
}

function badRequest(res, message) {
    json(res, 400, { message });
}

function getPublicUser(user) {
    return {
        id: user.id,
        name: user.name,
        initial: user.initial,
        school: user.school,
        major: user.major,
        bio: user.bio || "",
        gender: user.gender,
        grade: user.grade,
        dorm: user.dorm,
        items: user.items || "0",
        likes: user.likes || "0"
    };
}

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateUserId(users) {
    let id = "";
    do {
        id = String(Math.floor(100000 + Math.random() * 900000));
    } while (users.some((user) => user.id === id));
    return id;
}

function schoolNameFromKey(key) {
    const schoolMap = {
        HUBU: "Hubei University (HUBU)",
        WHU: "Wuhan University (WHU)",
        HUST: "Huazhong Univ. of Sci. & Tech. (HUST)",
        WUST: "Wuhan Univ. of Sci. & Tech. (WUST)"
    };
    return schoolMap[key] || key;
}

function getUserById(userId, db) {
    return db.users.find((user) => user.id === userId);
}

// 修复点 1：让 normalizeCourseQuery 变聪明，支持别名查找
function normalizeCourseQuery(query, db) {
    const value = String(query || "").trim().toLowerCase();
    const matched = (db.modules || []).find(m => 
        m.code.toLowerCase() === value || 
        (m.aliases && m.aliases.map(a => a.toLowerCase()).includes(value))
    );
    return matched ? matched.courseKey : value;
}

function getModuleReviews(db) {
    return Array.isArray(db.moduleReviews) ? db.moduleReviews : [];
}

// 修复点 2：重写 buildModulePayload，彻底实现动态加载
function buildModulePayload(query, db) {
    const rawQuery = String(query || "").trim().toLowerCase();
    
    // 在数据库中寻找匹配的课程对象
    const foundModule = (db.modules || []).find(m => 
        m.code.toLowerCase() === rawQuery || 
        m.courseKey === rawQuery ||
        (m.aliases && m.aliases.map(a => a.toLowerCase()).includes(rawQuery))
    );

    if (foundModule) {
        const courseKey = foundModule.courseKey;
        // 动态抓取该课程的所有评论
        const reviews = getModuleReviews(db).filter((review) => review.courseKey === courseKey);
        // 动态关联该课程的市场物品
        const marketItems = (db.marketItems || [])
            .filter((item) => item.market === "module" && item.courseCode.toLowerCase() === courseKey)
            .map((item) => {
                const seller = getUserById(item.sellerId, db);
                return {
                    ...item,
                    seller: seller ? seller.name : item.seller || "Unknown",
                    sellerDorm: seller ? seller.dorm : item.sellerDorm || "Not Set"
                };
            });

        return {
            ...foundModule,
            reviews,
            marketItems,
            requirements: foundModule.requirements || ["No specific requirements listed."],
            assessment: foundModule.assessment || [],
            hasAiInsights: foundModule.hasAiInsights || false
        };
    }

    // 完全找不到时返回的基础模板
    return {
        code: rawQuery.toUpperCase(),
        name: rawQuery || "This Module",
        courseKey: rawQuery,
        hasAiInsights: false,
        requirements: [],
        assessment: [],
        rating: 0,
        difficulty: "Unrated",
        reviews: [],
        marketItems: []
    };
}

function withDerivedData(db) {
    return {
        users: db.users.map(getPublicUser),
        marketItems: (db.marketItems || []).map((item) => {
            const seller = getUserById(item.sellerId, db);
            return {
                ...item,
                seller: seller ? seller.name : item.seller || "Unknown",
                sellerDorm: seller ? seller.dorm : item.sellerDorm || "Not Set"
            };
        }),
        requests: (db.requests || []).map((request) => {
            const requester = getUserById(request.requesterId, db);
            return {
                ...request,
                requester: requester ? requester.name : request.requester || "Unknown"
            };
        }),
        modules: db.modules || []
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", () => {
            if (!raw) { resolve({}); return; }
            try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
        });
        req.on("error", reject);
    });
}

async function handleApi(req, res, url) {
    const db = readDb();

    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
        return json(res, 200, withDerivedData(db));
    }
    // ==========================================
    // 🤖 极客后门：真实调用 DeepSeek (结合真实评论总结)
    // ==========================================
    if (req.method === "POST" && url.pathname === "/api/generate-ai-insights") {
        const body = await readBody(req);
        const courseName = body.courseName || "Unknown Course";
        const courseCode = body.courseCode || "";

        
         // 1. 去数据库里把这门课的所有学长学姐评论揪出来
        const courseReviews = (db.moduleReviews || []).filter(r => r.courseKey === courseCode.toLowerCase());
        
        // ⛔ 核心产品逻辑：如果没有评论，直接拒绝调用 AI！
        if (courseReviews.length === 0) {
            return json(res, 400, { 
                success: false, 
                message: "No senior reviews yet. The AI needs real student reviews to generate a summary!" 
            });
        }

        const reviewTexts = courseReviews.map(r => `Review by ${r.authorName}: "${r.content}"`).join("\n");

        // ⚠️ 换成你的 DeepSeek API Key
        const API_KEY = "sk-ea33b58d0c3a4f88b39d82d76c91757a"; 
        const endpoint = "https://api.deepseek.com/chat/completions";
        const systemPrompt = `You are a strict review synthesizer. Output ONLY valid JSON. Do not invent information.`;
        
        // 2. 严厉警告 AI：只能基于评论总结！
        const userPrompt = `Analyze the course "${courseName}" (${courseCode}). 
        Here are the REAL student reviews from our database:
        """
        ${reviewTexts}
        """
        Based STRICTLY AND ONLY on the reviews above, return a JSON object with this exact structure:
        {
          "requirements": [
            "1 sentence summarizing the vibe or difficulty mentioned in the reviews.",
            "1 sentence summarizing any grading or exam rules mentioned in the reviews.",
            "1 sentence of the best practical advice from these reviews."
          ],
          "assessment": [
            // AI INSTRUCTION: Dynamically extract the grading components and their percentage weights from the reviews.
            // If the reviews mention "100% based on group report", output a single object with value 100.
            // Ensure the 'value' numbers strictly sum up to 100.
            // Pick a color from: "bg-blue-500", "bg-purple-500", "bg-brand-main".
            // Example format: { "label": "Group Coursework", "value": 100, "color": "bg-brand-main" }
          ]
        }`;
       

        try {
            const aiResponse = await fetch(endpoint, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}` 
                },
                body: JSON.stringify({ 
                    model: "deepseek-chat", 
                    response_format: { type: "json_object" }, 
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ]
                })
            });

            // ... (下方的 try-catch 解析和保存 db.json 的逻辑保持不变)
            const aiData = await aiResponse.json();
            let aiText = aiData.choices[0].message.content;
            aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsedInsights = JSON.parse(aiText);

            const moduleIndex = db.modules.findIndex(m => m.code.toLowerCase() === courseCode.toLowerCase());
            if (moduleIndex !== -1) {
                db.modules[moduleIndex].hasAiInsights = true;
                db.modules[moduleIndex].assessment = parsedInsights.assessment;
                db.modules[moduleIndex].requirements = parsedInsights.requirements;
                writeDb(db);
            }

            return json(res, 200, { success: true, insights: parsedInsights });
        } catch (error) {
            console.error("AI Generation Error:", error);
            return json(res, 500, { message: "AI generation failed." });
        }
    }
    if (req.method === "GET" && url.pathname === "/api/modules/search") {
        const module = buildModulePayload(url.searchParams.get("q"), db);
        return json(res, 200, { module });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
        const body = await readBody(req);
        if (!body.name || !body.major || !body.password || !body.confirmPassword) {
            return badRequest(res, "Please fill in all required fields.");
        }
        if (body.password !== body.confirmPassword) {
            return badRequest(res, "Passwords do not match.");
        }
        const newUser = {
            id: generateUserId(db.users),
            name: body.name.trim(),
            initial: body.name.trim().charAt(0).toUpperCase(),
            school: schoolNameFromKey(body.schoolKey),
            major: body.major.trim(),
            bio: body.bio?.trim() || "",
            gender: body.gender || "Prefer not to say",
            grade: body.grade || "Year 1",
            dorm: body.dorm?.trim() || "Not Set",
            password: body.password,
            items: "0",
            likes: "0"
        };
        db.users.push(newUser);
        writeDb(db);
        return json(res, 201, { user: getPublicUser(newUser) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readBody(req);
        const user = db.users.find((item) => item.id === body.userId && item.password === body.password);
        if (!user) {
            return json(res, 401, { message: "Invalid ID or password. Please try again." });
        }
        return json(res, 200, { user: getPublicUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/module-reviews") {
        const body = await readBody(req);
        const author = getUserById(body.authorId, db);
        if (!author) return badRequest(res, "Author does not exist.");
        
        // 修复点 3：这里也使用带 db 参数的 normalizeCourseQuery
        const courseKey = normalizeCourseQuery(body.courseKey, db);
        const review = {
            id: createId("review"),
            courseKey: courseKey,
            courseLabel: String(body.courseLabel || body.courseKey).trim(),
            authorName: author.name,
            authorInitial: author.initial,
            authorSchool: author.school,
            authorMajor: author.major || "Not Set",
            authorGender: author.gender,
            authorGrade: author.grade,
            authorDorm: author.dorm,
            likes: 0,
            rating: Number(body.rating),
            content: String(body.content).trim(),
            takenYear: String(body.takenYear || "2026").trim(),
            createdAt: body.createdAt || new Date().toISOString()
        };
        db.moduleReviews = db.moduleReviews || [];
        db.moduleReviews.unshift(review);
        writeDb(db);
        return json(res, 201, {
            review,
            module: buildModulePayload(review.courseKey, db)
        });
    }

    if (req.method === "POST" && url.pathname === "/api/market-items") {
        const body = await readBody(req);
        const seller = getUserById(body.sellerId, db);
        if (!seller) return badRequest(res, "Seller does not exist.");
        const item = {
            id: createId("item"),
            title: body.title.trim(),
            description: body.description.trim(),
            price: Number(body.price),
            image: body.image || DEFAULT_PLACEHOLDER_IMAGE,
            sellerId: seller.id,
            postedDate: body.postedDate || new Date().toISOString(),
            market: body.market,
            courseCode: body.courseCode || ""
        };
        db.marketItems = db.marketItems || [];
        db.marketItems.unshift(item);
        writeDb(db);
        return json(res, 201, { item: { ...item, seller: seller.name, sellerDorm: seller.dorm } });
    }

    if (req.method === "POST" && url.pathname === "/api/requests") {
        const body = await readBody(req);
        const requester = getUserById(body.requesterId, db);
        if (!requester) return badRequest(res, "Requester does not exist.");
        const requestItem = {
            id: createId("req"),
            title: body.title.trim(),
            description: body.description.trim(),
            requesterId: requester.id,
            postedDate: new Date().toISOString(),
            responses: 0,
            status: "ACTIVE"
        };
        db.requests = db.requests || [];
        db.requests.unshift(requestItem);
        writeDb(db);
        return json(res, 201, { request: { ...requestItem, requester: requester.name } });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/requests/")) {
        const requestId = decodeURIComponent(url.pathname.split("/").pop());
        const requesterId = url.searchParams.get("requesterId");
        const index = db.requests.findIndex((item) => item.id === requestId);
        if (index === -1) return notFound(res);
        if (db.requests[index].requesterId !== requesterId) {
            return json(res, 403, { message: "You can only withdraw your own requests." });
        }
        db.requests.splice(index, 1);
        writeDb(db);
        return json(res, 200, { success: true });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/market-items/")) {
        const itemId = decodeURIComponent(url.pathname.split("/").pop());
        const sellerId = url.searchParams.get("sellerId");
        const index = db.marketItems.findIndex((item) => item.id === itemId);
        if (index === -1) return notFound(res);
        if (db.marketItems[index].sellerId !== sellerId) {
            return json(res, 403, { message: "You can only unlist your own items." });
        }
        db.marketItems.splice(index, 1);
        writeDb(db);
        return json(res, 200, { success: true });
    }

    return notFound(res);
}

function serveStatic(req, res, url) {
    let filePath = url.pathname === "/" ? path.join(ROOT_DIR, "index.html") : path.join(ROOT_DIR, decodeURIComponent(url.pathname));
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === "ENOENT") {
                res.writeHead(404);
                res.end("Not found");
                return;
            }
            res.writeHead(500);
            res.end("Server error");
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
        res.end(content);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
        if (url.pathname.startsWith("/api/")) {
            await handleApi(req, res, url);
            return;
        }
        serveStatic(req, res, url);
    } catch (error) {
        json(res, 500, { message: error.message || "Internal server error." });
    }
});

server.listen(PORT, () => {
    console.log(`ModuHub server is running at http://localhost:${PORT}`);
});
