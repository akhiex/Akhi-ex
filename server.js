// server.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Function to read questions
async function readQuestionsFile() {
    try {
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

// Function to write questions
async function writeQuestionsFile(questionsData) {
    try {
        await fs.writeFile(QUESTIONS_FILE, JSON.stringify(questionsData, null, 2));
        console.log('✅ Wrote to questions.json');
        return true;
    } catch (error) {
        console.error('❌ Error writing questions file:', error);
        return false;
    }
}

// Ensure questions.json exists
async function initializeQuestionsFile() {
    try {
        await fs.access(QUESTIONS_FILE);
    } catch {
        await writeQuestionsFile({ questions: [] });
        console.log('Created questions.json file');
    }
}

// Submit question
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
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'pending',
            likes: 0,
            likedBy: [],
            answers: []
        };
        
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
        console.error('Error submitting question:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Get all questions
app.get('/api/questions', async (req, res) => {
    try {
        const questionsData = await readQuestionsFile();
        res.json(questionsData.questions || []);
    } catch (error) {
        console.error('Error reading questions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Post reply/answer - FIXED VERSION
app.post('/api/questions/:id/answer', async (req, res) => {
    console.log('📥 REPLY REQUEST for question:', req.params.id, 'Data:', req.body);
    
    try {
        const { id } = req.params;
        const { answer, author, isOwner, parentAnswerId } = req.body;
        
        if (!answer || answer.trim().length === 0) {
            console.log('❌ Empty reply');
            return res.status(400).json({ 
                success: false, 
                message: 'Reply cannot be empty' 
            });
        }
        
        const questionsData = await readQuestionsFile();
        const questionIndex = questionsData.questions.findIndex(q => q.id == id);
        
        if (questionIndex === -1) {
            console.log('❌ Question not found:', id);
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
            replies: []
        };
        
        console.log('📝 Created new reply:', newReply);
        
        let added = false;
        
        if (parentAnswerId) {
            // Find parent reply and add to it
            console.log('🔍 Looking for parent reply:', parentAnswerId);
            
            const findAndAddToParent = (replies, parentId, newReply) => {
                for (let i = 0; i < replies.length; i++) {
                    if (replies[i].id == parentId) {
                        console.log('✅ Found parent, adding reply');
                        if (!replies[i].replies) replies[i].replies = [];
                        replies[i].replies.push(newReply);
                        return true;
                    }
                    if (replies[i].replies && replies[i].replies.length > 0) {
                        if (findAndAddToParent(replies[i].replies, parentId, newReply)) {
                            return true;
                        }
                    }
                }
                return false;
            };
            
            added = findAndAddToParent(questionsData.questions[questionIndex].answers, parentAnswerId, newReply);
            
            if (!added) {
                console.log('❌ Parent reply not found, adding as top-level');
                // If parent not found, add as top-level reply
                if (!questionsData.questions[questionIndex].answers) {
                    questionsData.questions[questionIndex].answers = [];
                }
                questionsData.questions[questionIndex].answers.push(newReply);
                added = true;
            }
        } else {
            // Add as top-level reply
            console.log('➕ Adding as top-level reply');
            if (!questionsData.questions[questionIndex].answers) {
                questionsData.questions[questionIndex].answers = [];
            }
            questionsData.questions[questionIndex].answers.push(newReply);
            added = true;
            
            // Mark as answered if owner replied
            if (isOwner) {
                questionsData.questions[questionIndex].status = 'answered';
                questionsData.questions[questionIndex].response = answer.trim();
                questionsData.questions[questionIndex].respondedAt = new Date().toISOString();
            }
        }
        
        if (!added) {
            console.log('❌ Failed to add reply anywhere');
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to add reply' 
            });
        }
        
        console.log('💾 Saving to file...');
        const writeSuccess = await writeQuestionsFile(questionsData);
        
        if (!writeSuccess) {
            console.log('❌ Failed to write to file');
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to save reply' 
            });
        }
        
        console.log('✅ Reply saved successfully');
        res.json({
            success: true,
            message: 'Reply posted successfully',
            reply: newReply
        });
        
    } catch (error) {
        console.error('❌ Error posting reply:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error: ' + error.message 
        });
    }
});

// Like/unlike question
app.post('/api/questions/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId = 'anonymous' } = req.body;
        
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
        console.error('Error liking question:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
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

// Serve other pages
app.get('/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    
    fs.access(filePath)
        .then(() => {
            res.sendFile(filePath);
        })
        .catch(() => {
            res.redirect('/');
        });
});

// Start server
async function startServer() {
    await initializeQuestionsFile();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`🏠 Home: http://localhost:${PORT}/`);
        console.log(`💬 Community: http://localhost:${PORT}/community`);
    });
}

startServer();