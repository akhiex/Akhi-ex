// server.js - PRODUCTION DEPLOYMENT VERSION
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Use project directory for data storage
const DATA_DIR = path.join(process.cwd(), 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

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

// Read questions from file
async function readQuestionsFile() {
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
        
        return parsed;
        
    } catch (error) {
        console.error('Error reading questions file:', error);
        return { questions: [] };
    }
}

// Write questions to file
async function writeQuestionsFile(questionsData) {
    try {
        await ensureDataDir();
        
        // Ensure proper structure
        if (!questionsData.questions) {
            questionsData.questions = [];
        }
        
        await fs.writeFile(QUESTIONS_FILE, JSON.stringify(questionsData, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing questions file:', error);
        return false;
    }
}

// Initialize on server start
async function initializeData() {
    await ensureDataDir();
    const data = await readQuestionsFile();
    console.log(`Initialized with ${data.questions?.length || 0} questions`);
}

// ==================== API ROUTES ====================

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
        
        const questionsData = await readQuestionsFile();
        
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
        
        const writeSuccess = await writeQuestionsFile(questionsData);
        
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
        const questionsData = await readQuestionsFile();
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
        
        const questionsData = await readQuestionsFile();
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
        
        const questionsData = await readQuestionsFile();
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
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
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

// ==================== START SERVER ====================

async function startServer() {
    await initializeData();
    
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Home: http://localhost:${PORT}`);
        console.log(`Community: http://localhost:${PORT}/community`);
    });
}

startServer();