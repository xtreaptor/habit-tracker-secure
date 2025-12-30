const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { z } = require('zod');

const app = express();
const PORT = 3000;

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Helmet sets various HTTP headers for security
app.use(helmet());

// CORS configuration (allow Vite frontend)
app.use(cors({
    origin: 'http://localhost:5173', // Vite default port
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// Rate Limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});
app.use(limiter);

// Parse JSON bodies
app.use(express.json({ limit: '10kb' })); // Limit body size

// ==========================================
// DATABASE SETUP
// ==========================================

let db;
(async () => {
    try {
        db = await open({
            filename: './habits.db',
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                streak INTEGER DEFAULT 0,
                completed_today BOOLEAN DEFAULT 0,
                last_completed_date TEXT
            )
        `);
        console.log('Database connected and initialized.');
    } catch (err) {
        console.error('Database connection error:', err);
    }
})();

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const habitSchema = z.object({
    name: z.string().min(1, "Habit name is required").max(50, "Habit name too long").trim(),
});

// ==========================================
// ROUTES
// ==========================================

// GET /api/habits - Retrieve all habits
app.get('/api/habits', async (req, res) => {
    try {
        const habits = await db.all('SELECT * FROM habits');
        res.json(habits);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/habits - Create a new habit
app.post('/api/habits', async (req, res) => {
    try {
        // Input Validation
        const validation = habitSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: validation.error.errors });
        }

        const { name } = validation.data;
        const result = await db.run(
            'INSERT INTO habits (name, streak, completed_today, last_completed_date) VALUES (?, 0, 0, NULL)',
            name
        );

        const newHabit = await db.get('SELECT * FROM habits WHERE id = ?', result.lastID);
        res.status(201).json(newHabit);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PATCH /api/habits/:id/toggle - Toggle completion status
app.patch('/api/habits/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const habit = await db.get('SELECT * FROM habits WHERE id = ?', id);

        if (!habit) {
            return res.status(404).json({ error: 'Habit not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        let { streak, completed_today, last_completed_date } = habit;

        let newCompletedToday = !completed_today;
        let newStreak = streak;
        let newLastDate = last_completed_date;

        if (newCompletedToday) {
            // Marking as done
            if (last_completed_date !== today) {
                // Only increment streak if not already done today (logic handled by frontend check usually, but good to be safe)
                // If it was done yesterday, increment. If not, reset to 1.
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (last_completed_date === yesterdayStr) {
                    newStreak += 1;
                } else if (last_completed_date !== today) {
                    newStreak = 1; // Reset or Start new
                }
            }
            newLastDate = today;
        } else {
            // Unmarking (undo)
            if (last_completed_date === today) {
                // If we are undoing today's work, we potentially decrement streak depending on logic.
                // For simplicity MVP, we just decrement if > 0
                if (newStreak > 0) newStreak -= 1;
                newLastDate = null; // Or logic to revert to previous date (complex without history table)
                // Simplify for MVP: Just unmark. User loses streak protection if they uncheck.
            }
        }

        await db.run(
            'UPDATE habits SET completed_today = ?, streak = ?, last_completed_date = ? WHERE id = ?',
            newCompletedToday, newStreak, newLastDate, id
        );

        const updatedHabit = await db.get('SELECT * FROM habits WHERE id = ?', id);
        res.json(updatedHabit);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/habits/:id - Remove habit
app.delete('/api/habits/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM habits WHERE id = ?', id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running secure on http://localhost:${PORT}`);
});
