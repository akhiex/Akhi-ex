// server.js - COMPLETE FIXED VERSION
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log('✅ Data directory ensured');
    } catch (error) {
        console.error('Error creating data directory:', error);
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
            await writeQuestionsFile({ questions: [] });
            return { questions: [] };
        }
        
        const data = await fs.readFile(QUESTIONS_FILE, 'utf8');
        if (!data.trim()) {
            return { questions: [] };
        }
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading questions file:', error);
        return { questions: [] };
    }
}

// Write questions to file
async function writeQuestionsFile(questionsData) {
    try {
        await ensureDataDir();
        await fs.writeFile(QUESTIONS_FILE, JSON.stringify(questionsData, null, 2));
        console.log('✅ Data saved to questions.json');
        return true;
    } catch (error) {
        console.error('❌ Error writing questions file:', error);
        return false;
    }
}

// Initialize on server start
async function initializeData() {
    await ensureDataDir();
    const data = await readQuestionsFile();
    console.log(`📊 Initialized with ${data.questions?.length || 0} questions`);
}

// Add the new FAQ
function addNewFAQ() {
    return `
<div class="faq-item-3d">
    <div class="faq-question-3d">
        <span>Can Allah have a son?</span>
        <i class="fas fa-chevron-down faq-icon-3d"></i>
    </div>
    <div class="faq-answer-3d">
        <p>The concept of God having a son is strongly rejected in Islamic theology. Allah is the One and Only God, the Creator of everything, who has no partners, no equals, and no offspring.</p>

        <div class="quran-verse-glass">"Say, 'He is Allah, the One. Allah, the Eternal Refuge. He neither begets nor is born, nor is there to Him any equivalent.'" (Quran 112:1-4)</div>

        <p>This chapter of the Quran directly refutes the idea of God having a son. In Islamic belief, Jesus (peace be upon him) was a mighty prophet and messenger of God, but not divine and not the "son of God" in a literal sense. The Quran states clearly:</p>

        <div class="quran-verse-glass">"It is not befitting for Allah to take a son. Exalted is He! When He decrees a matter, He only says to it, 'Be,' and it is." (Quran 19:35)</div>

        <p>The idea of God having a son is seen as anthropomorphism — attributing human characteristics to God. Allah is beyond such human relationships. He created everything, including Jesus, by His command "Be!"</p>

        <p>For a detailed discussion on this topic, watch this video analysis:</p>
        
        <div style="text-align: center; margin: 20px 0;">
            <a href="https://youtu.be/t3a-sPh0yYQ" target="_blank" style="display: inline-flex; align-items: center; gap: 10px; padding: 15px 25px; background: rgba(0, 229, 255, 0.1); border: 1px solid var(--neon-blue); border-radius: 15px; color: var(--neon-blue); text-decoration: none; font-weight: 500; transition: all 0.3s;">
                <i class="fab fa-youtube"></i>
                Watch: "Can Allah Have a Son?" Analysis
            </a>
        </div>

        <p>The video explains how the concept of divine sonship developed historically and why it contradicts pure monotheism as understood in Islam.</p>
    </div>
</div>
`;
}

// API Routes
app.post('/api/submit-question', async (req, res) => {
    console.log('📥 SUBMIT QUESTION');
    
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
        
        console.log(`📝 New question #${newQuestion.id} by ${newQuestion.name}`);
        
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
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

app.get('/api/questions', async (req, res) => {
    console.log('📥 GET ALL QUESTIONS');
    
    try {
        const questionsData = await readQuestionsFile();
        res.json(questionsData.questions || []);
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

app.post('/api/questions/:id/answer', async (req, res) => {
    console.log('📥 POST REPLY to question:', req.params.id);
    
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
        
        console.log(`📝 New reply #${newReply.id} by ${newReply.author}`);
        
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
            added = true;
            
            if (isOwner) {
                questionsData.questions[questionIndex].status = 'answered';
            }
        }
        
        if (!added) {
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to add reply' 
            });
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
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

app.post('/api/questions/:id/like', async (req, res) => {
    console.log('❤️ LIKE QUESTION:', req.params.id);
    
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
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
    try {
        const data = await readQuestionsFile();
        res.json({
            success: true,
            message: 'Server is working!',
            questionsCount: data.questions?.length || 0,
            dataDir: DATA_DIR,
            fileExists: true
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'Test failed: ' + error.message
        });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/community', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'community.html'));
});

// Handle other pages
app.get('/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    
    res.sendFile(filePath, (err) => {
        if (err) {
            res.redirect('/');
        }
    });
});

// Start server
async function startServer() {
    await initializeData();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📁 Data directory: ${DATA_DIR}`);
        console.log(`📄 Questions file: ${QUESTIONS_FILE}`);
        console.log(`🌐 Home: http://localhost:${PORT}`);
        console.log(`💬 Community: http://localhost:${PORT}/community`);
        console.log(`🧪 Test: http://localhost:${PORT}/api/test`);
    });
}

startServer();