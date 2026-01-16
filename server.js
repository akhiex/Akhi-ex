// server.js - PRODUCTION READY VERSION
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: For hosting platforms, use temp directory or environment variable
const DATA_DIR = process.env.DATA_DIR || 
                 path.join(os.tmpdir(), 'akhi-ex-responds-data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Log startup information (helpful for debugging)
console.log('🚀 Akhi ex responds Server Starting...');
console.log('📁 Data Directory:', DATA_DIR);
console.log('📄 Questions File:', QUESTIONS_FILE);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
console.log('🌐 Port:', PORT);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Ensure data directory exists with proper permissions
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Set appropriate permissions
        if (process.platform !== 'win32') {
            try {
                await fs.chmod(DATA_DIR, 0o755);
            } catch (chmodError) {
                // Permission change not critical
            }
        }
        
        console.log('✅ Data directory ready:', DATA_DIR);
        return true;
    } catch (error) {
        console.error('❌ Error creating data directory:', error.message);
        return false;
    }
}

// Read questions from file
async function readQuestionsFile() {
    try {
        await ensureDataDir();
        
        // Check if file exists
        try {
            await fs.access(QUESTIONS_FILE);
        } catch {
            // File doesn't exist, create it with empty array
            await fs.writeFile(QUESTIONS_FILE, JSON.stringify({ questions: [] }, null, 2));
            return { questions: [] };
        }
        
        const data = await fs.readFile(QUESTIONS_FILE, 'utf8');
        if (!data.trim()) {
            return { questions: [] };
        }
        
        const parsed = JSON.parse(data);
        // Ensure the structure is correct
        if (!parsed.questions) {
            parsed.questions = [];
        }
        return parsed;
        
    } catch (error) {
        console.error('Error reading questions file:', error.message);
        return { questions: [] };
    }
}

// Write questions to file with error recovery
async function writeQuestionsFile(questionsData) {
    try {
        // Ensure data directory exists
        if (!(await ensureDataDir())) {
            console.error('Cannot write: Data directory not available');
            return false;
        }
        
        // Ensure data structure is correct
        if (!questionsData.questions) {
            questionsData.questions = [];
        }
        
        // Write to file
        await fs.writeFile(QUESTIONS_FILE, JSON.stringify(questionsData, null, 2));
        console.log('✅ Data saved successfully to:', QUESTIONS_FILE);
        return true;
        
    } catch (error) {
        console.error('❌ Error writing questions file:', error.message);
        
        // Try fallback location as last resort
        try {
            const fallbackDir = path.join(__dirname, 'data_fallback');
            await fs.mkdir(fallbackDir, { recursive: true });
            const fallbackFile = path.join(fallbackDir, 'questions.json');
            await fs.writeFile(fallbackFile, JSON.stringify(questionsData, null, 2));
            console.log('📦 Saved to fallback location:', fallbackFile);
            return true;
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError.message);
            return false;
        }
    }
}

// Initialize on server start
async function initializeData() {
    try {
        const data = await readQuestionsFile();
        console.log(`📊 Initialized with ${data.questions?.length || 0} questions`);
        return true;
    } catch (error) {
        console.error('Initialization error:', error.message);
        return false;
    }
}

// ==================== API ROUTES ====================

// Submit a new question
app.post('/api/submit-question', async (req, res) => {
    try {
        const { name, email, question } = req.body;
        
        // Validation
        if (!question || question.trim().length < 5) {
            return res.status(400).json({ 
                success: false, 
                message: 'Question must be at least 5 characters' 
            });
        }
        
        const questionsData = await readQuestionsFile();
        
        const newQuestion = {
            id: Date.now(),
            name: name?.trim() || 'Anonymous',
            email: email?.trim() || '',
            question: question.trim(),
            timestamp: new Date().toISOString(),
            status: 'pending',
            likes: 0,
            likedBy: [],
            answers: []
        };
        
        console.log(`📝 New question #${newQuestion.id} from ${newQuestion.name}`);
        
        // Add to questions array
        if (!Array.isArray(questionsData.questions)) {
            questionsData.questions = [];
        }
        questionsData.questions.push(newQuestion);
        
        // Save to file
        const writeSuccess = await writeQuestionsFile(questionsData);
        
        if (!writeSuccess) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save question to storage' 
            });
        }
        
        res.json({
            success: true,
            message: 'Question submitted successfully',
            questionId: newQuestion.id
        });
        
    } catch (error) {
        console.error('Submit question error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// Get all questions
app.get('/api/questions', async (req, res) => {
    try {
        const questionsData = await readQuestionsFile();
        // Return newest questions first
        const questions = Array.isArray(questionsData.questions) 
            ? questionsData.questions.sort((a, b) => b.id - a.id)
            : [];
        
        res.json(questions);
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to load questions' 
        });
    }
});

// Post a reply/answer to a question
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
        
        const questionsData = await readQuestionsFile();
        
        // Find the question
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
            author: author?.trim() || 'Anonymous',
            isOwner: !!isOwner,
            date: new Date().toISOString(),
            replies: [],
            parentAnswerId: parentAnswerId || null
        };
        
        console.log(`📝 New reply #${newReply.id} from ${newReply.author}`);
        
        // Initialize answers array if needed
        if (!Array.isArray(questionsData.questions[questionIndex].answers)) {
            questionsData.questions[questionIndex].answers = [];
        }
        
        // Helper to add nested replies
        const addReplyToParent = (replies, parentId, reply) => {
            for (let i = 0; i < replies.length; i++) {
                if (replies[i].id == parentId) {
                    if (!Array.isArray(replies[i].replies)) {
                        replies[i].replies = [];
                    }
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
        
        // Add as nested reply if parentAnswerId is provided
        if (parentAnswerId) {
            added = addReplyToParent(
                questionsData.questions[questionIndex].answers, 
                parentAnswerId, 
                newReply
            );
        }
        
        // If not added as nested, add as top-level reply
        if (!added) {
            questionsData.questions[questionIndex].answers.push(newReply);
            
            // Mark as answered if owner replied
            if (isOwner) {
                questionsData.questions[questionIndex].status = 'answered';
            }
        }
        
        // Save to file
        const writeSuccess = await writeQuestionsFile(questionsData);
        
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
        console.error('Post reply error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// Like a question
app.post('/api/questions/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId = 'user_' + Date.now() } = req.body;
        
        const questionsData = await readQuestionsFile();
        const questionIndex = questionsData.questions.findIndex(q => q.id == id);
        
        if (questionIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Question not found' 
            });
        }
        
        const question = questionsData.questions[questionIndex];
        
        // Initialize likedBy array
        if (!Array.isArray(question.likedBy)) {
            question.likedBy = [];
        }
        
        const userIndex = question.likedBy.indexOf(userId);
        
        // Toggle like
        if (userIndex === -1) {
            question.likedBy.push(userId);
            question.likes = (question.likes || 0) + 1;
        } else {
            question.likedBy.splice(userIndex, 1);
            question.likes = Math.max(0, (question.likes || 0) - 1);
        }
        
        // Save to file
        const writeSuccess = await writeQuestionsFile(questionsData);
        
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
        console.error('Like question error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ==================== HEALTH & STATUS ENDPOINTS ====================

// Simple health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        dataDir: DATA_DIR,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Status check with file system verification
app.get('/api/status', async (req, res) => {
    try {
        const questionsData = await readQuestionsFile();
        const questionCount = Array.isArray(questionsData.questions) 
            ? questionsData.questions.length 
            : 0;
        
        res.json({
            success: true,
            status: 'operational',
            data: {
                questionsCount: questionCount,
                dataDir: DATA_DIR,
                questionsFile: QUESTIONS_FILE,
                writable: true,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.json({
            success: false,
            status: 'degraded',
            error: error.message,
            dataDir: DATA_DIR
        });
    }
});

// ==================== STATIC FILE SERVING ====================

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

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== ERROR HANDLING ====================

// Global error handler
app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==================== SERVER STARTUP ====================

async function startServer() {
    try {
        // Initialize data
        await initializeData();
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🎯 Server running on port ${PORT}`);
            console.log(`🌐 Homepage: http://localhost:${PORT}`);
            console.log(`💬 Community: http://localhost:${PORT}/community`);
            console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
            console.log(`📊 Status: http://localhost:${PORT}/api/status`);
            console.log('===========================================');
        });
        
        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            process.exit(0);
        });
        
        process.on('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();