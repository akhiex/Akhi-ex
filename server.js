// server.js - PRODUCTION DEPLOYMENT VERSION WITH GITHUB STORAGE
const express = require('express');
const axios = require('axios'); // Added for GitHub API
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// GitHub Configuration - SET THESE IN RENDER ENVIRONMENT VARIABLES
const GITHUB = {
    owner: process.env.GITHUB_OWNER || 'your-github-username', // Your GitHub username
    repo: process.env.GITHUB_REPO || 'akhi-questions-database', // Repo for storing questions
    token: process.env.GITHUB_TOKEN, // Your GitHub Personal Access Token
    branch: 'main',
    filePath: 'questions.json'
};

// Log GitHub config (without exposing token)
console.log('GitHub Config:', {
    owner: GITHUB.owner,
    repo: GITHUB.repo,
    hasToken: !!GITHUB.token,
    branch: GITHUB.branch
});

// GitHub API client
const githubAPI = axios.create({
    baseURL: 'https://api.github.com',
    headers: {
        'Authorization': `token ${GITHUB.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Akhi-ex-responds-App'
    }
});

// Keep local directory for fallback (optional)
const DATA_DIR = path.join(process.cwd(), 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================
// GITHUB STORAGE FUNCTIONS
// ============================================

// Read questions from GitHub
async function readQuestionsFromGitHub() {
    try {
        console.log('📖 Reading questions from GitHub...');
        
        if (!GITHUB.token) {
            throw new Error('GitHub token not configured');
        }
        
        const url = `/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.filePath}?ref=${GITHUB.branch}`;
        console.log('GitHub URL:', url);
        
        const response = await githubAPI.get(url);
        
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        const parsedData = JSON.parse(content);
        
        // Ensure proper structure
        if (!parsedData.questions) {
            parsedData.questions = [];
        }
        
        console.log(`✅ Successfully read ${parsedData.questions.length} questions from GitHub`);
        return parsedData;
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            // File doesn't exist yet, return empty structure
            console.log('📝 Questions file not found in GitHub, starting fresh');
            return { questions: [] };
        }
        
        console.error('❌ Error reading from GitHub:', error.message);
        
        if (error.response) {
            console.error('GitHub API response:', error.response.status, error.response.data);
        }
        
        // Fallback to local file if GitHub fails
        console.log('🔄 Falling back to local storage...');
        return await readQuestionsFileLocal();
    }
}

// Write questions to GitHub
async function writeQuestionsToGitHub(questionsData) {
    try {
        console.log('💾 Saving questions to GitHub...');
        
        if (!GITHUB.token) {
            throw new Error('GitHub token not configured');
        }
        
        // Ensure proper structure
        if (!questionsData.questions) {
            questionsData.questions = [];
        }
        
        // Get current file to get SHA (required for updates)
        const getUrl = `/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.filePath}?ref=${GITHUB.branch}`;
        let sha = null;
        
        try {
            const getResponse = await githubAPI.get(getUrl);
            sha = getResponse.data.sha;
            console.log('📝 Updating existing file with SHA:', sha.substring(0, 8) + '...');
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log('📝 Creating new file in GitHub');
            } else {
                throw error;
            }
        }
        
        const content = JSON.stringify(questionsData, null, 2);
        const encodedContent = Buffer.from(content).toString('base64');
        
        const putUrl = `/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.filePath}`;
        
        const response = await githubAPI.put(putUrl, {
            message: `Update questions - ${new Date().toISOString()}`,
            content: encodedContent,
            sha: sha,
            branch: GITHUB.branch,
            committer: {
                name: 'Akhi ex responds Bot',
                email: 'bot@akhi-ex-responds.com'
            }
        });
        
        console.log('✅ Successfully saved to GitHub!');
        console.log('📊 Commit SHA:', response.data.commit.sha.substring(0, 8) + '...');
        
        // Also save locally as backup
        await writeQuestionsFileLocal(questionsData);
        
        return true;
        
    } catch (error) {
        console.error('❌ Error writing to GitHub:', error.message);
        
        if (error.response) {
            console.error('GitHub API response:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        // Fallback to local storage
        console.log('🔄 Falling back to local storage...');
        return await writeQuestionsFileLocal(questionsData);
    }
}

// ============================================
// LOCAL STORAGE FUNCTIONS (FALLBACK)
// ============================================

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        return true;
    } catch (error) {
        console.error('Error creating data directory:', error);
        return false;
    }
}

// Read questions from local file (fallback)
async function readQuestionsFileLocal() {
    try {
        await ensureDataDir();
        
        // Check if file exists
        try {
            await fs.access(QUESTIONS_FILE);
        } catch {
            // File doesn't exist, create it
            await fs.writeFile(QUESTIONS_FILE, JSON.stringify({ questions: [] }, null, 2));
            return { questions: [] };
        }
        
        const data = await fs.readFile(QUESTIONS_FILE, 'utf8');
        if (!data.trim()) {
            return { questions: [] };
        }
        
        const parsed = JSON.parse(data);
        
        // Ensure it has the right structure
        if (!parsed.questions) {
            parsed.questions = [];
        }
        
        console.log(`📖 Read ${parsed.questions.length} questions from local file`);
        return parsed;
        
    } catch (error) {
        console.error('Error reading local questions file:', error);
        return { questions: [] };
    }
}

// Write questions to local file (fallback)
async function writeQuestionsFileLocal(questionsData) {
    try {
        await ensureDataDir();
        
        // Ensure proper structure
        if (!questionsData.questions) {
            questionsData.questions = [];
        }
        
        await fs.writeFile(QUESTIONS_FILE, JSON.stringify(questionsData, null, 2));
        console.log(`💾 Saved ${questionsData.questions.length} questions to local file`);
        return true;
    } catch (error) {
        console.error('Error writing local questions file:', error);
        return false;
    }
}

// Initialize on server start
async function initializeData() {
    try {
        console.log('🚀 Initializing Akhi ex responds server...');
        
        // Try to read from GitHub first
        const data = await readQuestionsFromGitHub();
        
        console.log(`📊 Initialized with ${data.questions?.length || 0} questions`);
        console.log('✅ Server ready!');
        
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// ============================================
// API ROUTES (UPDATED FOR GITHUB STORAGE)
// ============================================

// Submit a new question
app.post('/api/submit-question', async (req, res) => {
    try {
        const { name, email, question } = req.body;
        
        if (!question || question.trim().length < 5) {
            return res.status(400).json({ 
                success: false, 
                message: 'Question must be at least 5 characters' 
            });
        }
        
        // Read questions from GitHub
        const questionsData = await readQuestionsFromGitHub();
        
        const newQuestion = {
            id: Date.now(),
            name: name || 'Anonymous',
            email: email || '',
            question: question.trim(),
            timestamp: new Date().toISOString(),
            status: 'pending',
            likes: 0,
            likedBy: [],
            answers: []
        };
        
        if (!questionsData.questions) {
            questionsData.questions = [];
        }
        
        questionsData.questions.push(newQuestion);
        
        // Save to GitHub
        const writeSuccess = await writeQuestionsToGitHub(questionsData);
        
        if (!writeSuccess) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save question' 
            });
        }
        
        res.json({
            success: true,
            message: 'Question submitted successfully',
            questionId: newQuestion.id
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// Get all questions
app.get('/api/questions', async (req, res) => {
    try {
        const questionsData = await readQuestionsFromGitHub();
        res.json(questionsData.questions || []);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// Post a reply to a question
app.post('/api/questions/:id/answer', async (req, res) => {
    try {
        const { id } = req.params;
        const { answer, author, isOwner, parentAnswerId } = req.body;
        
        if (!answer || answer.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Reply cannot be empty' 
            });
        }
        
        // Read questions from GitHub
        const questionsData = await readQuestionsFromGitHub();
        const questionIndex = questionsData.questions.findIndex(q => q.id == id);
        
        if (questionIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Question not found' 
            });
        }
        
        const newReply = {
            id: Date.now(),
            content: answer.trim(),
            author: author || 'Anonymous',
            isOwner: !!isOwner,
            date: new Date().toISOString(),
            replies: [],
            parentAnswerId: parentAnswerId || null
        };
        
        if (!questionsData.questions[questionIndex].answers) {
            questionsData.questions[questionIndex].answers = [];
        }
        
        // Helper function to add reply to parent
        const addReplyToParent = (replies, parentId, reply) => {
            for (let i = 0; i < replies.length; i++) {
                if (replies[i].id == parentId) {
                    if (!replies[i].replies) replies[i].replies = [];
                    replies[i].replies.push(reply);
                    return true;
                }
                if (replies[i].replies && replies[i].replies.length > 0) {
                    if (addReplyToParent(replies[i].replies, parentId, reply)) {
                        return true;
                    }
                }
            }
            return false;
        };
        
        let added = false;
        
        if (parentAnswerId) {
            added = addReplyToParent(
                questionsData.questions[questionIndex].answers, 
                parentAnswerId, 
                newReply
            );
        }
        
        if (!added) {
            questionsData.questions[questionIndex].answers.push(newReply);
            
            if (isOwner) {
                questionsData.questions[questionIndex].status = 'answered';
            }
        }
        
        // Save to GitHub
        const writeSuccess = await writeQuestionsToGitHub(questionsData);
        
        if (!writeSuccess) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save reply' 
            });
        }
        
        res.json({
            success: true,
            message: 'Reply posted successfully',
            reply: newReply
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// Like a question
app.post('/api/questions/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId = 'user_' + Date.now() } = req.body;
        
        // Read questions from GitHub
        const questionsData = await readQuestionsFromGitHub();
        const questionIndex = questionsData.questions.findIndex(q => q.id == id);
        
        if (questionIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Question not found' 
            });
        }
        
        const question = questionsData.questions[questionIndex];
        
        if (!question.likedBy) {
            question.likedBy = [];
        }
        
        const userIndex = question.likedBy.indexOf(userId);
        
        if (userIndex === -1) {
            question.likedBy.push(userId);
            question.likes = (question.likes || 0) + 1;
        } else {
            question.likedBy.splice(userIndex, 1);
            question.likes = Math.max(0, (question.likes || 0) - 1);
        }
        
        // Save to GitHub
        const writeSuccess = await writeQuestionsToGitHub(questionsData);
        
        if (!writeSuccess) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save like' 
            });
        }
        
        res.json({
            success: true,
            likes: question.likes,
            isLiked: userIndex === -1
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ============================================
// STATIC FILE SERVING
// ============================================

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/community', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'community.html'));
});

// Serve other HTML pages
app.get('/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    
    res.sendFile(filePath, (err) => {
        if (err) {
            res.redirect('/');
        }
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        github: {
            owner: GITHUB.owner,
            repo: GITHUB.repo,
            configured: !!GITHUB.token
        }
    });
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
    await initializeData();
    
    app.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🏠 Home: http://localhost:${PORT}`);
        console.log(`👥 Community: http://localhost:${PORT}/community`);
        console.log(`💾 Storage: GitHub (${GITHUB.owner}/${GITHUB.repo})`);
        console.log(`=========================================`);
    });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});